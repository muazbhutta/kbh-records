-- A day's work, and a day's wage.
--
-- KBH pays two sorts of men. One draws a fixed wage every month and it
-- does not matter how the month went. The other is paid for the days he
-- turned up: a rate, times the days. The app only knew the first, so the
-- office had been writing the daily men's RATE into the monthly box and
-- marking them "Dehaari" in the job title to tell them apart - Ibrar at
-- 110, and Asif, Sajid, Akbar and Mujahid at 100. Not one of them has
-- been paid through the app yet, so they can be moved across cleanly.
--
-- Attendance is kept for everybody, daily men and monthly staff alike.
-- For the daily men it is what their wage is made of. For the monthly
-- staff it changes nothing about their pay and is kept because the
-- office wants the record.

create type public.pay_kind as enum ('monthly', 'daily');

comment on type public.pay_kind is
  'Paid a fixed wage each month, or paid for the days he turned up.';

-- ------------------------------------------------------------ the payroll
alter table public.payroll
  add column if not exists pay_kind public.pay_kind not null default 'monthly';

alter table public.payroll
  add column if not exists daily_rate numeric(12, 2);

comment on column public.payroll.daily_rate is
  'One day''s wage. Only for a daily man; a monthly one has none.';

-- The monthly box has to be allowed to be empty before anybody can be
-- moved out of it.
alter table public.payroll alter column monthly_amount drop not null;

-- The men the office had already marked as daily, moved to where they
-- belong: what was in the monthly box was never a month's wage.
update public.payroll p
   set pay_kind       = 'daily',
       daily_rate     = p.monthly_amount,
       monthly_amount = null
  from public.salary_people sp
 where sp.id = p.person_id
   and lower(btrim(coalesce(sp.job_title, ''))) = 'dehaari'
   and p.pay_kind = 'monthly';

-- Only now, with nothing left that would fail it: a row has to carry
-- exactly the one rate its kind is paid by, and no other.
alter table public.payroll drop constraint if exists payroll_rate_matches_kind;
alter table public.payroll add constraint payroll_rate_matches_kind check (
  (pay_kind = 'monthly' and monthly_amount is not null and monthly_amount > 0
                        and daily_rate is null)
  or
  (pay_kind = 'daily'   and daily_rate is not null and daily_rate > 0
                        and monthly_amount is null)
);

-- --------------------------------------------------------- the attendance
/**
 * One man, one day, and whether he turned up.
 *
 * The rate is written down with the day. A daily man's wage is the sum
 * of the days he worked, and if that were read from his rate as it
 * stands today, then raising his rate would quietly raise every month
 * he has already been paid for. The day keeps the rate it was worth.
 *
 * No row means nobody has said yet. That is not the same as absent,
 * and the screens say so.
 */
create table if not exists public.attendance (
  person_id uuid not null references public.salary_people (id) on delete cascade,
  on_date   date not null,
  present   boolean not null,
  /** What a day was worth to him then. Null for a man on a monthly wage. */
  rate      numeric(12, 2) check (rate is null or rate >= 0),
  note      text check (note is null or length(note) <= 200),
  marked_by uuid references public.app_users (id) on delete set null,
  marked_at timestamptz not null default now(),
  primary key (person_id, on_date)
);

comment on table public.attendance is
  'Who turned up, on which day, and what that day was worth to him.';

create index if not exists attendance_date_idx on public.attendance (on_date desc);

alter table public.attendance enable row level security;

drop policy if exists attendance_office on public.attendance;
create policy attendance_office on public.attendance
  for select to authenticated using (public.is_admin());

comment on policy attendance_office on public.attendance is
  'Who worked which day is the office''s business, as the wages are.';

grant select on public.attendance to authenticated;

-- ------------------------------------------------------------- marking it
/** Say whether a man turned up. Saying it twice just corrects it. */
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
  v_day  date := coalesce(p_on_date, current_date);
  v_rate numeric;
begin
  if not public.is_admin() then
    raise exception 'Only an Admin or a Sub-admin can mark attendance.'
      using errcode = 'P0001';
  end if;
  if v_day > current_date then
    raise exception 'That day has not happened yet.' using errcode = 'P0001';
  end if;
  if not exists (select 1 from public.salary_people where id = p_person_id and is_active) then
    raise exception 'That person is not on the payroll list.' using errcode = 'P0001';
  end if;

  -- A daily man's day is worth his rate as it stands now; that figure
  -- is kept with the day so a later raise cannot reach back into it.
  select case when p.pay_kind = 'daily' then p.daily_rate end into v_rate
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

/** Take a mark off again, for a day nobody should have answered for. */
create or replace function public.clear_attendance(p_person_id uuid, p_on_date date)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
begin
  if not public.is_admin() then
    raise exception 'Only an Admin or a Sub-admin can change attendance.'
      using errcode = 'P0001';
  end if;
  delete from public.attendance where person_id = p_person_id and on_date = p_on_date;
end
$fn$;

-- -------------------------------------------------------------- reading it
/** Everybody on the payroll, and what today says about each of them. */
create or replace function public.attendance_day(p_on_date date default null)
returns table (
  person_id   uuid,
  full_name   text,
  job_title   text,
  pay_kind    text,
  daily_rate  numeric,
  /** True, false, or null where nobody has said. */
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
  v_day date := coalesce(p_on_date, current_date);
begin
  if not public.is_admin() then
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

/** The day in one line: who is in, who is out, and what the day cost. */
create or replace function public.attendance_day_total(p_on_date date default null)
returns table (
  people      bigint,
  present     bigint,
  absent      bigint,
  not_marked  bigint,
  wages       numeric
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $fn$
begin
  if not public.is_admin() then
    return query select 0::bigint, 0::bigint, 0::bigint, 0::bigint, 0::numeric;
    return;
  end if;

  return query
  select
    count(*)::bigint,
    count(*) filter (where d.present)::bigint,
    count(*) filter (where d.present = false)::bigint,
    count(*) filter (where d.present is null)::bigint,
    coalesce(sum(d.daily_rate) filter (where d.present and d.pay_kind = 'daily'), 0)::numeric
  from public.attendance_day(p_on_date) d;
end
$fn$;

revoke all on function public.mark_attendance(uuid, date, boolean, text) from public, anon;
revoke all on function public.clear_attendance(uuid, date) from public, anon;
revoke all on function public.attendance_day(date) from public, anon;
revoke all on function public.attendance_day_total(date) from public, anon;
grant execute on function public.mark_attendance(uuid, date, boolean, text) to authenticated;
grant execute on function public.clear_attendance(uuid, date) to authenticated;
grant execute on function public.attendance_day(date) to authenticated;
grant execute on function public.attendance_day_total(date) to authenticated;
