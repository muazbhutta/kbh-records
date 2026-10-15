-- =====================================================================
--  Migration 0006 - "All time" on the dashboard
-- ---------------------------------------------------------------------
--  The two period functions now default to no bounds, so the app can ask
--  for everything by simply leaving the dates out.
-- =====================================================================

create or replace function public.dashboard_summary(
  p_from date default null,
  p_to   date default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_given    numeric := 0;
  v_expense  numeric := 0;
  v_returned numeric := 0;
  v_moved    numeric := 0;
  v_entries  bigint  := 0;
  v_cash     numeric := 0;
  v_owed     numeric := 0;
  v_holders  bigint  := 0;
  v_people   bigint  := 0;
  v_short    numeric := 0;
  v_shortp   bigint  := 0;
  v_checks   bigint  := 0;
  v_stale    bigint  := 0;
begin
  if not public.is_admin() then
    raise exception 'Only an Admin can see the dashboard.' using errcode = 'P0001';
  end if;

  select
    coalesce(sum(e.amount) filter (where e.type = 'money_given'), 0),
    coalesce(sum(e.amount) filter (where e.type = 'expense'), 0),
    coalesce(sum(e.amount) filter (where e.type = 'returned'), 0),
    coalesce(sum(e.amount) filter (where e.type = 'transfer'), 0),
    count(*)
  into v_given, v_expense, v_returned, v_moved, v_entries
  from public.entries e
  where not e.is_deleted
    and (p_from is null or e.bill_date >= p_from)
    and (p_to   is null or e.bill_date <= p_to);

  select
    coalesce(sum(greatest(t.balance, 0)), 0),
    coalesce(-sum(least(t.balance, 0)), 0),
    count(*) filter (where t.balance > 0)
  into v_cash, v_owed, v_holders
  from public.person_totals t
  join public.app_users u on u.id = t.person_id and u.is_active;

  select count(*) into v_people from public.app_users where is_active;

  select
    coalesce(-sum(c.difference) filter (where c.difference < 0), 0),
    count(distinct c.person_id) filter (where c.difference < 0),
    count(*)
  into v_short, v_shortp, v_checks
  from public.cash_checks c
  where not c.is_deleted
    and (p_from is null or c.checked_at::date >= p_from)
    and (p_to   is null or c.checked_at::date <= p_to);

  select count(*)
  into v_stale
  from public.app_users u
  left join public.person_check_summary s on s.person_id = u.id
  where u.is_active
    and (s.last_checked_at is null or s.last_checked_at < now() - interval '30 days');

  return jsonb_build_object(
    'money_given',      v_given,
    'expenses',         v_expense,
    'returned',         v_returned,
    'transfers',        v_moved,
    'entry_count',      v_entries,
    'cash_with_people', v_cash,
    'owed_back',        v_owed,
    'holder_count',     v_holders,
    'people_count',     v_people,
    'short_total',      v_short,
    'short_people',     v_shortp,
    'check_count',      v_checks,
    'unchecked_people', v_stale
  );
end
$fn$;

grant execute on function public.dashboard_summary(date, date) to authenticated;

create or replace function public.expenses_by_category(
  p_from date default null,
  p_to   date default null
)
returns table (category_id uuid, name text, icon text, total numeric, entry_count bigint)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $fn$
begin
  if not public.is_admin() then
    raise exception 'Only an Admin can see the dashboard.' using errcode = 'P0001';
  end if;

  return query
  select c.id, c.name, c.icon, coalesce(sum(e.amount), 0), count(e.id)
  from public.expense_categories c
  join public.entries e
    on e.category_id = c.id
   and not e.is_deleted
   and e.type = 'expense'
   and (p_from is null or e.bill_date >= p_from)
   and (p_to   is null or e.bill_date <= p_to)
  group by c.id, c.name, c.icon
  having sum(e.amount) > 0
  order by sum(e.amount) desc;
end
$fn$;

grant execute on function public.expenses_by_category(date, date) to authenticated;
