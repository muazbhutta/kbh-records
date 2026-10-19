import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';

import { removeUploaded, uploadPhotos, type LocalPhoto } from '@/lib/photos';
import { supabase } from '@/lib/supabase';
import type { Json } from '@/lib/database.types';
import type {
  PayMethod,
  Category,
  EntryPhoto,
  EntryType,
  ExpenseKind,
  FeedEntry,
  PersonName,
  Totals,
  TypeSource,
} from '@/types';
import type { ZatcaInvoice } from '@/lib/zatca';

const FEED_COLUMNS =
  'id, person_id, line_type, signed_amount, type, amount, bill_date, entered_at, note, owner_id, owner_name, counterparty_id, counterparty_name, other_person_id, other_person_name, entered_by, entered_by_name, entered_for_someone_else, duplicate_photo, pay_method, system_id, expense_type, type_source, type_flags, bill_scan_state, category_id, category_name, category_icon, project_id, project_name, photo_count, thumb_path';

export const PAGE_SIZE = 20;

export type FeedFilter = {
  personId?: string;
  /** Empty means every type. */
  lineTypes?: string[];
  from?: string;
  to?: string;
  categoryId?: string;
  /** Petty or Invoice. Only expenses carry one. */
  expenseType?: ExpenseKind;
  /**
   * Which project. A project id narrows to that one; 'none' narrows to
   * the expenses nobody has filed against a project yet. Left out, the
   * project is not asked about at all.
   */
  projectId?: string | 'none';
};

function applyFilter<T extends ReturnType<typeof baseQuery>>(q: T, filter: FeedFilter) {
  let out = q;
  if (filter.personId) out = out.eq('person_id', filter.personId) as T;
  if (filter.lineTypes?.length) out = out.in('line_type', filter.lineTypes) as T;
  if (filter.from) out = out.gte('bill_date', filter.from) as T;
  if (filter.to) out = out.lte('bill_date', filter.to) as T;
  if (filter.categoryId) out = out.eq('category_id', filter.categoryId) as T;
  if (filter.expenseType) out = out.eq('expense_type', filter.expenseType) as T;
  if (filter.projectId === 'none') out = out.is('project_id', null) as T;
  else if (filter.projectId) out = out.eq('project_id', filter.projectId) as T;
  return out;
}

function baseQuery() {
  return supabase.from('entry_feed').select(FEED_COLUMNS);
}

/** The khata list. Pages in as the user scrolls. */
export function useEntryFeed(filter: FeedFilter, enabled = true) {
  return useInfiniteQuery({
    queryKey: ['entry-feed', filter],
    enabled,
    initialPageParam: 0,
    queryFn: async ({ pageParam }): Promise<FeedEntry[]> => {
      const from = (pageParam as number) * PAGE_SIZE;
      const { data, error } = await applyFilter(baseQuery(), filter)
        .order('bill_date', { ascending: false })
        .order('entered_at', { ascending: false })
        .range(from, from + PAGE_SIZE - 1);
      if (error) throw new Error(error.message);
      return (data ?? []) as FeedEntry[];
    },
    getNextPageParam: (last, pages) =>
      last.length === PAGE_SIZE ? pages.length : undefined,
  });
}

/** A short list for a home screen. */
export function useRecentEntries(filter: FeedFilter, limit = 8, enabled = true) {
  return useQuery({
    queryKey: ['entry-recent', filter, limit],
    enabled,
    queryFn: async (): Promise<FeedEntry[]> => {
      const { data, error } = await applyFilter(baseQuery(), filter)
        .order('entered_at', { ascending: false })
        .limit(limit);
      if (error) throw new Error(error.message);
      return (data ?? []) as FeedEntry[];
    },
  });
}

export function useEntry(id: string | undefined, personId?: string) {
  return useQuery({
    queryKey: ['entry', id, personId ?? 'any'],
    enabled: !!id,
    queryFn: async (): Promise<FeedEntry | null> => {
      let q = supabase.from('entry_feed').select(FEED_COLUMNS).eq('id', id!);
      if (personId) q = q.eq('person_id', personId);
      const { data, error } = await q.limit(1);
      if (error) throw new Error(error.message);
      return ((data ?? [])[0] as FeedEntry) ?? null;
    },
  });
}

export function useEntryPhotos(entryId: string | undefined, hasPhotos = true) {
  return useQuery({
    queryKey: ['entry-photos', entryId],
    enabled: !!entryId && hasPhotos,
    queryFn: async (): Promise<EntryPhoto[]> => {
      const { data, error } = await supabase
        .from('entry_photos')
        .select('id, entry_id, storage_path, thumb_path, sha256, width, height, bytes, position')
        .eq('entry_id', entryId!)
        .order('position');
      if (error) throw new Error(error.message);
      return (data ?? []) as EntryPhoto[];
    },
  });
}

// ------------------------------------------------------------ totals

export function useTotals(personId: string | undefined) {
  return useQuery({
    queryKey: ['totals', personId],
    enabled: !!personId,
    queryFn: async (): Promise<Totals> => {
      const { data, error } = await supabase
        .from('person_totals')
        .select(
          'money_given, transfers_in, transfers_out, expenses, returned, in_cash, in_transfer, out_cash, out_transfer, balance, entry_count',
        )
        .eq('person_id', personId!)
        .maybeSingle();
      if (error) throw new Error(error.message);
      return (
        (data as Totals) ?? {
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
        }
      );
    },
  });
}

