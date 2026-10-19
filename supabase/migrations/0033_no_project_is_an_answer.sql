-- "No project" is a real answer, not a missing one: office tea and
-- petrol belong to nobody's site, and an expense can be unfiled again
-- after being filed by mistake. So the project argument takes null, and
-- takes it by leaving the argument out.
--
-- A default is not part of a function's signature, so replacing these
-- does not leave a second shape behind.

create or replace function public.project_by_person(
  p_project_id uuid default null,
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

alter function public.set_entry_project(uuid, uuid)
  rename to set_entry_project_old;

create or replace function public.set_entry_project(
  p_entry_id   uuid,
  p_project_id uuid default null
)
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

drop function public.set_entry_project_old(uuid, uuid);

revoke all on function public.set_entry_project(uuid, uuid) from public, anon;
grant execute on function public.set_entry_project(uuid, uuid) to authenticated;
revoke all on function public.project_by_person(uuid, date, date) from public, anon;
grant execute on function public.project_by_person(uuid, date, date) to authenticated;
