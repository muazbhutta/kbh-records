import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { refreshTheBooks } from '@/lib/queryClient';

import { supabase } from '@/lib/supabase';
import type { AuditEntry, CashCheck, CheckSummary, DeletedEntry, DuplicateWarning } from '@/types';

const PAGE = 25;

/** One entry changed, so every view of the books is now stale. */
function useRefreshMoney() {
  const qc = useQueryClient();
  return () => refreshTheBooks(qc);
}

function friendly(message: string): string {
  if (/future/i.test(message)) return 'The bill date cannot be in the future.';
  if (/bigger than zero/i.test(message)) return 'Enter an amount bigger than zero.';
  if (/2 decimals/i.test(message)) return 'An amount can have at most 2 decimals.';
  if (/bill photo/i.test(message)) return 'An expense needs at least one bill photo.';
  if (/row-level security|violates row-level|permission denied/i.test(message)) {
    return 'Only an Admin can do this.';
  }
  return message;
}

// ------------------------------------------------------ edit / delete

export type EntryEdit = {
  id: string;
  amount?: number;
  billDate?: string;
  personId?: string;
  counterpartyId?: string;
  categoryId?: string;
  note?: string | null;
};

export function useUpdateEntry() {
  const refresh = useRefreshMoney();
  return useMutation({
    mutationFn: async (input: EntryEdit) => {
      const { error } = await supabase.rpc('update_entry', {
        p_id: input.id,
        p_amount: input.amount,
        p_bill_date: input.billDate,
        p_person_id: input.personId,
        p_counterparty_id: input.counterpartyId,
        p_category_id: input.categoryId,
        p_note: input.note ?? undefined,
        p_clear_note: input.note === null || input.note === '',
      });
      if (error) throw new Error(friendly(error.message));
    },
    onSuccess: refresh,
  });
}

export function useDeleteEntry() {
  const refresh = useRefreshMoney();
  return useMutation({
    mutationFn: async (input: { id: string; reason?: string }) => {
      const { error } = await supabase.rpc('delete_entry', {
        p_id: input.id,
        p_reason: input.reason,
      });
      if (error) throw new Error(friendly(error.message));
    },
    onSuccess: refresh,
  });
}

export function useRestoreEntry() {
  const refresh = useRefreshMoney();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.rpc('restore_entry', { p_id: id });
      if (error) throw new Error(friendly(error.message));
    },
    onSuccess: refresh,
  });
}

export function useDeletedEntries() {
  return useQuery({
    queryKey: ['deleted-entries'],
    queryFn: async (): Promise<DeletedEntry[]> => {
      const { data, error } = await supabase
        .from('deleted_entries')
        .select(
          'id, type, amount, bill_date, note, delete_reason, person_id, person_name, counterparty_name, entered_by_name, entered_at, deleted_at, deleted_by_name, category_name, category_icon',
        )
        .order('deleted_at', { ascending: false })
        .limit(100);
      if (error) throw new Error(error.message);
      return (data ?? []) as DeletedEntry[];
    },
  });
}

// ------------------------------------------------------- change history

const AUDIT_COLUMNS =
  'id, table_name, row_id, action, at, actor_id, actor_name, person_id, person_name, summary, changes';

export type AuditFilter = {
  personId?: string;
  actorId?: string;
  table?: string;
  from?: string;
  to?: string;
};

export function useAuditFeed(filter: AuditFilter = {}, enabled = true) {
  return useInfiniteQuery({
    queryKey: ['audit', filter],
    enabled,
    initialPageParam: 0,
    queryFn: async ({ pageParam }): Promise<AuditEntry[]> => {
      const from = (pageParam as number) * PAGE;
      let q = supabase.from('audit_feed').select(AUDIT_COLUMNS);
      if (filter.personId) q = q.eq('person_id', filter.personId);
      if (filter.actorId) q = q.eq('actor_id', filter.actorId);
      if (filter.table) q = q.eq('table_name', filter.table);
      if (filter.from) q = q.gte('at', `${filter.from}T00:00:00Z`);
      if (filter.to) q = q.lte('at', `${filter.to}T23:59:59Z`);

      const { data, error } = await q
        .order('at', { ascending: false })
        .range(from, from + PAGE - 1);
      if (error) throw new Error(error.message);
      return (data ?? []) as AuditEntry[];
    },
    getNextPageParam: (last, pages) => (last.length === PAGE ? pages.length : undefined),
  });
}

