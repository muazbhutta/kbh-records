-- Projects: what the money was spent on.
--
-- entries.project_id has been sitting there since 0002, waiting for this
-- table. Old rows stay null, as that comment promised.
--
-- Who may put a project on an expense: an Admin, a Sub-admin, or a head
-- of employees. Not a plain employee - he records what he spent and
-- somebody who knows the sites files it afterwards. All three may also
-- write down a project that is not on the list yet, because a site gets
-- a name on the day work starts on it, not on the day the office gets
-- round to adding it.
--
-- Who may see what: an Admin and a Sub-admin see every project and the
-- whole of what was spent on it. A head sees only the projects his own
-- people have spent on, and only his own people's share of them - the
-- same window he has everywhere else in this app.
--
-- A project is never deleted. It is closed, and its history stays.

create table if not exists public.projects (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (length(btrim(name)) between 2 and 80),
  note        text check (note is null or length(note) <= 300),
  is_active   boolean not null default true,
  created_by  uuid references public.app_users (id) on delete set null,
  created_at  timestamptz not null default now(),
  closed_at   timestamptz
);

-- Two sites called "Al Khobar Villa" are a mistake, not two sites.
create unique index if not exists projects_name_unique
  on public.projects (lower(btrim(name)));

create index if not exists projects_active_idx on public.projects (is_active);

comment on table public.projects is
  'A site or job the company spends money on. Closed, never deleted.';

-- ------------------------------------------------- the link from an entry
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'entries_project_id_fkey'
  ) then
    alter table public.entries
      add constraint entries_project_id_fkey
      foreign key (project_id) references public.projects (id) on delete restrict;
  end if;
end $$;

-- A project is what money was spent on. Cash handed over, passed on or
-- given back is not spending, so it carries no project.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'entries_project_only_on_expense'
  ) then
    alter table public.entries
      add constraint entries_project_only_on_expense
      check (project_id is null or type = 'expense') not valid;
    alter table public.entries validate constraint entries_project_only_on_expense;
  end if;
end $$;

create index if not exists entries_project_idx
  on public.entries (project_id) where project_id is not null;

-- ------------------------------------------------------------- who is who
/** An Admin, a Sub-admin or a head: the people who know the sites. */
create or replace function public.can_file_projects()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $fn$
  select public.is_admin() or public.is_head();
$fn$;

grant execute on function public.can_file_projects() to authenticated;

/**
 * The people whose spending the signed-in person may look at: an Admin
 * sees everybody, a head sees his own people and himself.
 */
create or replace function public.my_people()
returns setof uuid
language sql
stable
security definer
set search_path = public, pg_temp
as $fn$
  select u.id from public.app_users u where public.is_admin()
  union
  select auth.uid() where public.is_head()
  union
  select public.my_team_ids() where public.is_head();
$fn$;

grant execute on function public.my_people() to authenticated;

-- ------------------------------------------------------------------- RLS
alter table public.projects enable row level security;

drop policy if exists projects_select on public.projects;
create policy projects_select on public.projects
  for select to authenticated
  using (public.can_file_projects());

comment on policy projects_select on public.projects is
  'The list of sites is for the people who file against them.';

drop policy if exists projects_insert on public.projects;
create policy projects_insert on public.projects
  for insert to authenticated
  with check (public.can_file_projects() and created_by = auth.uid());

drop policy if exists projects_update on public.projects;
create policy projects_update on public.projects
  for update to authenticated
  using (public.is_admin())
  with check (public.is_admin());

comment on policy projects_update on public.projects is
  'A head may start a project; renaming or closing one is the office''s job.';

grant select, insert on public.projects to authenticated;
grant update on public.projects to authenticated;

-- ------------------------------------------------------------- the feed
-- entry_feed already carries project_id; give it the name as well, so a
-- row in a khata can say what it was for without a second lookup.
drop view if exists public.entry_feed;
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
  e.pay_method,
  e.category_id,
  c.name                  as category_name,
  c.icon                  as category_icon,
  e.project_id,
  pr.name                 as project_name,
  e.system_id,
  e.expense_type,
  e.type_source,
  e.type_flags,
  e.bill_scan_state,
  (select count(*) from public.entry_photos p where p.entry_id = e.id)   as photo_count,
  (select p.thumb_path from public.entry_photos p
     where p.entry_id = e.id order by p.position, p.created_at limit 1)  as thumb_path
from public.entry_lines l
join public.entries e            on e.id = l.entry_id
left join public.people_names own   on own.id = e.person_id
left join public.people_names cp    on cp.id = e.counterparty_id
left join public.people_names other on other.id = l.other_person_id
left join public.people_names eb    on eb.id = e.entered_by
left join public.expense_categories c on c.id = e.category_id
left join public.projects pr          on pr.id = e.project_id;

grant select on public.entry_feed to authenticated;

-- ------------------------------------------------------ starting one off
/**
 * Write down a project. Hands back the one that is already there if the
 * name matches, so two people naming the same site on the same morning
 * end up filing against one project rather than two.
 */
create or replace function public.create_project(p_name text, p_note text default null)
returns public.projects
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_name text := btrim(coalesce(p_name, ''));
  v_row  public.projects;
begin
  if not public.can_file_projects() then
    raise exception 'Only an Admin, a Sub-admin or a head can start a project.'
      using errcode = 'P0001';
  end if;

  if length(v_name) < 2 then
    raise exception 'Give the project a name of at least 2 letters.'
      using errcode = 'P0001';
  end if;
  if length(v_name) > 80 then
    raise exception 'A project name can be at most 80 letters.'
      using errcode = 'P0001';
  end if;

  select * into v_row from public.projects
   where lower(btrim(name)) = lower(v_name);
  if found then
    return v_row;
  end if;

  insert into public.projects (name, note, created_by)
  values (v_name, nullif(btrim(coalesce(p_note, '')), ''), auth.uid())
  returning * into v_row;

  return v_row;
