import { useQuery } from '@tanstack/react-query';

import { supabase } from '@/lib/supabase';
import type { Range } from '@/api/dashboard';
import type { CashHolder, PersonShare, DayShare, FigureKind } from '@/types';

/**
 * Opening up one of the figures on the dashboard.
 *
 * A figure answers "how much". These two answer the questions that come
 * straight after it: who, and on what day. Both count exactly what the
 * figure counts, so the parts always add back up to the whole.
 */

export function useBreakdownByPerson(kind: FigureKind, range: Range, enabled = true) {
  return useQuery({
    queryKey: ['breakdown', 'person', kind, range],
    enabled,
    queryFn: async (): Promise<PersonShare[]> => {
      const { data, error } = await supabase.rpc('breakdown_by_person', {
        p_type: kind,
        p_from: range.from ?? undefined,
        p_to: range.to ?? undefined,
      });
      if (error) throw new Error(error.message);
      return (data ?? []) as PersonShare[];
    },
  });
}

export function useBreakdownByDate(
  kind: FigureKind,
  personId: string | undefined,
  range: Range,
  enabled = true,
) {
  return useQuery({
    queryKey: ['breakdown', 'date', kind, personId, range],
    enabled: enabled && !!personId,
    queryFn: async (): Promise<DayShare[]> => {
      const { data, error } = await supabase.rpc('breakdown_by_date', {
        p_type: kind,
        p_person_id: personId!,
        p_from: range.from ?? undefined,
        p_to: range.to ?? undefined,
      });
      if (error) throw new Error(error.message);
      return (data ?? []) as DayShare[];
    },
  });
}

/**
 * Who is holding company cash right now. Not a period figure: this is
 * what is in people's hands at this moment, which is why it takes no
 * dates.
 */
export function useCashWithPeople(enabled = true) {
  return useQuery({
    queryKey: ['breakdown', 'cash-with-people'],
    enabled,
    queryFn: async (): Promise<CashHolder[]> => {
      const { data, error } = await supabase.rpc('cash_with_people');
      if (error) throw new Error(error.message);
      return (data ?? []) as CashHolder[];
    },
  });
}
