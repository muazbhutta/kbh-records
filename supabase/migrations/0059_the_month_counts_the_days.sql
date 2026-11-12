-- The month counts the days.
--
-- A monthly man's figure is what he is on. A daily man's is the days he
-- turned up, each at what that day was worth to him. Everything else
-- about the month - what he took in advance, what he has been handed,
-- what is still owed - works the same for both.

-- Adding a parameter changes the signature, and PostgREST would then
-- see two shapes and refuse to call either.
drop function if exists public.set_payroll(uuid, uuid, numeric, date, text);

/**
 * Put somebody on the payroll, or change what they are on.
 *
 * `p_amount` is a month's wage for a monthly man and one day's wage for
 * a daily one. Which it means is `p_pay_kind`, and the table refuses a
 * row that carries the wrong one.
 */
create or replace function public.set_payroll(
  p_person_id uuid default null,
  p_user_id   uuid default null,
  p_amount    numeric default null,
  p_since     date default null,
  p_note      text default null,
  p_pay_kind  public.pay_kind default 'monthly'
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_person uuid := p_person_id;
  v_kind   public.pay_kind := coalesce(p_pay_kind, 'monthly');
begin
  if not public.is_admin() then
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
                              since, note, added_by)
  values (v_person, v_kind,
          case when v_kind = 'monthly' then p_amount end,
          case when v_kind = 'daily'   then p_amount end,
          coalesce(p_since, current_date),
          nullif(btrim(coalesce(p_note, '')), ''), auth.uid())
  on conflict (person_id) do update
    set pay_kind       = excluded.pay_kind,
        monthly_amount = excluded.monthly_amount,
        daily_rate     = excluded.daily_rate,
        since          = excluded.since,
        note           = coalesce(excluded.note, public.payroll.note),
        is_active      = true;

  return v_person;
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
  /** What he is on: a month's wage, or nought for a daily man. */
  monthly_amount numeric,
  /** One day's wage, or nought for a monthly man. */
  daily_rate     numeric,
  days_present   bigint,
  days_marked    bigint,
  /** What the month has earned him, whichever way he is paid. */
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
  ),
  worked as (
    -- Each day at the rate it was worth then, never at today's.
    select a.person_id,
           count(*) filter (where a.present) as days_in,
           count(*) as days_said,
           coalesce(sum(a.rate) filter (where a.present), 0) as wage
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
    coalesce(worked.days_in, 0)::bigint,
    coalesce(worked.days_said, 0)::bigint,
    (case when p.pay_kind = 'daily'
          then coalesce(worked.wage, 0)
          else coalesce(p.monthly_amount, 0) end)::numeric,
    coalesce(paid.adv, 0)::numeric,
    coalesce(paid.sal, 0)::numeric,
    greatest(
      (case when p.pay_kind = 'daily'
            then coalesce(worked.wage, 0)
            else coalesce(p.monthly_amount, 0) end)
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
    coalesce(sum(m.earned), 0)::numeric,
    coalesce(sum(m.advance_paid), 0)::numeric,
    coalesce(sum(m.salary_paid), 0)::numeric,
    coalesce(sum(m.remaining), 0)::numeric,
    count(*) filter (where m.on_payroll)::bigint
  from public.salary_month(p_month) m;
end
$fn$;

revoke all on function public.set_payroll(uuid, uuid, numeric, date, text, public.pay_kind)
  from public, anon;
revoke all on function public.salary_month(date) from public, anon;
grant execute on function public.set_payroll(uuid, uuid, numeric, date, text, public.pay_kind)
  to authenticated;
grant execute on function public.salary_month(date) to authenticated;
