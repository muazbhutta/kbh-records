-- The payroll functions now speak of the roster, not of app users.
--
-- Same figures, same rules. The only change is who a person_id names,
-- and that a man can be put on salary without being handed a login.

-- The old signature has to go before the new one arrives, or PostgREST
-- sees two and refuses to call either.
drop function if exists public.set_payroll(uuid, numeric, date, text);

/**
 * Put somebody on the payroll, or change what they are on.
 *
 * Give it a roster id, or an app user's id for a man who has an account
 * but is not on the roster yet - he is written onto it here.
 */
create or replace function public.set_payroll(
  p_person_id uuid,
  p_user_id   uuid default null,
  p_amount    numeric default null,
  p_since     date default null,
  p_note      text default null
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_person uuid := p_person_id;
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

  insert into public.payroll (person_id, monthly_amount, since, note, added_by)
  values (v_person, p_amount, coalesce(p_since, current_date),
          nullif(btrim(coalesce(p_note, '')), ''), auth.uid())
  on conflict (person_id) do update
    set monthly_amount = excluded.monthly_amount,
        since          = excluded.since,
        note           = coalesce(excluded.note, public.payroll.note),
        is_active      = true;

  return v_person;
end
$fn$;

/**
 * Take somebody off the payroll.
 *
 * Ever paid, and the row stays, switched off: the months he was paid
 * for have to keep saying what they paid. Never paid, and he goes from
 * the roster altogether - a name typed by mistake should leave no mark.
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
  delete from public.salary_people where id = p_person_id;
  return 'removed';
end
$fn$;

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
  if not exists (select 1 from public.salary_people where id = p_person_id and is_active) then
    raise exception 'That person is not on the payroll list.' using errcode = 'P0001';
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

-- ------------------------------------------------------------- the month
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
    sp.id,
    coalesce(u.full_name, sp.full_name),
    coalesce(u.job_title, sp.job_title),
    coalesce(p.monthly_amount, 0)::numeric,
    coalesce(paid.adv, 0)::numeric,
    coalesce(paid.sal, 0)::numeric,
    greatest(coalesce(p.monthly_amount, 0) - coalesce(paid.adv, 0) - coalesce(paid.sal, 0), 0)::numeric,
    coalesce(paid.n, 0)::bigint,
    (p.person_id is not null and p.is_active)
  from public.salary_people sp
  left join public.app_users u on u.id = sp.user_id
  left join public.payroll p   on p.person_id = sp.id and p.is_active
  left join paid on paid.person_id = sp.id
  where sp.is_active
    and (p.person_id is not null or paid.person_id is not null)
  order by (p.person_id is null), 2;
end
$fn$;

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
  select s.id, s.person_id, coalesce(u.full_name, sp.full_name), s.amount, s.kind, s.paid_on,
         s.method::text, s.note, eb.full_name, s.entered_at
  from public.salary_payments s
  join public.salary_people sp on sp.id = s.person_id
  left join public.app_users u  on u.id = sp.user_id
  left join public.app_users eb on eb.id = s.entered_by
  where s.for_month = v_month and not s.is_deleted
  order by s.paid_on desc, s.entered_at desc;
end
$fn$;

revoke all on function public.set_payroll(uuid, uuid, numeric, date, text) from public, anon;
grant execute on function public.set_payroll(uuid, uuid, numeric, date, text) to authenticated;
