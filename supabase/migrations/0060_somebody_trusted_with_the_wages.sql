-- Somebody trusted with the wages.
--
-- A teacher hands the register to one of the class. The office wants
-- the same: name one man - an employee, a head, anybody - and from then
-- on he sees the Salaries section and works it. Marking who turned up,
-- setting a wage, handing over a salary, paying an advance.
--
-- It is a right of its own, not a promotion. He does not become an
-- Admin: the khatas, the reports, the people, the projects are all
-- still shut to him. Only the wages open.
--
-- Giving it and taking it back is the Admin's alone. A man cannot hand
-- the register to himself, or to his friend.

alter table public.app_users
  add column if not exists can_payroll boolean not null default false;

comment on column public.app_users.can_payroll is
  'Trusted with the wages: salaries and attendance, and nothing else.';

/** An Admin, a Sub-admin, or whoever has been handed the wages. */
create or replace function public.can_payroll()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $fn$
  select public.is_admin() or coalesce(
    (select u.can_payroll and u.is_active from public.app_users u where u.id = auth.uid()),
    false);
$fn$;

revoke all on function public.can_payroll() from public, anon;
grant execute on function public.can_payroll() to authenticated;

/**
 * Hand the wages to somebody, or take them back.
 *
 * Only an Admin may, and never to themselves - an Admin already has
 * it, and a Sub-admin granting it to himself is the one move this is
 * meant to stop.
 */
create or replace function public.set_payroll_right(p_user_id uuid, p_can boolean)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
begin
  if not public.is_admin() then
    raise exception 'Only an Admin or a Sub-admin can hand over the wages.'
      using errcode = 'P0001';
  end if;
  if p_user_id = auth.uid() then
    raise exception 'You cannot hand the wages to yourself.' using errcode = 'P0001';
  end if;
  if not exists (select 1 from public.app_users where id = p_user_id and is_active) then
    raise exception 'That person is not on the books.' using errcode = 'P0001';
  end if;

  update public.app_users set can_payroll = coalesce(p_can, false), updated_at = now()
   where id = p_user_id;
end
$fn$;

revoke all on function public.set_payroll_right(uuid, boolean) from public, anon;
grant execute on function public.set_payroll_right(uuid, boolean) to authenticated;

-- ------------------------------------------------- the gate on each one
-- Every function behind the Salaries section asks the same question
-- the same way, on its first line: "if not public.is_admin()". They are
-- rewritten here from their own definitions rather than restated by
-- hand - fourteen bodies copied out is fourteen chances to mistype one
-- and change what it does. The list is named in full below, nothing
-- outside it is touched, and the count is checked afterwards.
do $$
declare
  r record;
  v_src text;
  v_done int := 0;
begin
  for r in
    select p.oid
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.prokind = 'f'
      and p.proname in (
        'salary_month', 'salary_month_payments', 'salary_month_total', 'salary_months',
        'salary_candidates', 'add_salary_person', 'set_payroll', 'remove_from_payroll',
        'record_salary_payment', 'remove_salary_payment',
        'mark_attendance', 'clear_attendance', 'attendance_day', 'attendance_day_total'
      )
  loop
    v_src := pg_get_functiondef(r.oid);
    if position('public.is_admin()' in v_src) > 0 then
      execute replace(v_src, 'public.is_admin()', 'public.can_payroll()');
      v_done := v_done + 1;
    end if;
  end loop;

  if v_done <> 14 then
    raise exception 'Expected to re-gate 14 wage functions, did %', v_done;
  end if;
end $$;

-- And the tables they read, so a trusted man can see the rows at all.
drop policy if exists salary_people_office on public.salary_people;
create policy salary_people_office on public.salary_people
  for select to authenticated using (public.can_payroll());

drop policy if exists payroll_office on public.payroll;
create policy payroll_office on public.payroll
  for select to authenticated using (public.can_payroll());

drop policy if exists salary_payments_office on public.salary_payments;
create policy salary_payments_office on public.salary_payments
  for select to authenticated using (public.can_payroll());

drop policy if exists attendance_office on public.attendance;
create policy attendance_office on public.attendance
  for select to authenticated using (public.can_payroll());

comment on policy payroll_office on public.payroll is
  'The office, and whoever the office has trusted with the wages.';
