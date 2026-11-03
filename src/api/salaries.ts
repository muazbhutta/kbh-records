import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { refreshTheBooks } from '@/lib/queryClient';
import { supabase } from '@/lib/supabase';
import type { SalaryLine, SalaryMonthTotal, SalaryPayment } from '@/types';

/**
 * The salaries.
 *
 * Every one of these is refused by the database to anybody who is not an
 * Admin or a Sub-admin. What a man earns is not his workmates' business,
 * and the screens hiding it is not what makes that true.
 */

/** The first of a month, which is how a month is named throughout. */
export function monthKey(d: Date = new Date()): string {
  const y = d.getFullYear();
  const m = `${d.getMonth() + 1}`.padStart(2, '0');
  return `${y}-${m}-01`;
}

export function useSalaryMonth(month: string, enabled = true) {
  return useQuery({
    queryKey: ['salaries', 'month', month],
    enabled,
    queryFn: async (): Promise<SalaryLine[]> => {
      const { data, error } = await supabase.rpc('salary_month', { p_month: month });
      if (error) throw new Error(error.message);
      return (data ?? []) as SalaryLine[];
    },
  });
}

export function useSalaryMonthTotal(month: string, enabled = true) {
  return useQuery({
    queryKey: ['salaries', 'total', month],
    enabled,
    queryFn: async (): Promise<SalaryMonthTotal> => {
      const { data, error } = await supabase.rpc('salary_month_total', { p_month: month });
      if (error) throw new Error(error.message);
      const row = (data ?? [])[0];
      return {
        payroll_total: Number(row?.payroll_total ?? 0),
        advance_paid: Number(row?.advance_paid ?? 0),
        salary_paid: Number(row?.salary_paid ?? 0),
        remaining: Number(row?.remaining ?? 0),
        people: Number(row?.people ?? 0),
      };
    },
  });
}

export function useSalaryPayments(month: string, enabled = true) {
  return useQuery({
    queryKey: ['salaries', 'payments', month],
    enabled,
    queryFn: async (): Promise<SalaryPayment[]> => {
      const { data, error } = await supabase.rpc('salary_month_payments', { p_month: month });
      if (error) throw new Error(error.message);
      return (data ?? []) as SalaryPayment[];
    },
  });
}

/** Put somebody on the payroll, or change what they are on. */
export function useSetPayroll() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      personId: string;
      amount: number;
      since?: string;
      note?: string;
    }): Promise<void> => {
      const { error } = await supabase.rpc('set_payroll', {
        p_person_id: input.personId,
        p_amount: input.amount,
        p_since: input.since ?? undefined,
        p_note: input.note ?? undefined,
      });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => refreshTheBooks(qc),
  });
}

/** Take somebody off. Kept and switched off if they have ever been paid. */
export function useRemoveFromPayroll() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (personId: string): Promise<string> => {
      const { data, error } = await supabase.rpc('remove_from_payroll', {
        p_person_id: personId,
      });
      if (error) throw new Error(error.message);
      return String(data ?? 'removed');
    },
    onSuccess: () => refreshTheBooks(qc),
  });
}

/** Record salary or an advance. The day is chosen; the moment is taken. */
export function useRecordSalary() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      personId: string;
      month: string;
      amount: number;
      kind: 'salary' | 'advance';
      paidOn?: string;
      method?: 'cash' | 'transfer';
      note?: string;
    }): Promise<void> => {
      const { error } = await supabase.rpc('record_salary_payment', {
        p_person_id: input.personId,
        p_month: input.month,
        p_amount: input.amount,
        p_kind: input.kind,
        p_paid_on: input.paidOn ?? undefined,
        p_method: input.method ?? 'cash',
        p_note: input.note ?? undefined,
      });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => refreshTheBooks(qc),
  });
}

/** Take a payment back out. It is kept, with who removed it and why. */
export function useRemoveSalaryPayment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { id: number; reason?: string }): Promise<void> => {
      const { error } = await supabase.rpc('remove_salary_payment', {
        p_id: input.id,
        p_reason: input.reason ?? undefined,
      });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => refreshTheBooks(qc),
  });
}
