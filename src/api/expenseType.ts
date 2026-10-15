import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { supabase } from '@/lib/supabase';
import type {
  ExpenseKind,
  InvoiceDetails,
  InvoiceDuplicate,
  ToCheckRow,
} from '@/types';

function useRefresh() {
  const qc = useQueryClient();
  return () => {
    qc.invalidateQueries({ queryKey: ['entry-feed'] });
    qc.invalidateQueries({ queryKey: ['entry-recent'] });
    qc.invalidateQueries({ queryKey: ['entry'] });
    qc.invalidateQueries({ queryKey: ['to-check'] });
    qc.invalidateQueries({ queryKey: ['invoice-details'] });
    qc.invalidateQueries({ queryKey: ['audit'] });
    qc.invalidateQueries({ queryKey: ['dashboard'] });
    qc.invalidateQueries({ queryKey: ['totals'] });
    qc.invalidateQueries({ queryKey: ['people'] });
  };
}

/** Has this exact invoice been recorded before, by anybody? */
export function useInvoiceDuplicateCheck() {
  return useMutation({
    mutationFn: async (input: {
      vatNumber: string;
      issuedAt: string;
      total: number;
    }): Promise<InvoiceDuplicate | null> => {
      const { data, error } = await supabase.rpc('check_invoice_duplicate', {
        p_vat_number: input.vatNumber,
        p_issued_at: input.issuedAt,
        p_total: input.total,
      });
      if (error) {
        // The database constraint is the real guard; this is only the
        // friendly warning, so a hiccup here must not block saving.
        console.warn('invoice duplicate check failed', error.message);
        return null;
      }
      return (data as unknown as InvoiceDuplicate) ?? null;
    },
  });
}

/** What the QR said. Admin and Sub-admin only. */
export function useInvoiceDetails(entryId: string | undefined, enabled = true) {
  return useQuery({
    queryKey: ['invoice-details', entryId],
    enabled: !!entryId && enabled,
    queryFn: async (): Promise<InvoiceDetails | null> => {
      const { data, error } = await supabase
        .from('invoice_details')
        .select(
          'entry_id, system_id, vat_number, qr_seller_name, qr_vat_number, qr_issued_at, qr_total, qr_vat_amount, amount_differs',
        )
        .eq('entry_id', entryId!)
        .maybeSingle();
      if (error) return null;
      return (data as InvoiceDetails) ?? null;
    },
  });
}

export function useSetExpenseType() {
  const refresh = useRefresh();
  return useMutation({
    mutationFn: async (input: { id: string; type: ExpenseKind }) => {
      const { error } = await supabase.rpc('set_expense_type', {
        p_id: input.id,
        p_type: input.type,
      });
      if (error) throw new Error(error.message);
    },
    onSuccess: refresh,
  });
}

/** "I looked at it, nothing is wrong." */
export function useClearTypeFlags() {
  const refresh = useRefresh();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.rpc('clear_type_flags', { p_id: id });
      if (error) throw new Error(error.message);
    },
    onSuccess: refresh,
  });
}

/** Everything the system was not sure about. */
export function useExpensesToCheck(enabled = true) {
  return useQuery({
    queryKey: ['to-check'],
    enabled,
    queryFn: async (): Promise<ToCheckRow[]> => {
      const { data, error } = await supabase
        .from('expenses_to_check')
        .select(
          'id, system_id, amount, bill_date, entered_at, note, expense_type, type_source, type_flags, bill_scan_state, person_id, person_name, category_name, category_icon, qr_total, photo_count, thumb_path',
        )
        .order('entered_at', { ascending: false })
        .limit(200);
      if (error) throw new Error(error.message);
      return (data ?? []) as ToCheckRow[];
    },
  });
}

export function useCancelEntry() {
  const refresh = useRefresh();
  return useMutation({
    mutationFn: async (input: { id: string; reason?: string }) => {
      const { error } = await supabase.rpc('cancel_entry', {
        p_id: input.id,
        p_reason: input.reason,
      });
      if (error) throw new Error(error.message);
    },
    onSuccess: refresh,
  });
}

export function useUncancelEntry() {
  const refresh = useRefresh();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.rpc('uncancel_entry', { p_id: id });
      if (error) throw new Error(error.message);
    },
    onSuccess: refresh,
  });
}
