import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { refreshTheBooks } from '@/lib/queryClient';

import { supabase } from '@/lib/supabase';
import type {
  DownloadLogRow,
  ExpenseKind,
  ReportPhoto,
  ReportRow,
  ReportTotals,
} from '@/types';

export type ReportFilter = {
  from?: string;
  to?: string;
  personId?: string | null;
  /** Null means every category. */
  categoryId?: string | null;
};

const args = (f: ReportFilter) => ({
  p_from: f.from ?? undefined,
  p_to: f.to ?? undefined,
  p_person_id: f.personId ?? undefined,
  p_category_id: f.categoryId ?? undefined,
});

/** The figures shown on the Reports screen before anything is made. */
export function useReportTotals(filter: ReportFilter, enabled = true) {
  return useQuery({
    queryKey: ['report-totals', filter],
    enabled,
    queryFn: async (): Promise<ReportTotals> => {
      const { data, error } = await supabase.rpc('expense_report_totals', args(filter));
      if (error) throw new Error(error.message);
      return data as unknown as ReportTotals;
    },
  });
}

export async function fetchReportRows(
  filter: ReportFilter,
  kind?: ExpenseKind,
): Promise<ReportRow[]> {
  const { data, error } = await supabase.rpc('expense_report', {
    ...args(filter),
    p_kind: kind ?? undefined,
  });
  if (error) throw new Error(error.message);
  return (data ?? []) as ReportRow[];
}

export async function fetchReportPhotos(
  filter: ReportFilter,
  kind?: ExpenseKind,
): Promise<ReportPhoto[]> {
  const { data, error } = await supabase.rpc('report_photos', {
    ...args(filter),
    p_kind: kind ?? undefined,
  });
  if (error) throw new Error(error.message);
  return (data ?? []) as ReportPhoto[];
}

/** Every report and ZIP that has left the app. */
export function useDownloadLog(enabled = true, limit = 50) {
  return useQuery({
    queryKey: ['download-log', limit],
    enabled,
    queryFn: async (): Promise<DownloadLogRow[]> => {
      const { data, error } = await supabase
        .from('report_download_log')
        .select(
          'id, kind, at, actor_name, from_date, to_date, person_name, category_name, row_count, total, note',
        )
        .order('at', { ascending: false })
        .limit(limit);
      if (error) throw new Error(error.message);
      return (data ?? []) as DownloadLogRow[];
    },
  });
}

export function useLogDownload() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      kind: string;
      filter: ReportFilter;
      rows: number;
      total: number;
      note?: string;
    }) => {
      const { error } = await supabase.rpc('log_report_download', {
        p_kind: input.kind,
        ...args(input.filter),
        p_rows: input.rows,
        p_total: input.total,
        p_note: input.note,
      });
      if (error) console.warn('could not record the download', error.message);
    },
    onSuccess: () => refreshTheBooks(qc),
  });
}
