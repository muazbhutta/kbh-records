-- Salaries.
--
-- Kept apart from the khatas on purpose. A man's khata is company cash
-- in his hand that he must account for; his salary is his own money and
-- he accounts for nothing. Mixing them makes every balance in this app
-- a question rather than an answer.
--
-- Two things here. Who is on the payroll and for how much a month, which
-- changes rarely. And what was actually handed over and when, which is
-- the month's work - including an advance taken before payday, which is
-- the whole reason a simple "paid / not paid" column will not do.
--
-- Only an Admin or a Sub-admin sees any of it. What a man earns is not
-- his workmates' business.

create table if not exists public.payroll (
  person_id      uuid primary key references public.app_users (id) on delete cascade,
  monthly_amount numeric(12, 2) not null check (monthly_amount > 0),
  /** From when this figure applies. A raise is an edit, with a new date. */
  since          date not null default current_date,
  note           text check (note is null or length(note) <= 300),
  is_active      boolean not null default true,
  added_by       uuid references public.app_users (id) on delete set null,
  added_at       timestamptz not null default now()
);

comment on table public.payroll is
  'Who draws a salary and how much a month. Separate from their khata.';

create table if not exists public.salary_payments (
  id         bigint generated always as identity primary key,
  person_id  uuid not null references public.app_users (id) on delete restrict,
  /** The month it is for, always the first of that month. */
  for_month  date not null,
  amount     numeric(12, 2) not null check (amount > 0),
  /**
   * 'salary' is the month's pay. 'advance' is money taken before
   * payday, which still counts against the same month.
   */
  kind       text not null check (kind in ('salary', 'advance')),
  /** The day it changed hands, which is not always the day it was typed. */
  paid_on    date not null,
  method     public.pay_method not null default 'cash',
  note       text check (note is null or length(note) <= 300),

  entered_by uuid references public.app_users (id) on delete set null,
  /** When it was typed. Taken by the app, never chosen. */
  entered_at timestamptz not null default now(),

  is_deleted boolean not null default false,
  deleted_at timestamptz,
  deleted_by uuid references public.app_users (id) on delete set null,
  delete_reason text
);

comment on table public.salary_payments is
  'Salary and advances handed over. Nothing is ever really removed.';

create index if not exists salary_payments_month_idx
  on public.salary_payments (for_month desc) where not is_deleted;
create index if not exists salary_payments_person_idx
  on public.salary_payments (person_id, for_month desc) where not is_deleted;

-- ----------------------------------------------------------------- RLS
alter table public.payroll enable row level security;
alter table public.salary_payments enable row level security;

drop policy if exists payroll_office on public.payroll;
create policy payroll_office on public.payroll
  for select to authenticated using (public.is_admin());

drop policy if exists salary_payments_office on public.salary_payments;
create policy salary_payments_office on public.salary_payments
  for select to authenticated using (public.is_admin());

comment on policy payroll_office on public.payroll is
  'What a man earns is not his workmates'' business.';

grant select on public.payroll to authenticated;
grant select on public.salary_payments to authenticated;

