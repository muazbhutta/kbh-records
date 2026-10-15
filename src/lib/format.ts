/**
 * Money, dates and phone numbers, formatted the one way the whole app
 * uses them. Everything is Saudi Riyal and Asia/Riyadh time.
 */

export const TIME_ZONE = 'Asia/Riyadh';

const moneyFormatter = new Intl.NumberFormat('en-US', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/** 1250 -> "SAR 1,250.00" */
export function money(amount: number | string | null | undefined): string {
  const n = typeof amount === 'string' ? Number(amount) : (amount ?? 0);
  if (!Number.isFinite(n)) return 'SAR 0.00';
  const sign = n < 0 ? '-' : '';
  return `${sign}SAR ${moneyFormatter.format(Math.abs(n))}`;
}

/** 1250 -> "1,250.00" (when the SAR label is already on the screen) */
export function amountOnly(amount: number | string | null | undefined): string {
  const n = typeof amount === 'string' ? Number(amount) : (amount ?? 0);
  if (!Number.isFinite(n)) return '0.00';
  return moneyFormatter.format(n);
}

const dateFormatter = new Intl.DateTimeFormat('en-GB', {
  timeZone: TIME_ZONE,
  day: '2-digit',
  month: 'short',
  year: 'numeric',
});

const timeFormatter = new Intl.DateTimeFormat('en-US', {
  timeZone: TIME_ZONE,
  hour: '2-digit',
  minute: '2-digit',
  hour12: true,
});

/** "11 Oct 2026" */
export function formatDate(value: string | Date | null | undefined): string {
  if (!value) return '-';
  const d = typeof value === 'string' ? new Date(value) : value;
  if (Number.isNaN(d.getTime())) return '-';
  return dateFormatter.format(d).replace(/,/g, '');
}

/** "08:21 PM" */
export function formatTime(value: string | Date | null | undefined): string {
  if (!value) return '-';
  const d = typeof value === 'string' ? new Date(value) : value;
  if (Number.isNaN(d.getTime())) return '-';
  return timeFormatter.format(d);
}

/** "11 Oct 2026, 08:21 PM" */
export function formatDateTime(value: string | Date | null | undefined): string {
  if (!value) return '-';
  return `${formatDate(value)}, ${formatTime(value)}`;
}

/** Today in Riyadh as YYYY-MM-DD, for date pickers that must not go forward. */
export function todayInRiyadh(): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
  return parts;
}

// --------------------------------------------------------------- phone

/**
 * Turns anything a user might type into the stored form 966501234567,
 * or null when it is not a Saudi mobile number.
 */
export function normalizeMobile(input: string): string | null {
  let d = (input ?? '').replace(/\D/g, '');
  if (d.startsWith('00966')) d = d.slice(5);
  else if (d.startsWith('966')) d = d.slice(3);
  else if (d.startsWith('0')) d = d.slice(1);
  if (!/^5\d{8}$/.test(d)) return null;
  return `966${d}`;
}

/** 966501234567 -> "+966 50 123 4567" */
export function prettyMobile(mobile: string | null | undefined): string {
  if (!mobile) return '-';
  const digits = mobile.replace(/\D/g, '');
  const n = digits.startsWith('966') ? digits.slice(3) : digits.replace(/^0/, '');
  if (n.length !== 9) return mobile;
  return `+966 ${n.slice(0, 2)} ${n.slice(2, 5)} ${n.slice(5)}`;
}

/** What the user types in the mobile field: "050 123 4567" */
export function formatMobileInput(raw: string): string {
  let d = (raw ?? '').replace(/\D/g, '');
  if (d.startsWith('966')) d = `0${d.slice(3)}`;
  if (!d.startsWith('0') && d.length > 0) d = `0${d}`;
  d = d.slice(0, 10);
  if (d.length <= 3) return d;
  if (d.length <= 6) return `${d.slice(0, 3)} ${d.slice(3)}`;
  return `${d.slice(0, 3)} ${d.slice(3, 6)} ${d.slice(6)}`;
}

// --------------------------------------------------------------- names

export function initials(name: string | null | undefined): string {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export function firstName(name: string | null | undefined): string {
  if (!name) return '';
  return name.trim().split(/\s+/)[0] ?? '';
}

export const ROLE_LABEL: Record<string, string> = {
  admin: 'Admin',
  sub_admin: 'Sub-admin',
  employee: 'Employee',
};