// ------------------------------------------------------------- names

/** Everyone a person can pick as "for whom" or as a transfer receiver. */
export function usePeopleNames() {
  return useQuery({
    queryKey: ['people-names'],
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<PersonName[]> => {
      const { data, error } = await supabase
        .from('people_names')
        .select('id, full_name, is_active, is_owner, is_head, head_id')
        .eq('is_active', true)
        .order('full_name');
      if (error) throw new Error(error.message);
      return (data ?? []) as PersonName[];
    },
  });
}

// -------------------------------------------------------- categories

export function useCategories(includeHidden = false) {
  return useQuery({
    queryKey: ['categories', includeHidden],
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<Category[]> => {
      let q = supabase
        .from('expense_categories')
        .select('id, name, icon, sort_order, is_hidden');
      if (!includeHidden) q = q.eq('is_hidden', false);
      const { data, error } = await q.order('sort_order').order('name');
      if (error) throw new Error(error.message);
      return (data ?? []) as Category[];
    },
  });
}

export function useSaveCategory() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      id?: string;
      name: string;
      icon: string;
      sortOrder?: number;
    }) => {
      const row = {
        name: input.name.trim(),
        icon: input.icon,
        ...(input.sortOrder !== undefined ? { sort_order: input.sortOrder } : {}),
      };
      const q = input.id
        ? supabase.from('expense_categories').update(row).eq('id', input.id)
        : supabase.from('expense_categories').insert(row);
      const { error } = await q;
      if (error) {
        throw new Error(
          /duplicate|unique/i.test(error.message)
            ? 'There is already a category with that name.'
            : error.message,
        );
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['categories'] }),
  });
}

export function useHideCategory() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { id: string; hidden: boolean }) => {
      const { error } = await supabase
        .from('expense_categories')
        .update({ is_hidden: input.hidden })
        .eq('id', input.id);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['categories'] }),
  });
}

// ----------------------------------------------------- saving entries

export type NewEntry = {
  type: EntryType;
  amount: number;
  personId: string;
  billDate: string;
  counterpartyId?: string | null;
  categoryId?: string | null;
  note?: string | null;
  photos?: LocalPhoto[];
  /** Who is logged in, used for the storage folder. */
  uploaderId: string;
  /** Expenses only: what the person chose, and what the bill said. */
  expenseType?: ExpenseKind | null;
  typeSource?: TypeSource | null;
  qr?: ZatcaInvoice | null;
  /** The earlier expense this one is suspected of repeating. */
  duplicateOf?: string | null;
  /** Cash in hand or bank transfer. Never set on an expense. */
  payMethod?: PayMethod | null;
  /** Which site it was spent on. Expenses only, and never required. */
  projectId?: string | null;
};

function friendlyDbError(message: string): string {
  if (/entries_invoice_once/i.test(message)) {
    return 'This invoice has already been recorded. Open the earlier entry to compare.';
  }
  if (/bill photo/i.test(message)) return 'An expense needs at least one bill photo.';
  if (/future/i.test(message)) return 'The bill date cannot be in the future.';
  if (/bigger than zero/i.test(message)) return 'Enter an amount bigger than zero.';
  if (/2 decimals/i.test(message)) return 'An amount can have at most 2 decimals.';
  if (/entries_no_self_transfer/i.test(message)) return 'You cannot send money to yourself.';
  if (/row-level security|violates row-level/i.test(message)) {
    return 'You are not allowed to record this kind of entry.';
  }
  return message;
}

export function useCreateEntry() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (input: NewEntry): Promise<string> => {
      const uploaded = input.photos?.length
        ? await uploadPhotos(input.photos, input.uploaderId)
        : [];

      const { data, error } = await supabase.rpc('create_entry', {
        p_type: input.type,
        p_amount: input.amount,
        p_person_id: input.personId,
        p_bill_date: input.billDate,
        p_counterparty_id: input.counterpartyId ?? undefined,
        p_category_id: input.categoryId ?? undefined,
        p_note: input.note ?? undefined,
        p_photos: uploaded,
        p_expense_type: input.expenseType ?? undefined,
        p_type_source: input.typeSource ?? undefined,
        p_qr: input.qr ? (JSON.parse(JSON.stringify(input.qr)) as Json) : undefined,
        p_duplicate_of: input.duplicateOf ?? undefined,
        p_pay_method: input.payMethod ?? undefined,
        p_project_id: input.projectId ?? undefined,
      });

      if (error) {
        // The entry never saved, so the photos should not be left behind.
        await removeUploaded(
          uploaded.flatMap((p) => [p.storage_path, p.thumb_path].filter(Boolean) as string[]),
        );
        throw new Error(friendlyDbError(error.message));
      }

      // The bill is read in the background. Saving never waits for it:
      // the entry shows "Checking bill..." until the answer lands.
      if (input.type === 'expense' && !input.qr) {
        supabase.functions
          .invoke('scan-bill', { body: { action: 'scan', entryId: data as string } })
          .catch(() => {});
      }

      return data as string;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['entry-feed'] });
      qc.invalidateQueries({ queryKey: ['entry-recent'] });
      qc.invalidateQueries({ queryKey: ['totals'] });
      qc.invalidateQueries({ queryKey: ['people'] });
      qc.invalidateQueries({ queryKey: ['person'] });
    },
  });
}