-- ------------------------------------------------------------ the people
/** Put somebody on the payroll, or change what they are on. */
create or replace function public.set_payroll(
  p_person_id uuid,
  p_amount    numeric,
  p_since     date default null,
  p_note      text default null
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
begin
  if not public.is_admin() then
    raise exception 'Only an Admin or a Sub-admin can set a salary.' using errcode = 'P0001';
  end if;
  if p_amount is null or p_amount <= 0 then
    raise exception 'Enter a monthly salary bigger than zero.' using errcode = 'P0001';
  end if;
  if round(p_amount, 2) <> p_amount then
    raise exception 'A salary can have at most 2 decimals.' using errcode = 'P0001';
  end if;
  if not exists (select 1 from public.app_users where id = p_person_id and is_active) then
    raise exception 'That person is not on the books.' using errcode = 'P0001';
  end if;

  insert into public.payroll (person_id, monthly_amount, since, note, added_by)
  values (p_person_id, p_amount, coalesce(p_since, current_date),
          nullif(btrim(coalesce(p_note, '')), ''), auth.uid())
  on conflict (person_id) do update
    set monthly_amount = excluded.monthly_amount,
        since          = excluded.since,
        note           = coalesce(excluded.note, public.payroll.note),
        is_active      = true;
end
$fn$;

/**
 * Take somebody off the payroll.
 *
 * If they have ever been paid, the row stays and is only switched off:
 * the months they were paid for have to keep saying what they were paid.
 * If nothing was ever paid, it goes, because nothing is lost.
 */
create or replace function public.remove_from_payroll(p_person_id uuid)
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_paid bigint;
begin
  if not public.is_admin() then
    raise exception 'Only an Admin or a Sub-admin can take somebody off the payroll.'
      using errcode = 'P0001';
  end if;

  select count(*) into v_paid from public.salary_payments
   where person_id = p_person_id and not is_deleted;

  if v_paid > 0 then
    update public.payroll set is_active = false where person_id = p_person_id;
    return 'stopped';
  end if;

  delete from public.payroll where person_id = p_person_id;
  return 'removed';
end
$fn$;

-- --------------------------------------------------------- the handing over
/** Record salary or an advance. The day is chosen; the moment is taken. */
create or replace function public.record_salary_payment(
  p_person_id uuid,
  p_month     date,
  p_amount    numeric,
  p_kind      text,
  p_paid_on   date default null,
  p_method    public.pay_method default 'cash',
  p_note      text default null
)
returns bigint
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_id    bigint;
  v_month date := date_trunc('month', coalesce(p_month, current_date))::date;
  v_paid  date := coalesce(p_paid_on, current_date);
begin
  if not public.is_admin() then
    raise exception 'Only an Admin or a Sub-admin can record a salary.' using errcode = 'P0001';
  end if;
  if p_kind not in ('salary', 'advance') then
    raise exception 'That is not a kind of salary payment.' using errcode = 'P0001';
  end if;
  if p_amount is null or p_amount <= 0 then
    raise exception 'Enter an amount bigger than zero.' using errcode = 'P0001';
  end if;
  if round(p_amount, 2) <> p_amount then
    raise exception 'An amount can have at most 2 decimals.' using errcode = 'P0001';
  end if;
  if v_paid > current_date then
    raise exception 'The day it was handed over cannot be in the future.'
      using errcode = 'P0001';
  end if;
  if not exists (select 1 from public.app_users where id = p_person_id and is_active) then
    raise exception 'That person is not on the books.' using errcode = 'P0001';
  end if;

  insert into public.salary_payments
    (person_id, for_month, amount, kind, paid_on, method, note, entered_by)
  values
    (p_person_id, v_month, p_amount, p_kind, v_paid,
     coalesce(p_method, 'cash'), nullif(btrim(coalesce(p_note, '')), ''), auth.uid())
  returning id into v_id;

  return v_id;
end
$fn$;

/** Take a payment back out. It is kept, with who removed it and why. */
create or replace function public.remove_salary_payment(p_id bigint, p_reason text default null)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
begin
  if not public.is_admin() then
    raise exception 'Only an Admin or a Sub-admin can remove a salary payment.'
      using errcode = 'P0001';
  end if;

  update public.salary_payments
     set is_deleted = true, deleted_at = now(), deleted_by = auth.uid(),
         delete_reason = nullif(btrim(coalesce(p_reason, '')), '')
   where id = p_id and not is_deleted;

  if not found then
    raise exception 'That payment is not there, or is already out.' using errcode = 'P0001';
  end if;
end
$fn$;

revoke all on function public.set_payroll(uuid, numeric, date, text) from public, anon;
revoke all on function public.remove_from_payroll(uuid) from public, anon;
revoke all on function public.record_salary_payment(uuid, date, numeric, text, date, public.pay_method, text)
  from public, anon;
revoke all on function public.remove_salary_payment(bigint, text) from public, anon;
grant execute on function public.set_payroll(uuid, numeric, date, text) to authenticated;
grant execute on function public.remove_from_payroll(uuid) to authenticated;
grant execute on function public.record_salary_payment(uuid, date, numeric, text, date, public.pay_method, text)
  to authenticated;
grant execute on function public.remove_salary_payment(bigint, text) to authenticated;
