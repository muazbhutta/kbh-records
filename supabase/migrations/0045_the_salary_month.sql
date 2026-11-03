-- What the office looks at: one month, one line per person.
--
-- The question an office actually has on payday is not "what did we
-- pay" but "what is still owed, and who already took some of it". So
-- every line carries the four figures that answer it together: what he
-- is on, what he took in advance, what he has been paid, and what is
-- left.

create or replace function public.salary_month(p_month date default null)
returns table (
  person_id      uuid,
  full_name      text,
  job_title      text,
  monthly_amount numeric,
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
begin
  if not public.is_admin() then
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
  )
  select
    u.id,
    u.full_name,
    u.job_title,
    coalesce(p.monthly_amount, 0)::numeric,
    coalesce(paid.adv, 0)::numeric,
    coalesce(paid.sal, 0)::numeric,
    -- What is still owed. Never below nought: paying somebody more than
    -- their salary is a thing that happens, and it is not a debt the
    -- other way round.
    greatest(coalesce(p.monthly_amount, 0) - coalesce(paid.adv, 0) - coalesce(paid.sal, 0), 0)::numeric,
    coalesce(paid.n, 0)::bigint,
    (p.person_id is not null and p.is_active)
  from public.app_users u
  left join public.payroll p on p.person_id = u.id and p.is_active
  left join paid on paid.person_id = u.id
  -- Everybody on the payroll, and anybody paid this month even if they
  -- have since come off it - a month must not quietly lose a payment.
  where u.is_active
    and (p.person_id is not null or paid.person_id is not null)
  order by (p.person_id is null), u.full_name;
end
$fn$;

/** Every payment in a month, for the list under each person. */
create or replace function public.salary_month_payments(p_month date default null)
returns table (
  id         bigint,
  person_id  uuid,
  full_name  text,
  amount     numeric,
  kind       text,
  paid_on    date,
  method     text,
  note       text,
  entered_by_name text,
  entered_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_month date := date_trunc('month', coalesce(p_month, current_date))::date;
begin
  if not public.is_admin() then
    raise exception 'Only an Admin or a Sub-admin can see the salaries.'
      using errcode = 'P0001';
  end if;

  return query
  select s.id, s.person_id, u.full_name, s.amount, s.kind, s.paid_on,
         s.method::text, s.note, eb.full_name, s.entered_at
  from public.salary_payments s
  join public.app_users u on u.id = s.person_id
  left join public.app_users eb on eb.id = s.entered_by
  where s.for_month = v_month and not s.is_deleted
  order by s.paid_on desc, s.entered_at desc;
end
$fn$;

/** The month in one line, for the card at the top and the dashboard. */
create or replace function public.salary_month_total(p_month date default null)
returns table (
  payroll_total numeric,
  advance_paid  numeric,
  salary_paid   numeric,
  remaining     numeric,
  people        bigint
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $fn$
begin
  if not public.is_admin() then
    return query select 0::numeric, 0::numeric, 0::numeric, 0::numeric, 0::bigint;
    return;
  end if;

  return query
  select
    coalesce(sum(m.monthly_amount), 0)::numeric,
    coalesce(sum(m.advance_paid), 0)::numeric,
    coalesce(sum(m.salary_paid), 0)::numeric,
    coalesce(sum(m.remaining), 0)::numeric,
    count(*) filter (where m.on_payroll)::bigint
  from public.salary_month(p_month) m;
end
$fn$;

/** Which months have anything in them, newest first, for the chooser. */
create or replace function public.salary_months()
returns table (month date, paid numeric)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $fn$
begin
  if not public.is_admin() then
    raise exception 'Only an Admin or a Sub-admin can see the salaries.'
      using errcode = 'P0001';
  end if;

  return query
  select s.for_month, sum(s.amount)::numeric
  from public.salary_payments s
  where not s.is_deleted
  group by s.for_month
  order by s.for_month desc;
end
$fn$;

revoke all on function public.salary_month(date) from public, anon;
revoke all on function public.salary_month_payments(date) from public, anon;
revoke all on function public.salary_month_total(date) from public, anon;
revoke all on function public.salary_months() from public, anon;
grant execute on function public.salary_month(date) to authenticated;
grant execute on function public.salary_month_payments(date) to authenticated;
grant execute on function public.salary_month_total(date) to authenticated;
grant execute on function public.salary_months() to authenticated;
