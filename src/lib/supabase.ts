import 'react-native-url-polyfill/auto';

import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { Platform } from 'react-native';

import type { Database } from '@/lib/database.types';

export const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';
export const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '';

/** True when .env has not been filled in yet, so we can say so plainly. */
export const isSupabaseConfigured =
  SUPABASE_URL.startsWith('http') && SUPABASE_ANON_KEY.length > 20;

const webStorage = {
  getItem: (key: string) => {
    try {
      return Promise.resolve(globalThis.localStorage?.getItem(key) ?? null);
    } catch {
      return Promise.resolve(null);
    }
  },
  setItem: (key: string, value: string) => {
    try {
      globalThis.localStorage?.setItem(key, value);
    } catch {
      /* private window - the session just will not survive a reload */
    }
    return Promise.resolve();
  },
  removeItem: (key: string) => {
    try {
      globalThis.localStorage?.removeItem(key);
    } catch {
      /* ignore */
    }
    return Promise.resolve();
  },
};

export const supabase: SupabaseClient<Database> = createClient<Database>(
  SUPABASE_URL || 'https://placeholder.supabase.co',
  SUPABASE_ANON_KEY || 'placeholder-anon-key',
  {
    auth: {
      // The session is kept on the device so people stay logged in
      // until they press Log out.
      storage: Platform.OS === 'web' ? webStorage : AsyncStorage,
      storageKey: 'kbh-rms-session',
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false,
    },
    global: {
      headers: { 'x-kbh-client': `kbh-rms/${Platform.OS}` },
    },
  },
);

export type EdgeError = { code: string; message: string; [key: string]: unknown };

export class EdgeFunctionError extends Error {
  code: string;
  details: Record<string, unknown>;

  constructor(error: EdgeError) {
    super(error.message || 'Something went wrong.');
    this.name = 'EdgeFunctionError';
    this.code = error.code || 'unknown';
    this.details = error;
  }
}

/**
 * Calls one of our Edge Functions and turns its {error:{code,message}}
 * body into a thrown EdgeFunctionError, so screens only deal with
 * try / catch and a readable message.
 */
export async function callFunction<T>(
  name: 'pin-auth' | 'manage-users',
  body: Record<string, unknown>,
): Promise<T> {
  if (!isSupabaseConfigured) {
    throw new EdgeFunctionError({
      code: 'not_configured',
      message:
        'This app is not connected to its database yet. Add EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY to the .env file.',
    });
  }

  const { data, error } = await supabase.functions.invoke(name, { body });

  if (error) {
    // Supabase wraps non-2xx responses; dig the real message back out.
    const response = (error as { context?: Response }).context;
    if (response && typeof response.json === 'function') {
      try {
        const parsed = await response.json();
        if (parsed?.error) throw new EdgeFunctionError(parsed.error as EdgeError);
      } catch (inner) {
        if (inner instanceof EdgeFunctionError) throw inner;
      }
    }
    throw new EdgeFunctionError({
      code: 'network',
      message: 'No internet connection. Please try again.',
    });
  }

  if (data && typeof data === 'object' && 'error' in data) {
    throw new EdgeFunctionError((data as { error: EdgeError }).error);
  }

  return data as T;
}

export function errorMessage(err: unknown): string {
  if (err instanceof EdgeFunctionError) return err.message;
  if (err instanceof Error && err.message) return err.message;
  return 'Something went wrong. Please try again.';
}
