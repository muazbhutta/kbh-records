-- A payment taken out still needs its name.
--
-- remove_from_payroll counted only the payments still standing. So a
-- man who was paid, had that payment taken out again, and was then
-- taken off the payroll looked to it like a man who had never been
-- paid at all - and it tried to delete his roster row out from under
-- the payment rows that still point at it. The database refused, as it
-- should, but the office saw a foreign key error on a perfectly
-- ordinary afternoon.
--
-- Three endings now, not two:
--   stopped  - he is still being paid, so the row is only switched off
--   cleared  - nothing stands, but something was once written down, so
--              his name stays for those records to point at
--   removed  - nothing was ever written down, so he goes completely

create or replace function public.remove_from_payroll(p_person_id uuid)
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_live bigint;
  v_any  bigint;
begin
  if not public.is_admin() then
    raise exception 'Only an Admin or a Sub-admin can take somebody off the payroll.'
      using errcode = 'P0001';
  end if;

  select count(*) filter (where not is_deleted), count(*)
    into v_live, v_any
    from public.salary_payments
   where person_id = p_person_id;

  if v_live > 0 then
    update public.payroll set is_active = false where person_id = p_person_id;
    return 'stopped';
  end if;

  delete from public.payroll where person_id = p_person_id;

  if v_any > 0 then
    return 'cleared';
  end if;

  delete from public.salary_people where id = p_person_id;
  return 'removed';
end
$fn$;
