-- Every entry, and every change to one, raises a ticket for the office.
--
-- The point of this is trust. A man on a site records what he spent; if
-- he got it wrong he can put it right himself, which is better than
-- ringing the office - but the office has to be told, every time, and
-- has to say it looked. Nothing here is advisory.
--
-- So the tickets are raised by the database, in a trigger, and not by
-- the app. An app can be wrong, can be an old version on somebody's
-- phone, can have a path somebody forgot. A notice that can be missed
-- out is worse than no notice, because it is believed.
--
-- A ticket is raised when:
--   an entry is recorded      -> kind 'new'
--   its money or its meaning changes -> kind 'edit', with the reason
--
-- and not when the housekeeping around it changes: which project it was
-- filed against, whether its bill has been read yet, whether it has been
-- hidden. Those have their own screens and their own history, and a list
-- that fills with them is a list nobody reads.

create table if not exists public.entry_tickets (
  id           bigint generated always as identity primary key,
  entry_id     uuid not null references public.entries (id) on delete cascade,
  kind         text not null check (kind in ('new', 'edit')),
  at           timestamptz not null default now(),
  actor_id     uuid references public.app_users (id) on delete set null,
  actor_name   text,
  /** Why it was changed. Always there on an edit: the function demands it. */
  reason       text,
  /** What changed, field by field. Null on a new entry. */
  changes      jsonb,
  seen_at      timestamptz,
  seen_by      uuid references public.app_users (id) on delete set null,
  seen_by_name text
);

comment on table public.entry_tickets is
  'One per entry recorded and per entry changed. Cleared by an Admin saying it looks right.';

create index if not exists entry_tickets_open_idx
  on public.entry_tickets (at desc) where seen_at is null;
create index if not exists entry_tickets_entry_idx
  on public.entry_tickets (entry_id);

-- ------------------------------------------------------------- raising
/**
 * The fields that are the entry itself: what it cost, when, whose, what
 * for. A change to any of these is a change to the books and the office
 * is told. Everything else on the row is housekeeping.
 */
create or replace function public.entries_raise_ticket()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_changes jsonb := '{}'::jsonb;
  v_reason  text;
  v_actor   uuid := auth.uid();
  v_name    text;
begin
  if TG_OP = 'INSERT' then
    select full_name into v_name from public.app_users where id = coalesce(new.entered_by, v_actor);
    insert into public.entry_tickets (entry_id, kind, actor_id, actor_name)
    values (new.id, 'new', coalesce(new.entered_by, v_actor), v_name);
    return null;
  end if;

  -- An entry put back after being hidden, or hidden, is not an edit of
  -- what it says; the Deleted Entries screen carries those.
  if new.is_deleted is distinct from old.is_deleted then return null; end if;

  if new.amount is distinct from old.amount then
    v_changes := v_changes || jsonb_build_object('Amount',
      jsonb_build_object('from', old.amount::text, 'to', new.amount::text));
  end if;
  if new.bill_date is distinct from old.bill_date then
    v_changes := v_changes || jsonb_build_object('Bill date',
      jsonb_build_object('from', old.bill_date::text, 'to', new.bill_date::text));
  end if;
  if new.person_id is distinct from old.person_id then
    v_changes := v_changes || jsonb_build_object('Whose khata',
      jsonb_build_object(
        'from', (select full_name from public.app_users where id = old.person_id),
        'to',   (select full_name from public.app_users where id = new.person_id)));
  end if;
  if new.counterparty_id is distinct from old.counterparty_id then
    v_changes := v_changes || jsonb_build_object('Received by',
      jsonb_build_object(
        'from', (select full_name from public.app_users where id = old.counterparty_id),
        'to',   (select full_name from public.app_users where id = new.counterparty_id)));
  end if;
  if new.category_id is distinct from old.category_id then
    v_changes := v_changes || jsonb_build_object('What for',
      jsonb_build_object(
        'from', (select name from public.expense_categories where id = old.category_id),
        'to',   (select name from public.expense_categories where id = new.category_id)));
  end if;
  if new.note is distinct from old.note then
    v_changes := v_changes || jsonb_build_object('Note',
      jsonb_build_object('from', old.note, 'to', new.note));
  end if;
  if new.expense_type is distinct from old.expense_type then
    v_changes := v_changes || jsonb_build_object('Bill type',
      jsonb_build_object('from', old.expense_type::text, 'to', new.expense_type::text));
  end if;

  if v_changes = '{}'::jsonb then
    return null;
  end if;

  -- update_entry leaves the reason here for the length of the
  -- transaction. Anything that edits an entry without one is a path
  -- that has not been taught the rule, and the ticket says so rather
  -- than hiding it.
  v_reason := nullif(btrim(coalesce(current_setting('kbh.edit_reason', true), '')), '');

  select full_name into v_name from public.app_users where id = v_actor;
  insert into public.entry_tickets (entry_id, kind, actor_id, actor_name, reason, changes)
  values (new.id, 'edit', v_actor, v_name, v_reason, v_changes);

  return null;
end
$fn$;

drop trigger if exists entries_ticket_trg on public.entries;
create trigger entries_ticket_trg
  after insert or update on public.entries
  for each row execute function public.entries_raise_ticket();

-- ----------------------------------------------------------------- RLS
alter table public.entry_tickets enable row level security;

drop policy if exists entry_tickets_select on public.entry_tickets;
create policy entry_tickets_select on public.entry_tickets
  for select to authenticated
  using (public.is_admin() or actor_id = auth.uid());

comment on policy entry_tickets_select on public.entry_tickets is
  'The office sees every ticket. Everyone else sees only the ones they raised.';

-- Nothing writes here by hand. The trigger raises them and the function
-- below clears them, both of which run as the owner.
grant select on public.entry_tickets to authenticated;

-- ------------------------------------------------------------ clearing
/** "Looks right." The ticket stops asking, and says who said so. */
create or replace function public.mark_ticket_seen(p_id bigint)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_name text;
begin
  if not public.is_admin() then
    raise exception 'Only an Admin or a Sub-admin can clear a ticket.'
      using errcode = 'P0001';
  end if;

  select full_name into v_name from public.app_users where id = auth.uid();

  update public.entry_tickets
     set seen_at = now(), seen_by = auth.uid(), seen_by_name = v_name
   where id = p_id and seen_at is null;

  if not found then
    raise exception 'That ticket is not there, or has already been cleared.'
      using errcode = 'P0001';
  end if;
end
$fn$;

/** Every ticket still asking, newest first, with the entry behind it. */
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
  photo_count  bigint
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
    (select count(*) from public.entry_photos p where p.entry_id = e.id)
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

/** How many are still asking, for the number on the home screen. */
create or replace function public.open_ticket_count()
returns bigint
language sql
stable
security definer
set search_path = public, pg_temp
as $fn$
  select case when public.is_admin() then (
    select count(*) from public.entry_tickets t
    join public.entries e on e.id = t.entry_id
    where t.seen_at is null and not e.is_deleted
  ) else 0 end;
$fn$;

revoke all on function public.mark_ticket_seen(bigint) from public, anon;
revoke all on function public.open_tickets(integer) from public, anon;
revoke all on function public.open_ticket_count() from public, anon;
grant execute on function public.mark_ticket_seen(bigint) to authenticated;
grant execute on function public.open_tickets(integer) to authenticated;
grant execute on function public.open_ticket_count() to authenticated;
