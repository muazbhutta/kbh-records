export type Role = 'admin' | 'sub_admin' | 'employee';

export type Person = {
  id: string;
  full_name: string;
  mobile: string;
  role: Role;
  is_owner: boolean;
  is_active: boolean;
  job_title: string | null;
  is_head: boolean;
  head_id: string | null;
  created_at: string;
};

export type PersonListRow = Person & {
  disabled_at: string | null;
  created_by_name: string | null;
};

export function isManager(role: Role | null | undefined): boolean {
  return role === 'admin' || role === 'sub_admin';
}

// ------------------------------------------------------------- money

export type EntryType = 'money_given' | 'transfer' | 'expense' | 'returned';

/** How an entry looks from one person's side of the khata. */
export type LineType =
  | 'money_given'
  | 'transfer_in'
  | 'transfer_out'
  | 'expense'
  | 'returned';

export type Category = {
  id: string;
  name: string;
  icon: string;
  sort_order: number;
  is_hidden: boolean;
};

export type PersonName = {
  id: string;
  full_name: string;
  is_active: boolean;
  is_owner: boolean;
  is_head: boolean;
  head_id: string | null;
};

/** How the money changed hands. An expense has none. */
export type PayMethod = 'cash' | 'transfer';

export const PAY_METHOD_LABEL: Record<PayMethod, string> = {
  cash: 'Cash in hand',
  transfer: 'Bank transfer',
};

/** The short form, for a row that has no room for the long one. */
export const PAY_METHOD_SHORT: Record<PayMethod, string> = {
  cash: 'Cash',
  transfer: 'Bank',
};

export const PAY_METHOD_ICON: Record<PayMethod, string> = {
  cash: 'cash-outline',
  transfer: 'card-outline',
};

export type Totals = {
  money_given: number;
  transfers_in: number;
  transfers_out: number;
  expenses: number;
  returned: number;
  /** Everything that came in, told apart by how it arrived. */
  in_cash: number;
  in_transfer: number;
  out_cash: number;
  out_transfer: number;
  balance: number;
  entry_count: number;
};

export type PeopleRow = PersonListRow &
  Totals & {
    last_entry_at: string | null;
    check_count: number;
    short_count: number;
    total_short: number;
    total_extra: number;
    last_checked_at: string | null;
    last_check_difference: number | null;
    last_check_result: CheckResult | null;
    head_name: string | null;
    team_count: number;
  };

/** One row of a khata. */
export type FeedEntry = {
  id: string;
  person_id: string;
  line_type: LineType;
  signed_amount: number;
  type: EntryType;
  amount: number;
  bill_date: string;
  entered_at: string;
  note: string | null;
  owner_id: string;
  owner_name: string | null;
  counterparty_id: string | null;
  counterparty_name: string | null;
  other_person_id: string | null;
  other_person_name: string | null;
  entered_by: string;
  entered_by_name: string | null;
  entered_for_someone_else: boolean;
  duplicate_photo: boolean;
  pay_method: PayMethod | null;
  system_id: string | null;
  expense_type: ExpenseKind | null;
  type_source: TypeSource | null;
  type_flags: string[];
  bill_scan_state: BillScanState;
  category_id: string | null;
  category_name: string | null;
  category_icon: string | null;
  photo_count: number;
  thumb_path: string | null;
};

export type EntryPhoto = {
  id: string;
  entry_id: string;
  storage_path: string;
  thumb_path: string | null;
  sha256: string;
  width: number | null;
  height: number | null;
  bytes: number | null;
  position: number;
};

/** Money in is green, money out is red. */
export const LINE_META: Record<
  LineType,
  { label: string; icon: string; positive: boolean }
> = {
  money_given:  { label: 'Money Given',  icon: 'arrow-down-circle', positive: true },
  transfer_in:  { label: 'Received',     icon: 'arrow-down-circle', positive: true },
  transfer_out: { label: 'Sent',         icon: 'arrow-up-circle',   positive: false },
  expense:      { label: 'Expense',      icon: 'receipt',           positive: false },
  returned:     { label: 'Returned',     icon: 'arrow-undo-circle', positive: false },
};

export const ENTRY_TYPE_LABEL: Record<EntryType, string> = {
  money_given: 'Money Given',
  transfer: 'Transfer',
  expense: 'Expense',
  returned: 'Returned',
};

// ------------------------------------------------- control and checks

