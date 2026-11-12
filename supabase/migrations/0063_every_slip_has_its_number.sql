-- Every slip has its number.
--
-- A payslip handed over with nothing but a month on it is hard to
-- speak about afterwards. "Slip #7" is a thing a man can ask for by
-- name, and a thing the office can find.
--
-- The number is each man's own and counts his months: his first is #1,
-- the month after that #2, whether or not he worked a day in between.
-- It is worked out rather than stored, so taking the same slip twice
-- cannot quietly hand out two different numbers for the same month.
--
-- A monthly man shows in salary_month for every month there is, past
-- and future, because his wage is a standing figure. The months before
-- he ever appeared are all his #1 - there is no earlier slip for them
-- to be the second of. Their file names still differ, because the
-- month is in the name as well as the number.
--
-- Everything else in this function is exactly as 0061 left it. Adding a
-- column changes the return type, so it has to be dropped and made
-- again rather than replaced.

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
  on_payroll     boolean,
  /** Which of his own months this is: his first is 1. */
  slip_no        integer
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
  ),
  /*
   * The month each man's wages begin, from whichever of the three
   * knows first: when his payroll row was made, the first day anybody
   * marked him, and the first month he was handed anything.
   *
   * Not payroll.since, which is the obvious choice and is wrong: since
   * moves when a man is given a raise, and would put him back to slip
   * #1 the month his pay went up. added_at does not move - set_payroll
   * leaves it alone on an edit.
   */
  began as (
    select sp.id as person_id,
           least(
             (select date_trunc('month', pr.added_at)::date
                from public.payroll pr where pr.person_id = sp.id),
             (select date_trunc('month', min(a.on_date))::date
                from public.attendance a where a.person_id = sp.id),
             (select min(s.for_month) from public.salary_payments s
               where s.person_id = sp.id and not s.is_deleted)
           ) as first_month
      from public.salary_people sp
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
    (p.person_id is not null and p.is_active),
    -- Months are counted, not days, so a slip number cannot change
    -- halfway through a month. A man with no history at all is on his
    -- first: least() over three nulls is null, and greatest ignores it.
    greatest(
      1,
      (extract(year  from v_month)::int - extract(year  from began.first_month)::int) * 12
    + (extract(month from v_month)::int - extract(month from began.first_month)::int)
    + 1
    )::integer
  from public.salary_people sp
  left join public.app_users u on u.id = sp.user_id
  left join public.payroll p   on p.person_id = sp.id and p.is_active
  left join paid   on paid.person_id = sp.id
  left join worked on worked.person_id = sp.id
  left join began  on began.person_id  = sp.id
  where sp.is_active
    and (p.person_id is not null or paid.person_id is not null)
  order by (p.person_id is null), (coalesce(p.pay_kind::text, 'monthly') <> 'daily'), 2;
end
$fn$;

revoke all on function public.salary_month(date) from public, anon;
grant execute on function public.salary_month(date) to authenticated;
