-- Either id will do, and neither is compulsory.
--
-- set_payroll takes a roster id or an app user's id, whichever the
-- screen has. But p_person_id was declared without a default, so
-- PostgREST treated it as required and would not find the function at
-- all when only p_user_id was sent - which is exactly the case of
-- putting one of the app's own people on salary for the first time.
--
-- The body already handles a null person_id. Only the declaration was
-- lying about it.

create or replace function public.set_payroll(
  p_person_id uuid default null,
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

revoke all on function public.set_payroll(uuid, uuid, numeric, date, text) from public, anon;
grant execute on function public.set_payroll(uuid, uuid, numeric, date, text) to authenticated;
