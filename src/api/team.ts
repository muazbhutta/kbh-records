import { useQuery } from '@tanstack/react-query';

import { supabase } from '@/lib/supabase';
import type { Totals } from '@/types';

/**
 * The people under one head.
 *
 * A head is an employee, so he cannot read the People list - that holds
 * mobile numbers, roles and check history he has no business with. He
 * reads two narrower things instead: the plain name list, which everyone
 * can see, and the totals, which the database now shows him for his own
 * team and for nobody else.
 */
export type TeamMember = Totals & {
  id: string;
  full_name: string;
  is_active: boolean;
};

const EMPTY: Totals = {
  money_given: 0,
  transfers_in: 0,
  transfers_out: 0,
  expenses: 0,
  returned: 0,
  in_cash: 0,
  in_transfer: 0,
  out_cash: 0,
  out_transfer: 0,
  balance: 0,
  entry_count: 0,
};

const TOTAL_COLUMNS =
  'person_id, money_given, transfers_in, transfers_out, expenses, returned, in_cash, in_transfer, out_cash, out_transfer, balance, entry_count';

async function loadTeam(headId: string): Promise<TeamMember[]> {
  const { data: names, error: nameError } = await supabase
    .from('people_names')
    .select('id, full_name, is_active, head_id')
    .eq('head_id', headId)
    .order('full_name');
  if (nameError) throw new Error(nameError.message);

  const people = (names ?? []).filter((p) => p.is_active);
  if (people.length === 0) return [];

  const { data: totals, error: totalError } = await supabase
    .from('person_totals')
    .select(TOTAL_COLUMNS)
    .in(
      'person_id',
      people.map((p) => p.id),
    );
  if (totalError) throw new Error(totalError.message);

  const byId = new Map((totals ?? []).map((t) => [t.person_id, t]));
  return people.map((p) => ({
    id: p.id,
    full_name: p.full_name,
    is_active: p.is_active,
    ...EMPTY,
    ...(byId.get(p.id) ?? {}),
  })) as TeamMember[];
}

export function useMyTeam() {
  return useQuery({
    queryKey: ['my-team'],
    queryFn: async (): Promise<TeamMember[]> => {
      const { data } = await supabase.auth.getUser();
      const id = data.user?.id;
      if (!id) return [];
      return loadTeam(id);
    },
  });
}

/** One person on the team, for the head to look at. */
export function useTeamMember(personId: string | undefined) {
  return useQuery({
    queryKey: ['team-member', personId],
    enabled: !!personId,
    queryFn: async (): Promise<TeamMember | null> => {
      const { data: auth } = await supabase.auth.getUser();
      const meId = auth.user?.id;
      if (!meId) return null;

      const { data: name, error: nameError } = await supabase
        .from('people_names')
        .select('id, full_name, is_active, head_id')
        .eq('id', personId!)
        .maybeSingle();
      if (nameError) throw new Error(nameError.message);
      if (!name) return null;

      // Everyone can read the plain name list, so the name alone proves
      // nothing. Only a person who actually works under this head may be
      // opened here, or the page would put a stranger's name under the
      // words "Under you".
      if (name.head_id !== meId) return null;

      const { data: totals, error: totalError } = await supabase
        .from('person_totals')
        .select(TOTAL_COLUMNS)
        .eq('person_id', personId!)
        .maybeSingle();
      if (totalError) throw new Error(totalError.message);

      return {
        id: name.id,
        full_name: name.full_name,
        is_active: name.is_active,
        ...EMPTY,
        ...(totals ?? {}),
      } as TeamMember;
    },
  });
}
