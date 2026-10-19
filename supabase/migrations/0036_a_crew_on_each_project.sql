-- Two changes the company asked for.
--
-- One: a head no longer hands his own cash to his people. That was put
-- in when the rule was that only a head could pass money down; the rule
-- has changed, and money now goes out from the office. The permission
-- goes with it, not just the button - a button removed from a screen is
-- a button, and the database is where a rule lives.
--
-- Two: an employee is put on a project by the office, and from then on
-- that is the only project he sees when he records what he spent. Not
-- every site the company is running - his. And he cannot write down a
-- new one: naming sites is the office's job.
--
-- "No project" stays available to everybody, because office tea and
-- petrol belong to nobody's site.

-- ------------------------------------- a head stops handing cash down
drop policy if exists entries_insert_employee on public.entries;
create policy entries_insert_employee on public.entries
  for insert to authenticated
  with check (
    public.is_active_user()
    and entered_by = auth.uid()
    and person_id = auth.uid()
    and type = 'expense'
  );

comment on policy entries_insert_employee on public.entries is
  'Anybody who is not an Admin records his own spending, and nothing else.';

-- --------------------------------------------------------- the crew
create table if not exists public.project_members (
  project_id uuid not null references public.projects (id) on delete cascade,
  person_id  uuid not null references public.app_users (id) on delete cascade,
  added_by   uuid references public.app_users (id) on delete set null,
  added_at   timestamptz not null default now(),
  primary key (project_id, person_id)
);

comment on table public.project_members is
  'Who works on which site. An employee files against these and no others.';

create index if not exists project_members_person_idx
  on public.project_members (person_id);

/**
 * The projects the signed-in person has been put on.
 *
 * Security definer, and deliberately so: the policy on projects asks
 * this question, and a policy that reads a table with its own policy is
 * how a database ends up chasing its own tail.
 */
create or replace function public.my_project_ids()
returns setof uuid
language sql
stable
security definer
set search_path = public, pg_temp
as $fn$
  select m.project_id
    from public.project_members m
   where m.person_id = auth.uid();
$fn$;

grant execute on function public.my_project_ids() to authenticated;

/**
 * May this person file an expense against this project?
 *
 * The office and the heads may use any site that is still open. Everyone
 * else may use the sites they have been put on. Nobody may use a site
 * that has been finished.
 */
create or replace function public.can_use_project(p_project_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $fn$
  select p_project_id is null or exists (
    select 1 from public.projects p
     where p.id = p_project_id
       and p.is_active
       and (
         public.can_file_projects()
         or p.id in (select public.my_project_ids())
       )
  );
$fn$;

grant execute on function public.can_use_project(uuid) to authenticated;

-- ------------------------------------------------------------- RLS
alter table public.project_members enable row level security;

drop policy if exists project_members_select on public.project_members;
create policy project_members_select on public.project_members
  for select to authenticated
  using (public.can_file_projects() or person_id = auth.uid());

drop policy if exists project_members_write on public.project_members;
create policy project_members_write on public.project_members
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin() and added_by = auth.uid());

comment on policy project_members_write on public.project_members is
  'Putting somebody on a site is the office''s decision, not a head''s.';

grant select, insert, delete on public.project_members to authenticated;

-- A person now sees the sites they have been put on, as well as all of
-- them if they are the office or a head.
drop policy if exists projects_select on public.projects;
create policy projects_select on public.projects
  for select to authenticated
  using (
    public.can_file_projects()
    or id in (select public.my_project_ids())
  );

comment on policy projects_select on public.projects is
  'The office and the heads see every site. Everyone else sees their own.';

-- ----------------------------------------------- putting people on a site
create or replace function public.add_to_project(p_project_id uuid, p_person_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
begin
  if not public.is_admin() then
    raise exception 'Only an Admin or a Sub-admin can put somebody on a project.'
      using errcode = 'P0001';
  end if;

  if not exists (select 1 from public.projects where id = p_project_id and is_active) then
    raise exception 'That project is finished, or not there.' using errcode = 'P0001';
  end if;

  if not exists (select 1 from public.app_users where id = p_person_id and is_active) then
    raise exception 'That person is not on the books.' using errcode = 'P0001';
  end if;

  insert into public.project_members (project_id, person_id, added_by)
  values (p_project_id, p_person_id, auth.uid())
  on conflict do nothing;
end
$fn$;

/**
 * Take somebody off a site. What they already spent on it stays on it -
 * they were there, and the books have to keep saying so.
 */
create or replace function public.remove_from_project(p_project_id uuid, p_person_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
begin
  if not public.is_admin() then
    raise exception 'Only an Admin or a Sub-admin can take somebody off a project.'
      using errcode = 'P0001';
  end if;

  delete from public.project_members
   where project_id = p_project_id and person_id = p_person_id;
end
$fn$;

/** Who is on this site, and what each of them has spent on it. */
create or replace function public.project_crew(p_project_id uuid)
returns table (
  person_id uuid,
  full_name text,
  job_title text,
  role      text,
  spent     numeric
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $fn$
begin
  if not public.can_file_projects() then
    raise exception 'Only an Admin, a Sub-admin or a head can see who is on a project.'
      using errcode = 'P0001';
  end if;

  return query
  select
    u.id,
    u.full_name,
    u.job_title,
    u.role::text,
    coalesce((
      select sum(e.amount) from public.entries e
       where e.project_id = p_project_id
         and e.person_id = u.id
         and e.type = 'expense'
         and not e.is_deleted and not e.is_cancelled
    ), 0)::numeric
  from public.project_members m
  join public.app_users u on u.id = m.person_id
  where m.project_id = p_project_id and u.is_active
  order by u.full_name;
end
$fn$;

revoke all on function public.add_to_project(uuid, uuid) from public, anon;
revoke all on function public.remove_from_project(uuid, uuid) from public, anon;
revoke all on function public.project_crew(uuid) from public, anon;
grant execute on function public.add_to_project(uuid, uuid) to authenticated;
grant execute on function public.remove_from_project(uuid, uuid) to authenticated;
grant execute on function public.project_crew(uuid) to authenticated;
