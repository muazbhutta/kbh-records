import { useQuery } from '@tanstack/react-query';

import { supabase } from '@/lib/supabase';
import type {
  CategorySlice,
  DashboardSummary,
  MonthPoint,
  StaleCheckPerson,
  TeamRow,
  TopHolder,
} from '@/types';

export type Range = { from?: string; to?: string };

export function useDashboardSummary(range: Range, enabled = true) {
  return useQuery({
    queryKey: ['dashboard', 'summary', range],
    enabled,
    queryFn: async (): Promise<DashboardSummary> => {
      const { data, error } = await supabase.rpc('dashboard_summary', {
        p_from: range.from ?? undefined,
        p_to: range.to ?? undefined,
      });
      if (error) throw new Error(error.message);
      return data as unknown as DashboardSummary;
    },
  });
}

export function useExpensesByMonth(months = 12, enabled = true) {
  return useQuery({
    queryKey: ['dashboard', 'months', months],
    enabled,
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<MonthPoint[]> => {
      const { data, error } = await supabase.rpc('expenses_by_month', { p_months: months });
      if (error) throw new Error(error.message);
      return (data ?? []) as MonthPoint[];
    },
  });
}

export function useExpensesByCategory(range: Range, enabled = true) {
  return useQuery({
    queryKey: ['dashboard', 'categories', range],
    enabled,
    queryFn: async (): Promise<CategorySlice[]> => {
      const { data, error } = await supabase.rpc('expenses_by_category', {
        p_from: range.from ?? undefined,
        p_to: range.to ?? undefined,
      });
      if (error) throw new Error(error.message);
      return (data ?? []) as CategorySlice[];
    },
  });
}

export function useTopCashHolders(limit = 5, enabled = true) {
  return useQuery({
    queryKey: ['dashboard', 'top', limit],
    enabled,
    queryFn: async (): Promise<TopHolder[]> => {
      const { data, error } = await supabase.rpc('top_cash_holders', { p_limit: limit });
      if (error) throw new Error(error.message);
      return (data ?? []) as TopHolder[];
    },
  });
}

export function usePeopleNeedingCheck(days = 30, enabled = true) {
  return useQuery({
    queryKey: ['dashboard', 'stale-checks', days],
    enabled,
    queryFn: async (): Promise<StaleCheckPerson[]> => {
      const { data, error } = await supabase.rpc('people_needing_check', { p_days: days });
      if (error) throw new Error(error.message);
      return (data ?? []) as StaleCheckPerson[];
    },
  });
}

/** One row per head: how many people work under them, and the team's cash. */
export function useTeams(enabled = true) {
  return useQuery({
    queryKey: ['teams'],
    enabled,
    queryFn: async (): Promise<TeamRow[]> => {
      const { data, error } = await supabase
        .from('team_summary')
        .select('head_id, head_name, head_job_title, people_count, team_cash, head_cash')
        .order('people_count', { ascending: false });
      if (error) throw new Error(error.message);
      return (data ?? []) as TeamRow[];
    },
  });
}