export type AuditAction = 'insert' | 'update' | 'delete' | 'restore';

export type AuditChange = { old: unknown; new: unknown };

export type AuditEntry = {
  id: number;
  table_name: string;
  row_id: string;
  action: AuditAction;
  at: string;
  actor_id: string | null;
  actor_name: string | null;
  person_id: string | null;
  person_name: string | null;
  summary: string | null;
  changes: Record<string, AuditChange> | null;
};

export type DeletedEntry = {
  id: string;
  type: EntryType;
  amount: number;
  bill_date: string;
  note: string | null;
  delete_reason: string | null;
  person_id: string;
  person_name: string | null;
  counterparty_name: string | null;
  entered_by_name: string | null;
  entered_at: string;
  deleted_at: string | null;
  deleted_by_name: string | null;
  category_name: string | null;
  category_icon: string | null;
};

export type CheckResult = 'short' | 'extra' | 'matched';

export type CashCheck = {
  id: string;
  person_id: string;
  person_name: string | null;
  expected: number;
  counted: number;
  difference: number;
  result: CheckResult;
  note: string | null;
  checked_by: string;
  checked_by_name: string | null;
  checked_at: string;
};

export type CheckSummary = {
  person_id: string;
  check_count: number;
  short_count: number;
  extra_count: number;
  matched_count: number;
  total_short: number;
  total_extra: number;
  last_checked_at: string | null;
};

export type DuplicateWarning = {
  same_photo: {
    entry_id: string;
    system_id: string | null;
    bill_date: string;
    entered_at: string;
    amount: number;
    person_name: string;
  } | null;
  /** 'exact' = the very same file, 'similar' = the same bill again. */
  photo_match: 'exact' | 'similar' | null;
  same_amount: {
    entry_id: string;
    system_id: string | null;
    bill_date: string;
    amount: number;
    category_name: string | null;
  } | null;
};

export type SuspectedDuplicate = {
  id: string;
  system_id: string | null;
  amount: number;
  bill_date: string;
  entered_at: string;
  note: string | null;
  expense_type: ExpenseKind | null;
  person_id: string;
  person_name: string | null;
  entered_by_name: string | null;
  category_name: string | null;
  thumb_path: string | null;
  other_id: string | null;
  other_system_id: string | null;
  other_amount: number | null;
  other_bill_date: string | null;
  other_entered_at: string | null;
  other_note: string | null;
  other_person_name: string | null;
  other_category_name: string | null;
  other_thumb_path: string | null;
};

/** How a Cash Check reads on screen. */
export const CHECK_META: Record<CheckResult, { label: string; tone: 'green' | 'red' | 'amber' }> = {
  matched: { label: 'Matched', tone: 'green' },
  short: { label: 'Short', tone: 'red' },
  extra: { label: 'Extra', tone: 'amber' },
};

/** Field names the way a person would say them, for the change history. */
export const FIELD_LABEL: Record<string, string> = {
  amount: 'Amount',
  bill_date: 'Bill date',
  note: 'Note',
  category_id: 'Category',
  person_id: 'Whose khata',
  counterparty_id: 'Received by',
  is_deleted: 'Deleted',
  delete_reason: 'Reason',
  full_name: 'Name',
  mobile: 'Mobile number',
  role: 'Role',
  is_active: 'Account on',
  job_title: 'Job title',
  name: 'Name',
  icon: 'Icon',
  is_hidden: 'Hidden',
  sort_order: 'Order',
  counted: 'Counted',
  expected: 'Expected',
  expense_type: 'Bill type',
  type_source: 'Type decided by',
  type_flags: 'Flags',
  bill_scan_state: 'Bill reading',
  duplicate_of: 'Same bill as',
  is_cancelled: 'Cancelled',
  cancel_reason: 'Why cancelled',
  cancelled_at: 'Cancelled on',
  cancelled_by: 'Cancelled by',
  deleted_at: 'Deleted on',
  deleted_by: 'Deleted by',
  duplicate_photo: 'Duplicate photo',
  pay_method: 'How it was given',
  client_id: 'Saved from',
  system_id: 'Expense ID',
  vat_number: 'VAT number',
  is_head: 'Is a head',
  head_id: 'Works under',
  disabled_at: 'Turned off on',
};

// ------------------------------------------------- heads and dashboard

export type TeamRow = {
  head_id: string;
  head_name: string | null;
  head_job_title: string | null;
  people_count: number;
  team_cash: number;
  head_cash: number;
};

