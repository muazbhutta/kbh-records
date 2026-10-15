import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

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

function useInvalidatePeople() {
  const qc = useQueryClient();
  return (id?: string) => {
    qc.invalidateQueries({ queryKey: ['people'] });
    if (id) qc.invalidateQueries({ queryKey: queryKeys.person(id) });
  };
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
