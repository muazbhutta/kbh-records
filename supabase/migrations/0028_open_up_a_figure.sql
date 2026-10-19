-- The three figures on the dashboard -- Money Given, Expenses, Returned --
-- were numbers you could only look at. A number on its own raises the
-- question it does not answer: who, and when.
--
-- These two functions let the app open a figure up. The first breaks it
-- into people, the second breaks one person's share into days. The third
-- step, the entries on a day, the app already has: entry_feed, filtered
-- by person and by one date.
--
-- Both count exactly what dashboard_summary counts -- same types, same
-- dates, deleted and cancelled entries left out -- so the parts always
-- add back up to the figure on the card.

create or replace function public.breakdown_by_person(
  p_type text,
  p_from date default null,
  p_to   date default null
)
returns table (
  person_id   uuid,
  full_name   text,
  job_title   text,
  is_active   boolean,
  total       numeric,
  entry_count bigint
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $fn$
begin
  if not public.is_admin() then
    raise exception 'Only an Admin can open up a dashboard figure.'
      using errcode = 'P0001';
  end if;

  if p_type not in ('money_given', 'expense', 'returned', 'transfer') then
    raise exception 'Not a kind of entry: %', p_type using errcode = 'P0001';
  end if;

  return query
  select
    u.id,
    u.full_name,
    u.job_title,
    u.is_active,
    sum(e.amount)::numeric,
    count(*)::bigint
  from public.entries e
  join public.app_users u on u.id = e.person_id
  where e.type = p_type::public.entry_type
    and not e.is_deleted
    and not e.is_cancelled
    and (p_from is null or e.bill_date >= p_from)
    and (p_to   is null or e.bill_date <= p_to)
  group by u.id, u.full_name, u.job_title, u.is_active
  order by sum(e.amount) desc, u.full_name;
end
$fn$;

comment on function public.breakdown_by_person(text, date, date) is
  'One figure on the dashboard, split by the person it belongs to.';

create or replace function public.breakdown_by_date(
  p_type      text,
  p_person_id uuid,
  p_from      date default null,
  p_to        date default null
)
returns table (
  bill_date   date,
  total       numeric,
  entry_count bigint
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $fn$
begin
  if not public.is_admin() then
    raise exception 'Only an Admin can open up a dashboard figure.'
      using errcode = 'P0001';
  end if;

  if p_type not in ('money_given', 'expense', 'returned', 'transfer') then
    raise exception 'Not a kind of entry: %', p_type using errcode = 'P0001';
  end if;

  return query
  select
    e.bill_date,
    sum(e.amount)::numeric,
    count(*)::bigint
  from public.entries e
  where e.type = p_type::public.entry_type
    and e.person_id = p_person_id
    and not e.is_deleted
    and not e.is_cancelled
    and (p_from is null or e.bill_date >= p_from)
    and (p_to   is null or e.bill_date <= p_to)
  group by e.bill_date
  order by e.bill_date desc;
end
$fn$;

comment on function public.breakdown_by_date(text, uuid, date, date) is
  'One person''s share of a dashboard figure, split by the day it happened.';

revoke all on function public.breakdown_by_person(text, date, date) from public, anon;
revoke all on function public.breakdown_by_date(text, uuid, date, date) from public, anon;
grant execute on function public.breakdown_by_person(text, date, date) to authenticated;
grant execute on function public.breakdown_by_date(text, uuid, date, date) to authenticated;
