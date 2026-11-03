-- The men on salary are their own list.
--
-- Putting a mazdoor on the payroll was making him a user of the app: a
-- mobile number, a PIN, a login he will never use, and a name in every
-- picker on every screen. That is wrong twice over. He does not use the
-- app, and the men who do should not have to scroll past him to find
-- each other.
--
-- So salary keeps its own roster. A name and a trade is all it needs.
-- Where the man does use the app - a head who also draws a salary - the
-- roster row points at his account and takes his name from it, so a
-- rename in Settings is not a rename to do twice.

create table if not exists public.salary_people (
  id        uuid primary key default gen_random_uuid(),
  /** Used when this man has no account. Otherwise his account's name wins. */
  full_name text not null check (length(btrim(full_name)) between 2 and 80),
  job_title text check (job_title is null or length(job_title) <= 60),
  /** His account, when he has one. Null for a man who only draws a salary. */
  user_id   uuid unique references public.app_users (id) on delete cascade,
  is_active boolean not null default true,
  added_by  uuid references public.app_users (id) on delete set null,
  added_at  timestamptz not null default now()
);

comment on table public.salary_people is
  'Who the payroll is about. Not users of the app unless user_id says so.';

-- Anybody already on the payroll or ever paid becomes a roster row
-- pointing at their account, so no figure changes hands in this move.
insert into public.salary_people (full_name, job_title, user_id)
select u.full_name, u.job_title, u.id
from public.app_users u
where u.id in (select person_id from public.payroll
               union
               select person_id from public.salary_payments)
on conflict (user_id) do nothing;

alter table public.payroll          drop constraint if exists payroll_person_id_fkey;
alter table public.salary_payments  drop constraint if exists salary_payments_person_id_fkey;

update public.payroll p
   set person_id = sp.id
  from public.salary_people sp
 where sp.user_id = p.person_id;

update public.salary_payments s
   set person_id = sp.id
  from public.salary_people sp
 where sp.user_id = s.person_id;

alter table public.payroll
  add constraint payroll_person_id_fkey
  foreign key (person_id) references public.salary_people (id) on delete cascade;

alter table public.salary_payments
  add constraint salary_payments_person_id_fkey
  foreign key (person_id) references public.salary_people (id) on delete restrict;

-- ----------------------------------------------------------------- RLS
alter table public.salary_people enable row level security;

drop policy if exists salary_people_office on public.salary_people;
create policy salary_people_office on public.salary_people
  for select to authenticated using (public.is_admin());

comment on policy salary_people_office on public.salary_people is
  'What a man earns is not his workmates'' business, nor is who draws one.';

grant select on public.salary_people to authenticated;

-- ------------------------------------------------------------ the roster
/**
 * Write down a man who only draws a salary.
 *
 * No mobile, no PIN, no account. He is a name and a trade on the
 * payroll and nothing else, and he appears nowhere outside it.
 */
create or replace function public.add_salary_person(p_name text, p_job text default null)
returns table (id uuid, full_name text, job_title text)
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_name text := btrim(coalesce(p_name, ''));
  v_job  text := nullif(btrim(coalesce(p_job, '')), '');
  v_id   uuid;
begin
  if not public.is_admin() then
    raise exception 'Only an Admin or a Sub-admin can add somebody to the payroll.'
      using errcode = 'P0001';
  end if;
  if length(v_name) < 2 then
    raise exception 'Enter his name.' using errcode = 'P0001';
  end if;

  insert into public.salary_people (full_name, job_title, added_by)
  values (v_name, left(v_job, 60), auth.uid())
  returning salary_people.id into v_id;

  return query
  select sp.id, sp.full_name, sp.job_title
  from public.salary_people sp where sp.id = v_id;
end
$fn$;

/**
 * Everybody who could be put on salary: the roster, plus the app's own
 * people who are not on it yet. The two are told apart by which id the
 * caller hands back when they choose.
 */
create or replace function public.salary_candidates()
returns table (
  id         uuid,
  full_name  text,
  job_title  text,
  kind       text,
  on_payroll boolean
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $fn$
begin
  if not public.is_admin() then
    raise exception 'Only an Admin or a Sub-admin can see the payroll.'
      using errcode = 'P0001';
  end if;

  return query
  select sp.id,
         coalesce(u.full_name, sp.full_name),
         coalesce(u.job_title, sp.job_title),
         'roster'::text,
         (pr.person_id is not null and pr.is_active)
  from public.salary_people sp
  left join public.app_users u on u.id = sp.user_id
  left join public.payroll pr  on pr.person_id = sp.id
  where sp.is_active and (sp.user_id is null or u.is_active)

  union all

  select u.id, u.full_name, u.job_title, 'user'::text, false
  from public.app_users u
  where u.is_active
    and not exists (select 1 from public.salary_people sp where sp.user_id = u.id)

  order by 2;
end
$fn$;

revoke all on function public.add_salary_person(text, text) from public, anon;
revoke all on function public.salary_candidates() from public, anon;
grant execute on function public.add_salary_person(text, text) to authenticated;
grant execute on function public.salary_candidates() to authenticated;
