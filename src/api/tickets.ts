import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { refreshTheBooks } from '@/lib/queryClient';
import { supabase } from '@/lib/supabase';
import type { Ticket } from '@/types';

/**
 * The tickets: one raised for every entry recorded and every entry
 * changed, cleared by an Admin saying it looks right.
 *
 * The database raises them in a trigger, so this is only the window
 * onto them. Nothing here can cause one to be missed.
 */

export function useOpenTickets(enabled = true, limit = 50) {
  return useQuery({
    queryKey: ['tickets', 'open', limit],
    enabled,
    queryFn: async (): Promise<Ticket[]> => {
      const { data, error } = await supabase.rpc('open_tickets', { p_limit: limit });
      if (error) throw new Error(error.message);
      return (data ?? []) as Ticket[];
    },
  });
}

/** How many are still asking, for the number beside the heading. */
export function useOpenTicketCount(enabled = true) {
  return useQuery({
    queryKey: ['tickets', 'count'],
    enabled,
    queryFn: async (): Promise<number> => {
      const { data, error } = await supabase.rpc('open_ticket_count');
      if (error) throw new Error(error.message);
      return Number(data ?? 0);
    },
  });
}

/** "Looks right." */
export function useMarkTicketSeen() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: number): Promise<void> => {
      const { error } = await supabase.rpc('mark_ticket_seen', { p_id: id });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => refreshTheBooks(qc),
  });
}
