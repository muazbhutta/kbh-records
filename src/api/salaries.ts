import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { refreshTheBooks } from '@/lib/queryClient';
import { supabase } from '@/lib/supabase';
import type {
  AttendanceDayTotal,
  AttendanceRow,
  PayKind,
  SalaryCandidate,
  SalaryLine,
  SalaryMonthTotal,
  SalaryPayment,
} from '@/types';

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

/**
 * Everybody who could be put on salary.
 *
 * Two sorts in one list: men already on the payroll's own roster, and
 * the app's people who are not on it yet. Which one was chosen decides
 * which id goes back to the database, so keep the whole row, not just
 * the id.
 */
export function useSalaryCandidates(enabled = true) {
  return useQuery({
    queryKey: ['salaries', 'candidates'],
    enabled,
    queryFn: async (): Promise<SalaryCandidate[]> => {
      const { data, error } = await supabase.rpc('salary_candidates');
      if (error) throw new Error(error.message);
      return (data ?? []) as SalaryCandidate[];
    },
  });
}

/**
 * Write down a man who only draws a salary.
 *
 * A name and a trade. No mobile, no PIN, no account: he does not use
 * the app and does not belong in anybody else's pickers.
 */
export function useAddSalaryPerson() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      name: string;
      jobTitle?: string;
    }): Promise<{ id: string; full_name: string }> => {
      const { data, error } = await supabase.rpc('add_salary_person', {
        p_name: input.name,
        p_job: input.jobTitle ?? undefined,
      });
      if (error) throw new Error(error.message);
      const row = (data ?? [])[0];
      if (!row?.id) throw new Error('He was not added. Try again.');
      return { id: String(row.id), full_name: String(row.full_name) };
    },
    onSuccess: () => refreshTheBooks(qc),
  });
}

/**
 * Put somebody on the payroll, or change what they are on.
 *
 * `personId` is a roster id. `userId` is for one of the app's people
 * who is not on the roster yet - the database writes him on.
 */
export function useSetPayroll() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      personId?: string | null;
      userId?: string | null;
      amount: number;
      /** A month's wage, or one day's. Defaults to a month's. */
      payKind?: PayKind;
      since?: string;
      note?: string;
    }): Promise<string> => {
      const { data, error } = await supabase.rpc('set_payroll', {
        p_person_id: input.personId ?? undefined,
        p_user_id: input.userId ?? undefined,
        p_amount: input.amount,
        p_pay_kind: input.payKind ?? 'monthly',
        p_since: input.since ?? undefined,
        p_note: input.note ?? undefined,
      });
      if (error) throw new Error(error.message);
      // The roster id, which is not the account id when the man had one.
      return String(data);
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

/**
 * Attendance.
 *
 * Kept for everybody on the payroll. For a daily man it is what his
 * wage is made of; for a monthly man it changes nothing he is owed and
 * is kept because the office wants the record.
 */
export function useAttendanceDay(day: string, enabled = true) {
  return useQuery({
    queryKey: ['attendance', 'day', day],
    enabled,
    queryFn: async (): Promise<AttendanceRow[]> => {
      const { data, error } = await supabase.rpc('attendance_day', { p_on_date: day });
      if (error) throw new Error(error.message);
      return (data ?? []) as AttendanceRow[];
    },
  });
}

export function useAttendanceDayTotal(day: string, enabled = true) {
  return useQuery({
    queryKey: ['attendance', 'total', day],
    enabled,
    queryFn: async (): Promise<AttendanceDayTotal> => {
      const { data, error } = await supabase.rpc('attendance_day_total', { p_on_date: day });
      if (error) throw new Error(error.message);
      const row = (data ?? [])[0];
      return {
        people: Number(row?.people ?? 0),
        present: Number(row?.present ?? 0),
        absent: Number(row?.absent ?? 0),
        not_marked: Number(row?.not_marked ?? 0),
        wages: Number(row?.wages ?? 0),
      };
    },
  });
}

/** Say whether a man turned up. Saying it again just corrects it. */
export function useMarkAttendance() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      personId: string;
      day: string;
      present: boolean;
      note?: string;
    }): Promise<void> => {
      const { error } = await supabase.rpc('mark_attendance', {
        p_person_id: input.personId,
        p_on_date: input.day,
        p_present: input.present,
        p_note: input.note ?? undefined,
      });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => refreshTheBooks(qc),
  });
}

/** Take the mark off a day nobody should have answered for. */
export function useClearAttendance() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { personId: string; day: string }): Promise<void> => {
      const { error } = await supabase.rpc('clear_attendance', {
        p_person_id: input.personId,
        p_on_date: input.day,
      });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => refreshTheBooks(qc),
  });
}
