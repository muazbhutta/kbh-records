import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Session } from '@supabase/supabase-js';
import { useQueryClient } from '@tanstack/react-query';
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import { callFunction, isSupabaseConfigured, supabase } from '@/lib/supabase';
import { isManager, type Person } from '@/types';

type Status = 'loading' | 'needs-owner' | 'signed-out' | 'signed-in';

type LoginResult = { session: Session; person: Person };

type AuthValue = {
  status: Status;
  person: Person | null;
  session: Session | null;
  /** True for Admin and Sub-admin. */
  canManage: boolean;
  login: (mobile: string, pin: string) => Promise<void>;
  createOwner: (input: {
    fullName: string;
    mobile: string;
    pin: string;
    jobTitle?: string;
  }) => Promise<void>;
  logout: () => Promise<void>;
  refreshPerson: () => Promise<void>;
  recheckSetup: () => Promise<void>;
};

const AuthContext = createContext<AuthValue | null>(null);

const PERSON_COLUMNS =
  'id, full_name, mobile, role, is_owner, is_active, job_title, is_head, head_id, created_at';

/** Last known profile, so a phone with no signal still opens the app. */
const PERSON_CACHE_KEY = 'kbh-person';

async function cachePerson(person: Person | null) {
  try {
    if (person) await AsyncStorage.setItem(PERSON_CACHE_KEY, JSON.stringify(person));
    else await AsyncStorage.removeItem(PERSON_CACHE_KEY);
  } catch {
    /* storage is a convenience, never a requirement */
  }
}

async function readCachedPerson(userId: string): Promise<Person | null> {
  try {
    const raw = await AsyncStorage.getItem(PERSON_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Person;
    return parsed?.id === userId ? parsed : null;
  } catch {
    return null;
  }
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<Status>('loading');
  const [person, setPerson] = useState<Person | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const queryClient = useQueryClient();
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  /**
   * Loads the app_users row that belongs to a session. A read that simply
   * fails (no signal on site) is not the same thing as an account that has
   * been turned off, so the two are kept apart: only a successful read with
   * no row means "you are out".
   */
  const loadPerson = useCallback(
    async (next: Session): Promise<{ ok: true; person: Person | null } | { ok: false }> => {
      const { data, error } = await supabase
        .from('app_users')
        .select(PERSON_COLUMNS)
        .eq('id', next.user.id)
        .maybeSingle();

      if (error) {
        console.warn('could not load profile', error.message);
        return { ok: false };
      }
      return { ok: true, person: (data as Person) ?? null };
    },
    [],
  );

  /** Asks the server whether the very first Owner still has to be made. */
  const checkSetup = useCallback(async () => {
    try {
      const res = await callFunction<{ needsOwner: boolean }>('pin-auth', { action: 'status' });
      return res.needsOwner;
    } catch {
      // Offline on a fresh device: assume somebody already set this up.
      // The login screen shows the real error when they try.
      return false;
    }
  }, []);

  const settle = useCallback(
    async (next: Session | null) => {
      if (!next) {
        const needsOwner = await checkSetup();
        if (!mounted.current) return;
        setSession(null);
        setPerson(null);
        cachePerson(null);
        setStatus(needsOwner ? 'needs-owner' : 'signed-out');
        return;
      }

      const result = await loadPerson(next);
      if (!mounted.current) return;

      if (!result.ok) {
        // Server unreachable. Fall back to the profile we saw last time so
        // the app still opens on a site with no signal.
        const cached = await readCachedPerson(next.user.id);
        if (!mounted.current) return;
        if (cached) {
          setSession(next);
          setPerson(cached);
          setStatus('signed-in');
        } else {
          setSession(null);
          setPerson(null);
          setStatus('signed-out');
        }
        return;
      }

      if (!result.person || !result.person.is_active) {
        // Account was turned off while the session was still on the device.
        await supabase.auth.signOut();
        if (!mounted.current) return;
        setSession(null);
        setPerson(null);
        cachePerson(null);
        setStatus('signed-out');
        return;
      }

      setSession(next);
      setPerson(result.person);
      cachePerson(result.person);
      setStatus('signed-in');
    },
    [checkSetup, loadPerson],
  );

  // First run: restore whatever session is on the device.
  useEffect(() => {
    let cancelled = false;

    (async () => {
      if (!isSupabaseConfigured) {
        if (!cancelled) setStatus('signed-out');
        return;
      }
      const { data } = await supabase.auth.getSession();
      if (cancelled) return;
      await settle(data.session ?? null);
    })();

    const { data: sub } = supabase.auth.onAuthStateChange((event, next) => {
      if (event === 'SIGNED_OUT') {
        setSession(null);
        setPerson(null);
        cachePerson(null);
        setStatus('signed-out');
        queryClient.clear();
        return;
      }
      if (event === 'TOKEN_REFRESHED' || event === 'USER_UPDATED') {
        setSession(next ?? null);
      }
    });

    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
    // Runs once; settle and queryClient are stable for the app's lifetime.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const adoptSession = useCallback(
    async (result: LoginResult) => {
      const { error } = await supabase.auth.setSession({
        access_token: result.session.access_token,
        refresh_token: result.session.refresh_token,
      });
      if (error) throw error;

      queryClient.clear();
      setSession(result.session);
      setPerson(result.person);
      cachePerson(result.person);
      setStatus('signed-in');
    },
    [queryClient],
  );

  const login = useCallback(
    async (mobile: string, pin: string) => {
      const result = await callFunction<LoginResult>('pin-auth', {
        action: 'login',
        mobile,
        pin,
      });
      await adoptSession(result);
    },
    [adoptSession],
  );

  const createOwner = useCallback(
    async (input: { fullName: string; mobile: string; pin: string; jobTitle?: string }) => {
      const result = await callFunction<LoginResult>('pin-auth', {
        action: 'bootstrap-owner',
        ...input,
      });
      await adoptSession(result);
    },
    [adoptSession],
  );

  const logout = useCallback(async () => {
    await supabase.auth.signOut();
    queryClient.clear();
    cachePerson(null);
    setSession(null);
    setPerson(null);
    setStatus('signed-out');
  }, [queryClient]);

  const refreshPerson = useCallback(async () => {
    const { data } = await supabase.auth.getSession();
    await settle(data.session ?? null);
  }, [settle]);

  const recheckSetup = useCallback(async () => {
    const needsOwner = await checkSetup();
    setStatus((current) =>
      current === 'signed-in' ? current : needsOwner ? 'needs-owner' : 'signed-out',
    );
  }, [checkSetup]);

  const value = useMemo<AuthValue>(
    () => ({
      status,
      person,
      session,
      canManage: isManager(person?.role),
      login,
      createOwner,
      logout,
      refreshPerson,
      recheckSetup,
    }),
    [status, person, session, login, createOwner, logout, refreshPerson, recheckSetup],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
