import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { supabase } from '@/lib/supabase';
import type { SuspectedDuplicate } from '@/types';

const COLUMNS =
  'id, system_id, amount, bill_date, entered_at, note, expense_type, person_id, person_name, entered_by_name, category_name, thumb_path, other_id, other_system_id, other_amount, other_bill_date, other_entered_at, other_note, other_person_name, other_category_name, other_thumb_path';

/** Expenses waiting on an Admin to say duplicate or not. */
export function useSuspectedDuplicates(enabled = true) {
  return useQuery({
    queryKey: ['duplicates'],
    enabled,
    queryFn: async (): Promise<SuspectedDuplicate[]> => {
      const { data, error } = await supabase
        .from('suspected_duplicates')
        .select(COLUMNS)
        .order('entered_at', { ascending: false })
        .limit(100);
      if (error) throw new Error(error.message);
      return (data ?? []) as SuspectedDuplicate[];
    },
  });
}

export function useResolveDuplicate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      id: string;
      action: 'cancel' | 'not_duplicate';
      reason?: string;
    }) => {
      const { error } = await supabase.rpc('resolve_duplicate', {
        p_id: input.id,
        p_action: input.action,
        p_reason: input.reason,
      });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      // Cancelling puts the money back, so the balances move too.
      for (const key of [
        'duplicates',
        'entry-feed',
        'entry-recent',
        'entry',
        'totals',
        'people',
        'person',
        'dashboard',
        'audit',
        'to-check',
      ]) {
        qc.invalidateQueries({ queryKey: [key] });
      }
    },
  });
}
