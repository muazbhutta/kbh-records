import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { refreshTheBooks } from '@/lib/queryClient';

import { queryKeys } from '@/lib/queryClient';
import { callFunction, supabase } from '@/lib/supabase';
import type { PeopleRow, Person, Role } from '@/types';

const LIST_COLUMNS =
  'id, full_name, mobile, role, is_owner, is_active, job_title, is_head, head_id, head_name, team_count, created_at, disabled_at, created_by_name, money_given, transfers_in, transfers_out, expenses, returned, balance, entry_count, last_entry_at, check_count, short_count, total_short, total_extra, last_checked_at, last_check_difference, last_check_result';

/**
 * Builds the PostgREST `or` filter for the search box.
 * Numbers are matched against the stored 966... form, so typing the number
 * the way people actually know it ("0502 223") still finds the person.
 */
function searchTerm(search: string): string | null {
  // These characters have a meaning inside a PostgREST filter list.
  const raw = search.trim().replace(/[,().%*]/g, ' ').replace(/\s+/g, ' ').trim();
  if (!raw) return null;

  const filters = [`full_name.ilike.%${raw}%`];

  let digits = raw.replace(/\D/g, '');
  if (digits) {
    if (digits.startsWith('00966')) digits = digits.slice(5);
    else if (digits.startsWith('966')) digits = digits.slice(3);
    else if (digits.startsWith('0')) digits = digits.slice(1);
    if (digits) filters.push(`mobile.ilike.%${digits}%`);
  }

  return filters.join(',');
}

export function usePeople(options: { search?: string; showDisabled?: boolean } = {}) {
  const { search = '', showDisabled = false } = options;

  return useQuery({
    queryKey: queryKeys.people(search, showDisabled),
    queryFn: async (): Promise<PeopleRow[]> => {
      let q = supabase.from('people_list').select(LIST_COLUMNS);

      if (!showDisabled) q = q.eq('is_active', true);

      const term = searchTerm(search);
      if (term) q = q.or(term);

      const { data, error } = await q
        .order('is_active', { ascending: false })
        .order('is_owner', { ascending: false })
        .order('full_name', { ascending: true });

      if (error) throw new Error(error.message);
      return (data ?? []) as PeopleRow[];
    },
  });
}

export function usePerson(id: string | undefined) {
  return useQuery({
    queryKey: queryKeys.person(id ?? 'none'),
    enabled: !!id,
    queryFn: async (): Promise<PeopleRow | null> => {
      const { data, error } = await supabase
        .from('people_list')
        .select(LIST_COLUMNS)
        .eq('id', id!)
        .maybeSingle();
      if (error) throw new Error(error.message);
      return (data as PeopleRow) ?? null;
    },
  });
}

/**
 * Adding somebody, changing a role or turning a person off reaches the
 * dashboard, the teams and the projects alike, so it refreshes all of it.
 */
function useInvalidatePeople() {
  const qc = useQueryClient();
  return (_id?: string) => refreshTheBooks(qc);
}

export type NewPersonInput = {
  fullName: string;
  mobile: string;
  role: Role;
  pin: string;
  jobTitle?: string;
  isHead?: boolean;
  headId?: string | null;
};

export function useCreatePerson() {
  const invalidate = useInvalidatePeople();
  return useMutation({
    mutationFn: async (input: NewPersonInput) => {
      const res = await callFunction<{ person: Person }>('manage-users', {
        action: 'create',
        ...input,
      });
      return res.person;
    },
    onSuccess: (person) => invalidate(person.id),
  });
}

export type UpdatePersonInput = {
  userId: string;
  fullName?: string;
  mobile?: string;
  role?: Role;
  jobTitle?: string | null;
  isHead?: boolean;
  headId?: string | null;
};

export function useUpdatePerson() {
  const invalidate = useInvalidatePeople();
  return useMutation({
    mutationFn: async (input: UpdatePersonInput) => {
      const res = await callFunction<{ person: Person }>('manage-users', {
        action: 'update',
        ...input,
      });
      return res.person;
    },
    onSuccess: (person) => invalidate(person.id),
  });
}

export function useResetPin() {
  return useMutation({
    mutationFn: async (input: { userId: string; pin: string }) => {
      await callFunction<{ ok: true }>('manage-users', { action: 'reset-pin', ...input });
    },
  });
}

export function useSetActive() {
  const invalidate = useInvalidatePeople();
  return useMutation({
    mutationFn: async (input: { userId: string; isActive: boolean }) => {
      const res = await callFunction<{ person: Person }>('manage-users', {
        action: 'set-active',
        ...input,
      });
      return res.person;
    },
    onSuccess: (person) => invalidate(person.id),
  });
}

/**
 * Everybody who has been handed the wages.
 *
 * Asked of app_users on its own rather than added to the people_list
 * view: that view is long and shared, and rewriting it to carry one
 * flag is a wide change for a narrow need.
 */
export function usePayrollKeepers(enabled = true) {
  return useQuery({
    queryKey: ['payroll-keepers'],
    enabled,
    queryFn: async (): Promise<Set<string>> => {
      const { data, error } = await supabase
        .from('app_users')
        .select('id')
        .eq('can_payroll', true);
      if (error) throw new Error(error.message);
      return new Set((data ?? []).map((r) => r.id as string));
    },
  });
}

/**
 * Hand the wages to somebody, or take them back.
 *
 * It opens the Salaries section and attendance for them and nothing
 * else - not the khatas, not the reports, not the people. Only an
 * Admin may, and never to themselves.
 */
export function useSetPayrollRight() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { userId: string; can: boolean }): Promise<void> => {
      const { error } = await supabase.rpc('set_payroll_right', {
        p_user_id: input.userId,
        p_can: input.can,
      });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => refreshTheBooks(qc),
  });
}
