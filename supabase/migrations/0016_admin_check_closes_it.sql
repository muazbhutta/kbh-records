-- =====================================================================
--  Migration 0016 - When an Admin looks at a bill, that IS the check
-- ---------------------------------------------------------------------
--  "Check bill type" lists an expense while its flags are up OR while the
--  bill is still waiting to be read. Pressing "Looks right" only took the
--  flags down, so the expense stayed on the list for ever and the app
--  went on saying "not checked" about a bill a person had just checked.
--
--  A pair of human eyes is a better reader than the machine, so both
--  "Looks right" and setting the type by hand now close the reading off.
-- =====================================================================

/** An Admin says "nothing to see here" without changing the type. */
create or replace function public.clear_type_flags(p_id uuid)
returns uuid
language plpgsql
security invoker
set search_path = public, pg_temp
as $fn$
begin
  if not public.is_admin() then
    raise exception 'Only an Admin can do this.' using errcode = 'P0001';
  end if;

  update public.entries
     set type_flags = array(select f from unnest(type_flags) f
                             where f not in ('type_check', 'old_entry_check', 'amount_differs')),
         -- A person has now read the bill, so nothing is waiting any more.
         bill_scan_state = case
           when bill_scan_state in ('pending', 'failed') then 'done'::public.bill_scan_state
           else bill_scan_state
         end
   where id = p_id and type = 'expense';

  if not found then
    raise exception 'That expense was not found.' using errcode = 'P0001';
  end if;
  return p_id;
end
$fn$;

grant execute on function public.clear_type_flags(uuid) to authenticated;

create or replace function public.set_expense_type(
  p_id     uuid,
  p_type   public.expense_kind,
  p_reason text default null
)
returns uuid
language plpgsql
security invoker
set search_path = public, pg_temp
as $fn$
begin
  if not public.is_admin() then
    raise exception 'Only an Admin can change the type.' using errcode = 'P0001';
  end if;

  update public.entries
     set expense_type = p_type,
         type_source  = 'changed_by_admin',
         note         = note,
         type_flags   = array(
           select distinct unnest(
             -- the question has been answered, so the "look at this" flags go
             array(select f from unnest(type_flags) f
                    where f not in ('type_check', 'old_entry_check'))
             || array['type_changed']
           )
         ),
         bill_scan_state = case
           when bill_scan_state in ('pending', 'failed') then 'done'::public.bill_scan_state
           else bill_scan_state
         end,
         cancel_reason = cancel_reason
   where id = p_id and type = 'expense';

  if not found then
    raise exception 'That expense was not found.' using errcode = 'P0001';
  end if;
  return p_id;
end
$fn$;

grant execute on function public.set_expense_type(uuid, public.expense_kind, text) to authenticated;
