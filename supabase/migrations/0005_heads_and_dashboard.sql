-- =====================================================================
--  Migration 0005 - Heads (who works under whom) + dashboard figures
-- ---------------------------------------------------------------------
--  Heads
--    A person can be marked as a head, and other people can be put under
--    a head. The People screen then shows "4 people under" on the head,
--    and "Under Rana" on everyone in that team.
--
--  Dashboard
--    Every number on the dashboard is worked out here in SQL, in one
--    call each, so a phone on a weak site connection only waits once.
-- =====================================================================

-- ================================================================ heads
alter table public.app_users
  add column if not exists is_head boolean not null default false,
  add column if not exists head_id uuid references public.app_users (id) on delete set null;

comment on column public.app_users.is_head is
  'Can have people put under them.';
comment on column public.app_users.head_id is
  'Which head this person works under. Null means nobody.';

create index if not exists app_users_head_idx on public.app_users (head_id) where head_id is not null;
create index if not exists app_users_is_head_idx on public.app_users (is_head) where is_head;

create or replace function public.app_users_head_guard()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_walk  uuid;
  v_steps int := 0;
  v_team  int;
begin
  if new.head_id is not null then
    if new.head_id = new.id then
      raise exception 'A person cannot work under themselves.' using errcode = 'P0001';
    end if;

    if not exists (select 1 from public.app_users h where h.id = new.head_id and h.is_head) then
      raise exception 'That person is not a head.' using errcode = 'P0001';
    end if;

    -- Walk up the chain so a team can never loop back on itself.
    v_walk := new.head_id;
    while v_walk is not null and v_steps < 25 loop
      if v_walk = new.id then
        raise exception 'That would put the team in a circle.' using errcode = 'P0001';
      end if;
      select head_id into v_walk from public.app_users where id = v_walk;
      v_steps := v_steps + 1;
    end loop;
  end if;

  -- A head with people under them stays a head until the team is moved.
  if tg_op = 'UPDATE' and old.is_head and not new.is_head then
    select count(*) into v_team
      from public.app_users u
     where u.head_id = new.id;
    if v_team > 0 then
      raise exception
        '% % under this head. Move them to another head first.',
        v_team, case when v_team = 1 then 'person works' else 'people work' end
        using errcode = 'P0001';
    end if;
  end if;

  return new;
end
$fn$;

drop trigger if exists app_users_head_guard_trg on public.app_users;
create trigger app_users_head_guard_trg
  before insert or update on public.app_users
  for each row execute function public.app_users_head_guard();

-- Names, now saying who is a head, for the pickers.
drop view if exists public.people_names cascade;
create view public.people_names
with (security_invoker = false)
as
select u.id, u.full_name, u.is_active, u.is_owner, u.is_head, u.head_id
from public.app_users u;

revoke all on public.people_names from anon;
grant select on public.people_names to authenticated;

-- ================================================= rebuilt views
-- (people_names was dropped with cascade, so these come back with it.)

drop view if exists public.entry_feed cascade;
create view public.entry_feed
with (security_invoker = true)
as
select
  l.entry_id              as id,
  l.person_id,
  l.line_type,
  l.signed_amount,
  e.type,
  e.amount,
  e.bill_date,
  e.entered_at,
  e.note,
  e.person_id             as owner_id,
  own.full_name           as owner_name,
  e.counterparty_id,
  cp.full_name            as counterparty_name,
  l.other_person_id,
  other.full_name         as other_person_name,
  e.entered_by,
  eb.full_name            as entered_by_name,
  (e.entered_by <> e.person_id) as entered_for_someone_else,
  e.duplicate_photo,
  e.category_id,
  c.name                  as category_name,
  c.icon                  as category_icon,
  e.project_id,
  (select count(*) from public.entry_photos p where p.entry_id = e.id)   as photo_count,
  (select p.thumb_path from public.entry_photos p
     where p.entry_id = e.id order by p.position, p.created_at limit 1)  as thumb_path
from public.entry_lines l
join public.entries e            on e.id = l.entry_id
left join public.people_names own   on own.id = e.person_id
left join public.people_names cp    on cp.id = e.counterparty_id
left join public.people_names other on other.id = l.other_person_id
left join public.people_names eb    on eb.id = e.entered_by
left join public.expense_categories c on c.id = e.category_id;

grant select on public.entry_feed to authenticated;

drop view if exists public.cash_check_feed cascade;
create view public.cash_check_feed
with (security_invoker = true)
as
select
  c.id,
  c.person_id,
  p.full_name  as person_name,
  c.expected,
  c.counted,
  c.difference,
  case
    when c.difference < 0 then 'short'
    when c.difference > 0 then 'extra'
    else 'matched'
  end          as result,
  c.note,
  c.checked_by,
  b.full_name  as checked_by_name,
  c.checked_at
from public.cash_checks c
left join public.people_names p on p.id = c.person_id
left join public.people_names b on b.id = c.checked_by
where not c.is_deleted;

grant select on public.cash_check_feed to authenticated;

drop view if exists public.audit_feed cascade;
create view public.audit_feed
with (security_invoker = true)
as
select
  a.id, a.table_name, a.row_id, a.action, a.at,
  a.actor_id, a.actor_name, a.person_id,
  pn.full_name as person_name,
  a.summary, a.changes
from public.audit_log a
left join public.people_names pn on pn.id = a.person_id;

grant select on public.audit_feed to authenticated;

