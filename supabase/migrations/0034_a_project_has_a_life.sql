-- A project has a life: it starts, money goes on it, and one day it is
-- finished. Until now the table knew only that it existed.
--
-- Started is its own date, not the moment somebody got round to typing
-- the name in. Work begins on a site weeks before the office catches up,
-- and a start date that quietly means "when this was typed" is a date
-- that will be read as the real one and be wrong.
--
-- Finished is a decision, not a guess: an Admin says so, and after that
-- nothing new can be put on the project. It can be opened again, because
-- the wrong button gets pressed.
--
-- And the one that matters most: a project with money on it is never
-- deleted. It is renamed. Only a project nobody has spent a riyal on -
-- the name typed by mistake - can be removed, and then nothing is lost
-- because there was nothing there.

alter table public.projects
  add column if not exists started_on date not null default current_date;

comment on column public.projects.started_on is
  'When work started on the site, which is not the day the name was typed.';

update public.projects set started_on = created_at::date
 where started_on = current_date and created_at::date <> current_date;

-- ----------------------------------------------------------- finishing
create or replace function public.close_project(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
begin
  if not public.is_admin() then
    raise exception 'Only an Admin or a Sub-admin can finish a project.'
      using errcode = 'P0001';
  end if;

  update public.projects
     set is_active = false, closed_at = coalesce(closed_at, now())
   where id = p_id and is_active;

  if not found then
    raise exception 'That project is not there, or is already finished.'
      using errcode = 'P0001';
  end if;
end
$fn$;

create or replace function public.reopen_project(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
begin
  if not public.is_admin() then
    raise exception 'Only an Admin or a Sub-admin can open a project again.'
      using errcode = 'P0001';
  end if;

  update public.projects
     set is_active = true, closed_at = null
   where id = p_id and not is_active;

  if not found then
    raise exception 'That project is not there, or is already open.'
      using errcode = 'P0001';
  end if;
end
$fn$;

-- ------------------------------------------------------------ renaming
create or replace function public.rename_project(
  p_id         uuid,
  p_name       text,
  p_started_on date default null,
  p_note       text default null
)
returns public.projects
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_name text := btrim(coalesce(p_name, ''));
  v_row  public.projects;
begin
  if not public.is_admin() then
    raise exception 'Only an Admin or a Sub-admin can change a project.'
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

  if exists (
    select 1 from public.projects
     where lower(btrim(name)) = lower(v_name) and id <> p_id
  ) then
    raise exception 'There is already a project with that name.'
      using errcode = 'P0001';
  end if;

  if p_started_on is not null and p_started_on > current_date then
    raise exception 'A project cannot have started in the future.'
      using errcode = 'P0001';
  end if;

  update public.projects
     set name       = v_name,
         started_on = coalesce(p_started_on, started_on),
         note       = coalesce(nullif(btrim(coalesce(p_note, '')), ''), note)
   where id = p_id
  returning * into v_row;

  if not found then
    raise exception 'That project is not there.' using errcode = 'P0001';
  end if;

  return v_row;
end
$fn$;

-- ------------------------------------------------------------- removing
/**
 * Remove a project. Refused the moment anything has ever been put on it,
 * deleted entries included - a deleted entry can be restored, and it
 * would come back pointing at nothing.
 *
 * This is for the name typed by mistake, and for nothing else. A project
 * that has been spent on is renamed, never removed, because the money
 * went somewhere and the books have to keep saying where.
 */
create or replace function public.delete_project(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_count bigint;
begin
  if not public.is_admin() then
    raise exception 'Only an Admin or a Sub-admin can remove a project.'
      using errcode = 'P0001';
  end if;

  select count(*) into v_count from public.entries where project_id = p_id;

  if v_count > 0 then
    raise exception
      'This project has % % on it, so it cannot be removed. Rename it instead.',
      v_count, case when v_count = 1 then 'expense' else 'expenses' end
      using errcode = 'P0001';
  end if;

  delete from public.projects where id = p_id;

  if not found then
    raise exception 'That project is not there.' using errcode = 'P0001';
  end if;
end
$fn$;

revoke all on function public.close_project(uuid) from public, anon;
revoke all on function public.reopen_project(uuid) from public, anon;
revoke all on function public.rename_project(uuid, text, date, text) from public, anon;
revoke all on function public.delete_project(uuid) from public, anon;
grant execute on function public.close_project(uuid) to authenticated;
grant execute on function public.reopen_project(uuid) to authenticated;
grant execute on function public.rename_project(uuid, text, date, text) to authenticated;
grant execute on function public.delete_project(uuid) to authenticated;

-- ------------------------------------------------- the totals, with dates
-- The return type gains two columns, which "create or replace" cannot do,
-- so the old one goes first. Nothing else has this name.
drop function if exists public.project_totals(date, date);

create function public.project_totals(p_from date default null, p_to date default null)
returns table (
  project_id   uuid,
  name         text,
  is_active    boolean,
  started_on   date,
  closed_at    timestamptz,
  can_remove   boolean,
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
    pr.started_on,
    pr.closed_at,
    -- Nothing has ever been put on it, so removing it loses nothing.
    -- Counted over every entry, deleted ones included, because a deleted
    -- entry can be restored.
    not exists (select 1 from public.entries z where z.project_id = pr.id),
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
  where public.is_admin() or exists (
    select 1 from public.entries x
     where x.project_id = pr.id
       and x.type = 'expense'
       and not x.is_deleted and not x.is_cancelled
       and x.person_id in (select public.my_people())
  )
  group by pr.id, pr.name, pr.is_active, pr.started_on, pr.closed_at
  order by pr.is_active desc, coalesce(sum(e.amount), 0) desc, pr.name;
end
$fn$;

revoke all on function public.project_totals(date, date) from public, anon;
grant execute on function public.project_totals(date, date) to authenticated;
