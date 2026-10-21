import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { refreshTheBooks } from '@/lib/queryClient';
import { supabase } from '@/lib/supabase';
import type { Ticket, WaitingChange } from '@/types';

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

/**
 * Corrections an employee has asked for and nobody has answered.
 *
 * These are the ones that matter most: until one is answered the books
 * are saying something somebody has told us is wrong.
 */
export function useWaitingChanges(enabled = true) {
  return useQuery({
    queryKey: ['tickets', 'changes'],
    enabled,
    queryFn: async (): Promise<WaitingChange[]> => {
      const { data, error } = await supabase.rpc('waiting_changes', { p_limit: 50 });
      if (error) throw new Error(error.message);
      return (data ?? []) as WaitingChange[];
    },
  });
}

/** Approving applies the change for real. Refusing leaves the books alone. */
export function useDecideChange() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      approve,
      note,
    }: {
      id: number;
      approve: boolean;
      note?: string;
    }): Promise<void> => {
      const { error } = await supabase.rpc('decide_entry_change', {
        p_id: id,
        p_approve: approve,
        p_note: note ?? undefined,
      });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => refreshTheBooks(qc),
  });
}

/** Ask for a correction. Nothing in the books moves until it is approved. */
export function useRequestChange() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      entryId: string;
      reason: string;
      amount?: number;
      billDate?: string;
      categoryId?: string;
      note?: string | null;
    }): Promise<void> => {
      const { error } = await supabase.rpc('request_entry_change', {
        p_entry_id: input.entryId,
        p_reason: input.reason,
        p_amount: input.amount ?? undefined,
        p_bill_date: input.billDate ?? undefined,
        p_category_id: input.categoryId ?? undefined,
        p_note: input.note ?? undefined,
        p_clear_note: input.note === null || input.note === '',
      });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => refreshTheBooks(qc),
  });
}