export type DashboardSummary = {
  money_given: number;
  expenses: number;
  returned: number;
  transfers: number;
  entry_count: number;
  cash_with_people: number;
  owed_back: number;
  holder_count: number;
  people_count: number;
  short_total: number;
  short_people: number;
  check_count: number;
  unchecked_people: number;
};

export type MonthPoint = { month: string; label: string; total: number };

export type CategorySlice = {
  category_id: string;
  name: string;
  icon: string;
  total: number;
  entry_count: number;
};

export type TopHolder = {
  person_id: string;
  full_name: string;
  balance: number;
  head_name: string | null;
};

export type StaleCheckPerson = {
  person_id: string;
  full_name: string;
  last_checked_at: string | null;
  balance: number;
};

// ------------------------------------------- petty / invoice add-on

export type ExpenseKind = 'petty' | 'invoice';

export type TypeSource =
  | 'auto_qr'
  | 'auto_vat_text'
  | 'auto_none'
  | 'manual'
  | 'changed_by_admin';

export type BillScanState = 'not_needed' | 'pending' | 'done' | 'failed';

/** What the person picks on the Add Expense screen. Auto is the default. */
export type TypeChoice = 'auto' | 'petty' | 'invoice';

export type TypeFlag =
  | 'type_check'
  | 'amount_differs'
  | 'old_entry_check'
  | 'suspected_duplicate'
  | 'type_changed';

export const FLAG_LABEL: Record<string, string> = {
  type_check: 'Type check',
  amount_differs: 'Amount differs from bill',
  old_entry_check: 'Old entry — check type',
  suspected_duplicate: 'Suspected duplicate',
  type_changed: 'Type changed',
};

/** Invoice reads navy, Petty reads amber. */
export const EXPENSE_KIND_LABEL: Record<ExpenseKind, string> = {
  petty: 'Petty',
  invoice: 'Invoice',
};

export const TYPE_SOURCE_LABEL: Record<TypeSource, string> = {
  auto_qr: 'Auto',
  auto_vat_text: 'Auto',
  auto_none: 'Auto',
  manual: 'Manual',
  changed_by_admin: 'Admin',
};

export type InvoiceDetails = {
  entry_id: string;
  system_id: string | null;
  vat_number: string | null;
  qr_seller_name: string | null;
  qr_vat_number: string | null;
  qr_issued_at: string | null;
  qr_total: number | null;
  qr_vat_amount: number | null;
  amount_differs: boolean;
};

export type InvoiceDuplicate = {
  entry_id: string;
  system_id: string | null;
  bill_date: string;
  entered_at: string;
  amount: number;
  person_name: string;
};

export type ToCheckRow = {
  id: string;
  system_id: string | null;
  amount: number;
  bill_date: string;
  entered_at: string;
  note: string | null;
  expense_type: ExpenseKind | null;
  type_source: TypeSource | null;
  type_flags: string[];
  bill_scan_state: BillScanState;
  person_id: string;
  person_name: string | null;
  category_name: string | null;
  category_icon: string | null;
  qr_total: number | null;
  photo_count: number;
  thumb_path: string | null;
};

// ------------------------------------------------------ reports

export type ReportRow = {
  id: string;
  system_id: string | null;
  bill_date: string;
  entered_at: string;
  person_id: string;
  person_name: string | null;
  entered_by_name: string | null;
  category_id: string | null;
  category_name: string | null;
  expense_type: ExpenseKind | null;
  type_source: TypeSource | null;
  note: string | null;
  amount: number;
  vat_number: string | null;
  qr_seller_name: string | null;
  photo_count: number;
};

export type ReportTotals = {
  all_total: number;
  petty_total: number;
  invoice_total: number;
  entry_count: number;
  petty_count: number;
  invoice_count: number;
  photo_count: number;
};

export type ReportPhoto = {
  entry_id: string;
  system_id: string | null;
  storage_path: string;
  photo_index: number;
  photo_total: number;
  bill_date: string;
  entered_at: string;
  person_name: string | null;
  category_name: string | null;
  expense_type: ExpenseKind | null;
  amount: number;
};

export type DownloadLogRow = {
  id: number;
  kind: string;
  at: string;
  actor_name: string | null;
  from_date: string | null;
  to_date: string | null;
  person_name: string | null;
  category_name: string | null;
  row_count: number | null;
  total: number | null;
  note: string | null;
};
