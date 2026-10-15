-- =====================================================================
--  Migration 0009 - Let an old expense receive its System ID
-- ---------------------------------------------------------------------
--  0007 froze system_id on every update, which is right for an ID that
--  has already been handed out. But it also blocked the backfill from
--  filling in the old expenses, which had none.
--
--  An ID is now frozen only once it exists. A row that has none can
--  still be given one, exactly once, and never again.
-- =====================================================================

create or replace function public.entries_expense_stamp()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_year integer := extract(year from (now() at time zone 'Asia/Riyadh'))::integer;
begin
  if tg_op = 'INSERT' then
    if new.type = 'expense' then
      if new.system_id is null then
        new.system_id := public.next_expense_id(v_year);
      end if;
      if new.expense_type is null then
        new.expense_type := 'petty';
        new.type_source := coalesce(new.type_source, 'auto_none');
      end if;
    else
      new.system_id := null;
      new.expense_type := null;
      new.type_source := null;
      new.bill_scan_state := 'not_needed';
    end if;
    return new;
  end if;

  -- Once an expense has an ID it keeps it, for good. An expense that
  -- never got one (recorded before this feature existed) may still be
  -- given one.
  if old.system_id is not null then
    new.system_id := old.system_id;
  elsif new.type = 'expense' and new.system_id is null then
    new.system_id := public.next_expense_id(v_year);
  end if;

  if new.is_cancelled and not old.is_cancelled then
    new.cancelled_at := now();
    new.cancelled_by := coalesce(auth.uid(), new.cancelled_by);
  elsif not new.is_cancelled and old.is_cancelled then
    new.cancelled_at := null;
    new.cancelled_by := null;
    new.cancel_reason := null;
  end if;

  return new;
end
$fn$;

/**
 * Now the old expenses can actually be stamped. The year comes from when
 * the expense was entered, not today, so an expense from 2026 reads
 * EXP-2026-... whenever this is run.
 */
create or replace function public.backfill_expense_ids()
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_row   record;
  v_count integer := 0;
begin
  for v_row in
    select e.id,
           extract(year from (e.entered_at at time zone 'Asia/Riyadh'))::integer as yr
    from public.entries e
    where e.type = 'expense' and e.system_id is null
    order by e.entered_at, e.id
  loop
    update public.entries
       set system_id = public.next_expense_id(v_row.yr),
           expense_type = coalesce(expense_type, 'petty'),
           type_source  = coalesce(type_source, 'auto_none'),
           bill_scan_state = case
             when bill_scan_state in ('done', 'failed') then bill_scan_state
             when exists (select 1 from public.entry_photos p where p.entry_id = v_row.id)
               then 'pending'::public.bill_scan_state
             else 'failed'::public.bill_scan_state
           end,
           type_flags = (
             select array(select distinct unnest(type_flags || array['old_entry_check']))
           )
     where id = v_row.id;

    v_count := v_count + 1;
  end loop;

  return v_count;
end
$fn$;

revoke all on function public.backfill_expense_ids() from public, anon, authenticated;
grant execute on function public.backfill_expense_ids() to service_role;

select public.backfill_expense_ids();
