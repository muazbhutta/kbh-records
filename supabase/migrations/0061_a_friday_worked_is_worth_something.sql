-- A Friday worked is worth something.
--
-- Friday is the day off. A man on a monthly wage who comes in anyway
-- has given the company a day it did not pay for, and the office pays
-- him 150 for it. That is not a day's wage - he is already paid for
-- the month - it is a bonus on top, and it has to show as one.
--
-- Only the monthly staff. A daily man is paid for every day he turns
-- up, Friday included, and already has been.
--
-- The figure sits with the rest of his terms on the payroll, so it can
-- differ by man without anybody writing code, and it is captured onto
-- the day when the day is marked - the same rule as the daily rate, so
-- raising it later cannot reach back into a month already paid.

alter table public.payroll
  add column if not exists friday_bonus numeric(12, 2) not null default 150
  check (friday_bonus >= 0);

comment on column public.payroll.friday_bonus is
  'What a monthly man is paid for working a Friday. Daily men are paid by the day already.';

-- --------------------------------------------------------- marking it
/**
 * Say whether a man turned up. Saying it twice just corrects it.
 *
 * What the day is worth to him is written down with it. For a daily
 * man that is his daily rate. For a monthly man it is nought on any
 * ordinary day - he is paid by the month - and his Friday bonus on a
 * Friday, because that is a day the month did not buy.
 */