/** The history of one entry, shown on the entry itself. */
export function useRowHistory(rowId: string | undefined, enabled = true) {
  return useQuery({
    queryKey: ['audit', 'row', rowId],
    enabled: !!rowId && enabled,
    queryFn: async (): Promise<AuditEntry[]> => {
      const { data, error } = await supabase
        .from('audit_feed')
        .select(AUDIT_COLUMNS)
        .eq('row_id', rowId!)
        .order('at', { ascending: false });
      if (error) {
        // An employee has no right to the history; that is not an error
        // worth showing them.
        if (/permission|row-level/i.test(error.message)) return [];
        throw new Error(error.message);
      }
      return (data ?? []) as AuditEntry[];
    },
  });
}

// ------------------------------------------------------ duplicate bills

export function useCheckDuplicates() {
  return useMutation({
    mutationFn: async (input: {
      hashes: string[];
      phashes: string[];
      personId: string;
      amount: number;
      billDate: string;
    }): Promise<DuplicateWarning> => {
      const { data, error } = await supabase.rpc('check_photo_duplicate', {
        p_sha: input.hashes,
        p_phash: input.phashes,
        p_person_id: input.personId,
        p_amount: input.amount,
        p_bill_date: input.billDate,
      });
      if (error) {
        // A warning is a nicety. Never block saving because it failed.
        console.warn('duplicate check failed', error.message);
        return { same_photo: null, photo_match: null, same_amount: null };
      }
      return (data ?? { same_photo: null, photo_match: null, same_amount: null }) as unknown as DuplicateWarning;
    },
  });
}

// ----------------------------------------------------------- cash check

const CHECK_COLUMNS =
  'id, person_id, person_name, expected, counted, difference, result, note, checked_by, checked_by_name, checked_at';

export function useCashChecks(personId?: string, limit = 50) {
  return useQuery({
    queryKey: ['cash-checks', personId ?? 'all', limit],
    queryFn: async (): Promise<CashCheck[]> => {
      let q = supabase.from('cash_check_feed').select(CHECK_COLUMNS);
      if (personId) q = q.eq('person_id', personId);
      const { data, error } = await q.order('checked_at', { ascending: false }).limit(limit);
      if (error) throw new Error(error.message);
      return (data ?? []) as CashCheck[];
    },
  });
}

export function useCheckSummary(personId: string | undefined) {
  return useQuery({
    queryKey: ['check-summary', personId],
    enabled: !!personId,
    queryFn: async (): Promise<CheckSummary | null> => {
      const { data, error } = await supabase
        .from('person_check_summary')
        .select(
          'person_id, check_count, short_count, extra_count, matched_count, total_short, total_extra, last_checked_at',
        )
        .eq('person_id', personId!)
        .maybeSingle();
      if (error) throw new Error(error.message);
      return (data as CheckSummary) ?? null;
    },
  });
}

/** A cash check changes balances, people and the history alike. */
function useRefreshChecks() {
  const qc = useQueryClient();
  return () => refreshTheBooks(qc);
}

export function useRecordCashCheck() {
  const refresh = useRefreshChecks();
  return useMutation({
    mutationFn: async (input: { personId: string; counted: number; note?: string }) => {
      const { data, error } = await supabase.rpc('record_cash_check', {
        p_person_id: input.personId,
        p_counted: input.counted,
        p_note: input.note,
      });
      if (error) throw new Error(friendly(error.message));
      return data as string;
    },
    onSuccess: refresh,
  });
}

export function useDeleteCashCheck() {
  const refresh = useRefreshChecks();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.rpc('delete_cash_check', { p_id: id });
      if (error) throw new Error(friendly(error.message));
    },
    onSuccess: refresh,
  });
}