end
$fn$;

revoke all on function public.create_project(text, text) from public, anon;
grant execute on function public.create_project(text, text) to authenticated;

/**
 * Put a project on an expense that is already recorded, or take it off
 * again. This is how an employee's expense gets filed: he writes what he
 * spent, and somebody who knows the sites says what it was for.
 */
create or replace function public.set_entry_project(p_entry_id uuid, p_project_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_entry public.entries;
begin
  if not public.can_file_projects() then
    raise exception 'Only an Admin, a Sub-admin or a head can file an expense against a project.'
      using errcode = 'P0001';
  end if;

  select * into v_entry from public.entries where id = p_entry_id;
  if not found then
    raise exception 'That entry is not there.' using errcode = 'P0001';
  end if;
  if v_entry.type <> 'expense' then
    raise exception 'Only an expense belongs to a project.' using errcode = 'P0001';
  end if;
  if v_entry.is_deleted or v_entry.is_cancelled then
    raise exception 'That entry has been taken out of the books.' using errcode = 'P0001';
  end if;

  -- A head files his own people's expenses, and nobody else's.
  if not public.is_admin()
     and v_entry.person_id not in (select public.my_people()) then
    raise exception 'That expense is not one of your people''s.' using errcode = 'P0001';
  end if;

  if p_project_id is not null
     and not exists (select 1 from public.projects where id = p_project_id and is_active) then
    raise exception 'That project is closed, or not there.' using errcode = 'P0001';
  end if;

  update public.entries set project_id = p_project_id where id = p_entry_id;
end
$fn$;

revoke all on function public.set_entry_project(uuid, uuid) from public, anon;
grant execute on function public.set_entry_project(uuid, uuid) to authenticated;

-- ------------------------------------------------------------ the totals
/**
 * Every project with what has been spent on it. An Admin sees the whole
 * of each; a head sees his own people's share, and only of the projects
 * they have spent on.
 */
create or replace function public.project_totals(p_from date default null, p_to date default null)
returns table (
  project_id   uuid,
  name         text,
  is_active    boolean,
  spent        numeric,
  entry_count  bigint,
  people_count bigint,
  last_spend   date
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $fn$
begin
  if not public.can_file_projects() then
    raise exception 'Only an Admin, a Sub-admin or a head can see the projects.'
      using errcode = 'P0001';
  end if;

  return query
  select
    pr.id,
    pr.name,
    pr.is_active,
    coalesce(sum(e.amount), 0)::numeric,
    count(e.id)::bigint,
    count(distinct e.person_id)::bigint,
    max(e.bill_date)
  from public.projects pr
  left join public.entries e
    on e.project_id = pr.id
   and e.type = 'expense'
   and not e.is_deleted
   and not e.is_cancelled
   and (p_from is null or e.bill_date >= p_from)
   and (p_to   is null or e.bill_date <= p_to)
   and (public.is_admin() or e.person_id in (select public.my_people()))
  -- An Admin sees a project with nothing on it yet; a head has no
  -- business knowing about a site none of his people have touched.
  where public.is_admin() or exists (
    select 1 from public.entries x
     where x.project_id = pr.id
       and x.type = 'expense'
       and not x.is_deleted and not x.is_cancelled
       and x.person_id in (select public.my_people())
  )
  group by pr.id, pr.name, pr.is_active
  order by coalesce(sum(e.amount), 0) desc, pr.name;
end
$fn$;

revoke all on function public.project_totals(date, date) from public, anon;
grant execute on function public.project_totals(date, date) to authenticated;

/** What has been spent on one project but not filed under any project. */
create or replace function public.unfiled_expenses(p_from date default null, p_to date default null)
returns table (spent numeric, entry_count bigint)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $fn$
begin
  if not public.can_file_projects() then
    raise exception 'Only an Admin, a Sub-admin or a head can see the projects.'
      using errcode = 'P0001';
  end if;

  return query
  select coalesce(sum(e.amount), 0)::numeric, count(*)::bigint
  from public.entries e
  where e.project_id is null
    and e.type = 'expense'
    and not e.is_deleted
    and not e.is_cancelled
    and (p_from is null or e.bill_date >= p_from)
    and (p_to   is null or e.bill_date <= p_to)
    and (public.is_admin() or e.person_id in (select public.my_people()));
end
$fn$;

revoke all on function public.unfiled_expenses(date, date) from public, anon;
grant execute on function public.unfiled_expenses(date, date) to authenticated;

/** One project, split by the person who did the spending. */
create or replace function public.project_by_person(
  p_project_id uuid,
  p_from       date default null,
  p_to         date default null
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
  if not public.can_file_projects() then
    raise exception 'Only an Admin, a Sub-admin or a head can see the projects.'
      using errcode = 'P0001';
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
  where e.type = 'expense'
    and not e.is_deleted
    and not e.is_cancelled
    and (p_project_id is null and e.project_id is null
         or e.project_id = p_project_id)
    and (p_from is null or e.bill_date >= p_from)
    and (p_to   is null or e.bill_date <= p_to)
    and (public.is_admin() or e.person_id in (select public.my_people()))
  group by u.id, u.full_name, u.job_title, u.is_active
  order by sum(e.amount) desc, u.full_name;
end
$fn$;

revoke all on function public.project_by_person(uuid, date, date) from public, anon;
grant execute on function public.project_by_person(uuid, date, date) to authenticated;
