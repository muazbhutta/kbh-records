-- One look at a bill should settle both questions asked about it.
--
-- The office was looking at the same bill twice: once on the home
-- screen, to say the entry looks right, and again on Check type, to say
-- whether the paper is a petty slip or a tax invoice. Two separate
-- questions, fairly enough - but asked in two places, about one
-- photograph, days apart.
--
-- They are not the same question and must not be merged: saying an
-- entry looks right says nothing about what the paper is, and letting
-- it clear the type as well would quietly stamp "Petty" on bills that
-- are real invoices. So the question moves instead of disappearing.
-- The ticket now carries what it needs to ask it: whether the type is
-- still open, what it currently says, and the bill itself.

-- Adding columns changes the row this returns, and Postgres will not
-- replace a function's shape in place. The signature is unchanged, so
-- nothing is left behind for PostgREST to choose between.
drop function if exists public.open_tickets(integer);

create or replace function public.open_tickets(p_limit integer default 50)
returns table (
  id           bigint,
  entry_id     uuid,
  kind         text,
  at           timestamptz,
  actor_name   text,
  reason       text,
  changes      jsonb,
  amount       numeric,
  entry_type   text,
  bill_date    date,
  person_id    uuid,
  person_name  text,
  category_name text,
  system_id    text,
  note         text,
  photo_count  bigint,
  /** True while the office has not said what the paper is. */
  needs_type   boolean,
  expense_type text,
  /** The bill, so the question can be answered without leaving the list. */
  thumb_path   text,
  storage_path text
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $fn$
begin
  if not public.is_admin() then
    raise exception 'Only an Admin or a Sub-admin can see the tickets.'
      using errcode = 'P0001';
  end if;

  return query
  select
    t.id, t.entry_id, t.kind, t.at, t.actor_name, t.reason, t.changes,
    e.amount, e.type::text, e.bill_date, e.person_id,
    u.full_name, c.name, e.system_id, e.note,
    (select count(*) from public.entry_photos p where p.entry_id = e.id),
    exists (select 1 from public.expenses_to_check x where x.id = e.id),
    e.expense_type::text,
    (select p.thumb_path from public.entry_photos p
      where p.entry_id = e.id order by p.position limit 1),
    (select p.storage_path from public.entry_photos p
      where p.entry_id = e.id order by p.position limit 1)
  from public.entry_tickets t
  join public.entries e on e.id = t.entry_id
  left join public.app_users u on u.id = e.person_id
  left join public.expense_categories c on c.id = e.category_id
  where t.seen_at is null
    and not e.is_deleted
  order by t.at desc
  limit greatest(p_limit, 1);
end
$fn$;

/**
 * Say what the paper is and that the entry looks right, in one go.
 *
 * Pressing "Invoice" on a ticket is both answers at once and means
 * both: the office has looked at this bill, and this is what it is.
 * Doing it in two calls from the screen would leave the books in a
 * state nobody intended if the second one failed.
 */
create or replace function public.settle_ticket(p_id bigint, p_type public.expense_kind default null)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_entry uuid;
begin
  if not public.is_admin() then
    raise exception 'Only an Admin or a Sub-admin can settle a ticket.'
      using errcode = 'P0001';
  end if;

  select t.entry_id into v_entry
    from public.entry_tickets t where t.id = p_id and t.seen_at is null;
  if v_entry is null then
    raise exception 'That ticket is not there, or somebody has already seen it.'
      using errcode = 'P0001';
  end if;

  if p_type is not null then
    perform public.set_expense_type(v_entry, p_type);
  end if;

  perform public.mark_ticket_seen(p_id);
end
$fn$;

revoke all on function public.settle_ticket(bigint, public.expense_kind) from public, anon;
grant execute on function public.settle_ticket(bigint, public.expense_kind) to authenticated;

revoke all on function public.open_tickets(integer) from public, anon;
grant execute on function public.open_tickets(integer) to authenticated;