drop view if exists public.deleted_entries cascade;
create view public.deleted_entries
with (security_invoker = true)
as
select
  e.id, e.type, e.amount, e.bill_date, e.note, e.delete_reason,
  e.person_id, own.full_name as person_name,
  e.counterparty_id, cp.full_name as counterparty_name,
  e.entered_by, eb.full_name as entered_by_name,
  e.entered_at, e.deleted_at, e.deleted_by, db.full_name as deleted_by_name,
  c.name as category_name, c.icon as category_icon
from public.entries e
left join public.people_names own on own.id = e.person_id
left join public.people_names cp  on cp.id = e.counterparty_id
left join public.people_names eb  on eb.id = e.entered_by
left join public.people_names db  on db.id = e.deleted_by
left join public.expense_categories c on c.id = e.category_id
where e.is_deleted;

grant select on public.deleted_entries to authenticated;

-- People, now carrying their head and the size of their team.
drop view if exists public.people_list cascade;
create view public.people_list
with (security_invoker = true)
as
select
  u.id,
  u.full_name,
  u.mobile,
  u.role,
  u.is_owner,
  u.is_active,
  u.job_title,
  u.is_head,
  u.head_id,
  h.full_name                        as head_name,
  coalesce(tm.team_count, 0)         as team_count,
  u.created_at,
  u.disabled_at,
  c.full_name                        as created_by_name,
  coalesce(t.money_given, 0)         as money_given,
  coalesce(t.transfers_in, 0)        as transfers_in,
  coalesce(t.transfers_out, 0)       as transfers_out,
  coalesce(t.expenses, 0)            as expenses,
  coalesce(t.returned, 0)            as returned,
  coalesce(t.balance, 0)             as balance,
  coalesce(t.entry_count, 0)         as entry_count,
  le.last_entry_at,
  coalesce(s.check_count, 0)         as check_count,
  coalesce(s.short_count, 0)         as short_count,
  coalesce(s.total_short, 0)         as total_short,
  coalesce(s.total_extra, 0)         as total_extra,
  s.last_checked_at,
  lc.difference                      as last_check_difference,
  lc.result                          as last_check_result
from public.app_users u
left join public.app_users c on c.id = u.created_by
left join public.app_users h on h.id = u.head_id
left join public.person_totals t on t.person_id = u.id
left join public.person_check_summary s on s.person_id = u.id
left join lateral (
  select count(*) as team_count
  from public.app_users m
  where m.head_id = u.id and m.is_active
) tm on true
left join lateral (
  select max(e.entered_at) as last_entry_at
  from public.entries e
  where not e.is_deleted and (e.person_id = u.id or e.counterparty_id = u.id)
) le on true
left join lateral (
  select f.difference, f.result
  from public.cash_check_feed f
  where f.person_id = u.id
  order by f.checked_at desc
  limit 1
) lc on true;

grant select on public.people_list to authenticated;

-- One row per head: how many people, and how much cash the team holds.
drop view if exists public.team_summary cascade;
create view public.team_summary
with (security_invoker = true)
as
select
  h.id                                             as head_id,
  h.full_name                                      as head_name,
  h.job_title                                      as head_job_title,
  count(m.id) filter (where m.is_active)           as people_count,
  coalesce(sum(greatest(coalesce(mt.balance, 0), 0))
           filter (where m.is_active), 0)          as team_cash,
  coalesce(greatest(coalesce(ht.balance, 0), 0), 0) as head_cash
from public.app_users h
left join public.app_users m on m.head_id = h.id
left join public.person_totals mt on mt.person_id = m.id
left join public.person_totals ht on ht.person_id = h.id
where h.is_head
group by h.id, h.full_name, h.job_title, ht.balance;

grant select on public.team_summary to authenticated;

-- ============================================== dashboard figures
-- Admin only, and worked out in one pass each.

create or replace function public.dashboard_summary(p_from date, p_to date)
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

  -- Cash in hand is a "right now" figure, not a period one.
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

create or replace function public.expenses_by_month(p_months integer default 12)
returns table (month date, label text, total numeric)
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
  with months as (
    select (date_trunc('month', (now() at time zone 'Asia/Riyadh')::date)
            - (n || ' months')::interval)::date as m
    from generate_series(greatest(p_months, 1) - 1, 0, -1) as n
  )
  select
    months.m,
    to_char(months.m, 'Mon'),
    coalesce(sum(e.amount), 0)
  from months
  left join public.entries e
    on not e.is_deleted
   and e.type = 'expense'
   and date_trunc('month', e.bill_date)::date = months.m
  group by months.m
  order by months.m;
end
$fn$;

grant execute on function public.expenses_by_month(integer) to authenticated;

create or replace function public.expenses_by_category(p_from date, p_to date)
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

create or replace function public.top_cash_holders(p_limit integer default 5)
returns table (person_id uuid, full_name text, balance numeric, head_name text)
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
  select u.id, u.full_name, t.balance, h.full_name
  from public.person_totals t
  join public.app_users u on u.id = t.person_id and u.is_active
  left join public.app_users h on h.id = u.head_id
  where t.balance > 0
  order by t.balance desc
  limit greatest(p_limit, 1);
end
$fn$;

grant execute on function public.top_cash_holders(integer) to authenticated;

create or replace function public.people_needing_check(p_days integer default 30)
returns table (person_id uuid, full_name text, last_checked_at timestamptz, balance numeric)
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
  select u.id, u.full_name, s.last_checked_at, coalesce(t.balance, 0)
  from public.app_users u
  left join public.person_check_summary s on s.person_id = u.id
  left join public.person_totals t on t.person_id = u.id
  where u.is_active
    and (s.last_checked_at is null
         or s.last_checked_at < now() - make_interval(days => greatest(p_days, 1)))
  order by coalesce(t.balance, 0) desc, u.full_name;
end
$fn$;

grant execute on function public.people_needing_check(integer) to authenticated;
