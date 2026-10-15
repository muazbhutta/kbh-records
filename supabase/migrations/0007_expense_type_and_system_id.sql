-- =====================================================================
--  Migration 0007 - Expense type (Petty / Invoice) + System ID
-- ---------------------------------------------------------------------
--  This is an ADD-ON. Nothing that already exists is removed or renamed.
--  Everything hangs off the entries table the rest of the app already
--  uses, so khata, balances, the dashboard and the audit log keep
--  working exactly as before.
--
--  New on an expense
--    system_id        EXP-2026-000123, handed out by the database
--    expense_type     petty | invoice
--    type_source      how we decided it
--    type_flags       things an Admin should look at
--    qr_*             what a ZATCA invoice QR told us
--    is_cancelled     a duplicate that was thrown out. Not a delete:
--                     the row stays, it just leaves the balances.
-- =====================================================================

-- ---------------------------------------------------------------- enums
do $do$
begin
  create type public.expense_kind as enum ('petty', 'invoice');
exception when duplicate_object then null;
end
$do$;

do $do$
begin
  create type public.type_source as enum (
    'auto_qr',          -- a valid ZATCA QR was read off the bill
    'auto_vat_text',    -- no QR, but the text had VAT on it
    'auto_none',        -- nothing found, so Petty
    'manual',           -- the person chose it
    'changed_by_admin'  -- an Admin corrected it later
  );
exception when duplicate_object then null;
end
$do$;

do $do$
begin
  create type public.bill_scan_state as enum ('not_needed', 'pending', 'done', 'failed');
exception when duplicate_object then null;
end
$do$;

-- ------------------------------------------------------- new columns
alter table public.entries
  add column if not exists system_id       text,
  add column if not exists expense_type    public.expense_kind,
  add column if not exists type_source     public.type_source,
  add column if not exists type_flags      text[] not null default '{}',
  add column if not exists bill_scan_state public.bill_scan_state not null default 'not_needed',
  add column if not exists vat_number      text,
  add column if not exists qr_seller_name  text,
  add column if not exists qr_vat_number   text,
  add column if not exists qr_issued_at    timestamptz,
  add column if not exists qr_total        numeric(12, 2),
  add column if not exists qr_vat_amount   numeric(12, 2),
  add column if not exists qr_raw          text,
  add column if not exists is_cancelled    boolean not null default false,
  add column if not exists cancelled_at    timestamptz,
  add column if not exists cancelled_by    uuid references public.app_users (id) on delete set null,
  add column if not exists cancel_reason   text;

comment on column public.entries.system_id is
  'EXP-YYYY-NNNNNN. Given out by the database, never typed, never reused.';
comment on column public.entries.type_flags is
  'What an Admin should look at: type_check, amount_differs, old_entry_check, suspected_duplicate, type_changed.';
comment on column public.entries.is_cancelled is
  'A duplicate that was thrown out. The row stays and the money goes back.';

create unique index if not exists entries_system_id_key
  on public.entries (system_id) where system_id is not null;

create index if not exists entries_expense_type_idx
  on public.entries (expense_type, bill_date desc)
  where type = 'expense' and not is_deleted and not is_cancelled;

create index if not exists entries_flags_idx
  on public.entries using gin (type_flags) where type_flags <> '{}';

create index if not exists entries_scan_pending_idx
  on public.entries (bill_scan_state) where bill_scan_state = 'pending';

create index if not exists entries_cancelled_idx
  on public.entries (is_cancelled) where is_cancelled;

-- The same invoice can never be recorded twice, by anybody, on any date.
create unique index if not exists entries_invoice_once
  on public.entries (qr_vat_number, qr_issued_at, qr_total)
  where qr_vat_number is not null
    and qr_issued_at is not null
    and qr_total is not null
    and not is_deleted
    and not is_cancelled;

-- ------------------------------------------------- the System ID counter
create table if not exists public.expense_counters (
  year    integer primary key,
  next_no integer not null default 1
);

comment on table public.expense_counters is
  'One row per year. Handing out a number locks the row, so two people '
  'saving at the same moment can never get the same System ID.';

revoke all on table public.expense_counters from anon, authenticated;
grant all on table public.expense_counters to service_role;

create or replace function public.next_expense_id(p_year integer)
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_no integer;
begin
  insert into public.expense_counters (year, next_no)
  values (p_year, 2)
  on conflict (year) do update
    set next_no = public.expense_counters.next_no + 1
  returning public.expense_counters.next_no - 1 into v_no;

  return 'EXP-' || p_year::text || '-' || lpad(v_no::text, 6, '0');
end
$fn$;

-- ------------------------------------------------------------ triggers
/**
 * Stamps a System ID on every new expense, and keeps the stamped values
 * frozen afterwards. Runs before the existing entries_guard, which still
 * does all the work it did before.
 */
create or replace function public.entries_expense_stamp()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_year integer := extract(year from (now() at time zone 'Asia/Riyadh'))::integer;
begin
  if tg_op = 'INSERT' then
    if new.type = 'expense' then
      if new.system_id is null then
        new.system_id := public.next_expense_id(v_year);
      end if;
      if new.expense_type is null then
        new.expense_type := 'petty';
        new.type_source := coalesce(new.type_source, 'auto_none');
      end if;
    else
      -- Only expenses carry a System ID and a type.
      new.system_id := null;
      new.expense_type := null;
      new.type_source := null;
      new.bill_scan_state := 'not_needed';
    end if;
    return new;
  end if;

  -- A System ID is handed out once and never changes or comes back.
  new.system_id := old.system_id;

  if new.is_cancelled and not old.is_cancelled then
    new.cancelled_at := now();
    new.cancelled_by := coalesce(auth.uid(), new.cancelled_by);
  elsif not new.is_cancelled and old.is_cancelled then
    new.cancelled_at := null;
    new.cancelled_by := null;
    new.cancel_reason := null;
  end if;

  return new;
end
$fn$;

drop trigger if exists entries_expense_stamp_trg on public.entries;
create trigger entries_expense_stamp_trg
  before insert or update on public.entries
  for each row execute function public.entries_expense_stamp();

-- ======================================================= old entries
/**
 * Gives every expense that came before this migration a System ID, in
 * the order they were entered, and queues its photos to be looked at.
 * Safe to run again: it only touches rows that still have no ID.
 */
create or replace function public.backfill_expense_ids()
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_row   record;
  v_count integer := 0;
begin
  for v_row in
    select e.id,
           extract(year from (e.entered_at at time zone 'Asia/Riyadh'))::integer as yr
    from public.entries e
    where e.type = 'expense' and e.system_id is null
    order by e.entered_at, e.id
  loop
    update public.entries
       set system_id = public.next_expense_id(v_row.yr),
           expense_type = coalesce(expense_type, 'petty'),
           type_source  = coalesce(type_source, 'auto_none'),
           bill_scan_state = case
             when exists (select 1 from public.entry_photos p where p.entry_id = v_row.id)
               then 'pending'::public.bill_scan_state
             else 'failed'::public.bill_scan_state
           end,
           type_flags = (
             select array(select distinct unnest(type_flags || array['old_entry_check']))
           )
     where id = v_row.id;

    v_count := v_count + 1;
  end loop;

  return v_count;
end
$fn$;

revoke all on function public.backfill_expense_ids() from public, anon, authenticated;
grant execute on function public.backfill_expense_ids() to service_role;

select public.backfill_expense_ids();