create or replace function public.mark_attendance(
  p_person_id uuid,
  p_on_date date,
  p_present boolean,
  p_note text default null
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_day    date := coalesce(p_on_date, current_date);
  v_rate   numeric;
  v_friday boolean;
begin
  if not public.can_payroll() then
    raise exception 'Only an Admin or a Sub-admin can mark attendance.'
      using errcode = 'P0001';
  end if;
  if v_day > current_date then
    raise exception 'That day has not happened yet.' using errcode = 'P0001';
  end if;
  if not exists (select 1 from public.salary_people where id = p_person_id and is_active) then
    raise exception 'That person is not on the payroll list.' using errcode = 'P0001';
  end if;

  -- 5 is Friday, counting Monday as 1.
  v_friday := extract(isodow from v_day) = 5;

  select case
           when p.pay_kind = 'daily' then p.daily_rate
           when v_friday then p.friday_bonus
         end
    into v_rate
  from public.payroll p where p.person_id = p_person_id and p.is_active;

  insert into public.attendance (person_id, on_date, present, rate, note, marked_by)
  values (p_person_id, v_day, p_present, v_rate,
          nullif(btrim(coalesce(p_note, '')), ''), auth.uid())
  on conflict (person_id, on_date) do update
    set present   = excluded.present,
        rate      = excluded.rate,
        note      = coalesce(excluded.note, public.attendance.note),
        marked_by = excluded.marked_by,
        marked_at = now();
end
$fn$;

-- -------------------------------------------------------------- the day
drop function if exists public.attendance_day(date);

create function public.attendance_day(p_on_date date default null)
returns table (
  person_id   uuid,
  full_name   text,
  job_title   text,
  pay_kind    text,
  daily_rate  numeric,
  /**
   * What this day is worth to him. Once marked, what was written down
   * then; before that, what it would be worth if he were marked in.
   */
  day_worth   numeric,
  present     boolean,
  marked_by_name text,
  marked_at   timestamptz
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_day    date := coalesce(p_on_date, current_date);
  v_friday boolean := extract(isodow from coalesce(p_on_date, current_date)) = 5;
begin
  if not public.can_payroll() then
    raise exception 'Only an Admin or a Sub-admin can see attendance.'
      using errcode = 'P0001';
  end if;

  return query
  select
    sp.id,
    coalesce(u.full_name, sp.full_name),
    coalesce(u.job_title, sp.job_title),
    p.pay_kind::text,
    p.daily_rate,
    -- A day already answered for keeps the figure it was answered with.
    -- Reading today's would mean that raising a bonus changed what a
    -- past Friday cost, and the day would stop agreeing with the month.
    coalesce(
      a.rate,
      case when p.pay_kind = 'daily' then p.daily_rate
           when v_friday then p.friday_bonus
           else 0 end
    )::numeric,
    a.present,
    mb.full_name,
    a.marked_at
  from public.salary_people sp
  join public.payroll p on p.person_id = sp.id and p.is_active
  left join public.app_users u on u.id = sp.user_id
  left join public.attendance a on a.person_id = sp.id and a.on_date = v_day
  left join public.app_users mb on mb.id = a.marked_by
  where sp.is_active
  order by (p.pay_kind <> 'daily'), coalesce(u.full_name, sp.full_name);
end
$fn$;

-- It gains a column, and Postgres will not replace a function's shape
-- in place. The signature is unchanged, so nothing is left behind.
drop function if exists public.attendance_day_total(date);

/** The day in one line: who is in, who is out, and what the day cost. */
create function public.attendance_day_total(p_on_date date default null)
returns table (
  people      bigint,
  present     bigint,
  absent      bigint,
  not_marked  bigint,
  wages       numeric,
  /** True when working today earns the monthly staff their bonus. */
  is_friday   boolean
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $fn$
begin
  if not public.can_payroll() then
    return query select 0::bigint, 0::bigint, 0::bigint, 0::bigint, 0::numeric, false;
    return;
  end if;

  return query
  select
    count(*)::bigint,
    count(*) filter (where d.present)::bigint,
    count(*) filter (where d.present = false)::bigint,
    count(*) filter (where d.present is null)::bigint,
    -- What the day costs: a daily man's wage, and a Friday bonus owed
    -- to any monthly man who came in.
    coalesce(sum(d.day_worth) filter (where d.present), 0)::numeric,
    extract(isodow from coalesce(p_on_date, current_date)) = 5
  from public.attendance_day(p_on_date) d;
end
$fn$;

-- ------------------------------------------------------------- the month
drop function if exists public.salary_month(date);

create function public.salary_month(p_month date default null)
returns table (
  person_id      uuid,
  full_name      text,
  job_title      text,
  pay_kind       text,
  monthly_amount numeric,
  daily_rate     numeric,
  /** What one worked Friday is worth to a monthly man. */
  friday_bonus   numeric,
  days_present   bigint,
  days_marked    bigint,
  /** Fridays he came in, and what they came to. Monthly staff only. */
  bonus_days     bigint,
  bonus_total    numeric,
  /** His month: the wage, plus bonuses - or the days, for a daily man. */
  earned         numeric,
  advance_paid   numeric,
  salary_paid    numeric,
  remaining      numeric,
  payments       bigint,
  on_payroll     boolean
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_month date := date_trunc('month', coalesce(p_month, current_date))::date;
  v_next  date := (v_month + interval '1 month')::date;
begin
  if not public.can_payroll() then
    raise exception 'Only an Admin or a Sub-admin can see the salaries.'
      using errcode = 'P0001';
  end if;

  return query
  with paid as (
    select s.person_id,
           coalesce(sum(s.amount) filter (where s.kind = 'advance'), 0) as adv,
           coalesce(sum(s.amount) filter (where s.kind = 'salary'), 0)  as sal,
           count(*) as n
    from public.salary_payments s
    where s.for_month = v_month and not s.is_deleted
    group by s.person_id
  ),
  worked as (
    -- Each day at what it was worth then, never at today's figure.
    select a.person_id,
           count(*) filter (where a.present) as days_in,
           count(*) as days_said,
           coalesce(sum(a.rate) filter (where a.present), 0) as worth,
           count(*) filter (where a.present and coalesce(a.rate, 0) > 0
                              and extract(isodow from a.on_date) = 5) as fridays
    from public.attendance a
    where a.on_date >= v_month and a.on_date < v_next
    group by a.person_id
  )
  select
    sp.id,
    coalesce(u.full_name, sp.full_name),
    coalesce(u.job_title, sp.job_title),
    coalesce(p.pay_kind::text, 'monthly'),
    coalesce(p.monthly_amount, 0)::numeric,
    coalesce(p.daily_rate, 0)::numeric,
    coalesce(p.friday_bonus, 0)::numeric,
    coalesce(worked.days_in, 0)::bigint,
    coalesce(worked.days_said, 0)::bigint,
    (case when p.pay_kind = 'daily' then 0 else coalesce(worked.fridays, 0) end)::bigint,
    (case when p.pay_kind = 'daily' then 0 else coalesce(worked.worth, 0) end)::numeric,
    (case when p.pay_kind = 'daily'
          then coalesce(worked.worth, 0)
          else coalesce(p.monthly_amount, 0) + coalesce(worked.worth, 0) end)::numeric,
    coalesce(paid.adv, 0)::numeric,
    coalesce(paid.sal, 0)::numeric,
    greatest(
      (case when p.pay_kind = 'daily'
            then coalesce(worked.worth, 0)
            else coalesce(p.monthly_amount, 0) + coalesce(worked.worth, 0) end)
      - coalesce(paid.adv, 0) - coalesce(paid.sal, 0), 0)::numeric,
    coalesce(paid.n, 0)::bigint,
    (p.person_id is not null and p.is_active)
  from public.salary_people sp
  left join public.app_users u on u.id = sp.user_id
  left join public.payroll p   on p.person_id = sp.id and p.is_active
  left join paid   on paid.person_id = sp.id
  left join worked on worked.person_id = sp.id
  where sp.is_active
    and (p.person_id is not null or paid.person_id is not null)
  order by (p.person_id is null), (coalesce(p.pay_kind::text, 'monthly') <> 'daily'), 2;
end
$fn$;

-- ------------------------------------------------------- setting it
drop function if exists public.set_payroll(uuid, uuid, numeric, date, text, public.pay_kind);

create function public.set_payroll(
  p_person_id uuid default null,
  p_user_id   uuid default null,
  p_amount    numeric default null,
  p_since     date default null,
  p_note      text default null,
  p_pay_kind  public.pay_kind default 'monthly',
  p_friday_bonus numeric default null
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_person uuid := p_person_id;
  v_kind   public.pay_kind := coalesce(p_pay_kind, 'monthly');
  v_bonus  numeric := coalesce(p_friday_bonus, 150);
begin
  if not public.can_payroll() then
    raise exception 'Only an Admin or a Sub-admin can set a salary.' using errcode = 'P0001';
  end if;
  if p_amount is null or p_amount <= 0 then
    if v_kind = 'daily' then
      raise exception 'Enter a daily wage bigger than zero.' using errcode = 'P0001';
    else
      raise exception 'Enter a monthly salary bigger than zero.' using errcode = 'P0001';
    end if;
  end if;
  if round(p_amount, 2) <> p_amount then
    raise exception 'A wage can have at most 2 decimals.' using errcode = 'P0001';
  end if;
  if v_bonus < 0 or round(v_bonus, 2) <> v_bonus then
    raise exception 'A Friday bonus cannot be negative, and can have at most 2 decimals.'
      using errcode = 'P0001';
  end if;

  if v_person is null then
    if p_user_id is null then
      raise exception 'Choose who this is for.' using errcode = 'P0001';
    end if;
    if not exists (select 1 from public.app_users where id = p_user_id and is_active) then
      raise exception 'That person is not on the books.' using errcode = 'P0001';
    end if;

    select sp.id into v_person from public.salary_people sp where sp.user_id = p_user_id;
    if v_person is null then
      insert into public.salary_people (full_name, job_title, user_id, added_by)
      select u.full_name, u.job_title, u.id, auth.uid()
      from public.app_users u where u.id = p_user_id
      returning salary_people.id into v_person;
    end if;
  end if;

  if not exists (select 1 from public.salary_people where id = v_person and is_active) then
    raise exception 'That person is not on the payroll list.' using errcode = 'P0001';
  end if;

  insert into public.payroll (person_id, pay_kind, monthly_amount, daily_rate,
                              friday_bonus, since, note, added_by)
  values (v_person, v_kind,
          case when v_kind = 'monthly' then p_amount end,
          case when v_kind = 'daily'   then p_amount end,
          v_bonus, coalesce(p_since, current_date),
          nullif(btrim(coalesce(p_note, '')), ''), auth.uid())
  on conflict (person_id) do update
    set pay_kind       = excluded.pay_kind,
        monthly_amount = excluded.monthly_amount,
        daily_rate     = excluded.daily_rate,
        friday_bonus   = excluded.friday_bonus,
        since          = excluded.since,
        note           = coalesce(excluded.note, public.payroll.note),
        is_active      = true;

  return v_person;
end
$fn$;

revoke all on function public.attendance_day(date) from public, anon;
revoke all on function public.attendance_day_total(date) from public, anon;
grant execute on function public.attendance_day_total(date) to authenticated;
revoke all on function public.salary_month(date) from public, anon;
revoke all on function public.set_payroll(uuid, uuid, numeric, date, text, public.pay_kind, numeric)
  from public, anon;
grant execute on function public.attendance_day(date) to authenticated;
grant execute on function public.salary_month(date) to authenticated;
grant execute on function public.set_payroll(uuid, uuid, numeric, date, text, public.pay_kind, numeric)
  to authenticated;
