import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { refreshTheBooks } from '@/lib/queryClient';
import { supabase } from '@/lib/supabase';
import type { EntryRefusal, RefusedEntry } from '@/types';

/**
 * The other half of the office's tickets.
 *
 * A ticket is the office being told about a man's entry. These are the
 * man being told what the office decided about it - and they are kept
 * apart on purpose, because the two lists answer to different people
 * and must never leak into one another.
 */

function useRefresh() {
  const qc = useQueryClient();
  return () => refreshTheBooks(qc);
}

/** The entries of mine that were refused, newest first, with the reason. */
export function useMyRefusals(limit = 50, enabled = true) {
  return useQuery({
    queryKey: ['refusals', 'mine', limit],
    enabled,
    queryFn: async (): Promise<RefusedEntry[]> => {
      const { data, error } = await supabase.rpc('my_refused_entries', { p_limit: limit });
      if (error) throw new Error(error.message);
      return (data ?? []) as RefusedEntry[];
    },
  });
}

/** How many of them I have not read yet. */
export function useMyRefusedCount(enabled = true) {
  return useQuery({
    queryKey: ['refusals', 'count'],
    enabled,
    queryFn: async (): Promise<number> => {
      const { data, error } = await supabase.rpc('my_refused_count');
      if (error) throw new Error(error.message);
      return Number(data ?? 0);
    },
  });
}

/** I have read it. */
export function useMarkRefusalSeen() {
  const refresh = useRefresh();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.rpc('mark_refusal_seen', { p_id: id });
      if (error) throw new Error(error.message);
    },
    onSuccess: refresh,
  });
}

/** Whether one entry was refused, for the screen that shows it. */
export function useEntryRefusal(id: string | undefined, enabled = true) {
  return useQuery({
    queryKey: ['refusals', 'entry', id],
    enabled: !!id && enabled,
    queryFn: async (): Promise<EntryRefusal | null> => {
      const { data, error } = await supabase.rpc('entry_refusal', { p_id: id! });
      if (error) throw new Error(error.message);
      const row = ((data ?? []) as EntryRefusal[])[0];
      return row ?? null;
    },
  });
}
