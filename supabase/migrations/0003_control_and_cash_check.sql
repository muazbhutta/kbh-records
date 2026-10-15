-- =====================================================================
--  KBH Contracting Record Management System
--  Migration 0003 - Admin control, audit log, duplicate bills, Cash Check
--  Run this AFTER 0002.
-- =====================================================================
--  What this adds
--  * Admin and Sub-admin can edit and delete entries. A delete is a soft
--    delete: the row leaves the balances and the lists, but is kept.
--  * Every create, edit and delete is written to public.audit_log by a
--    Postgres trigger, with who, when, and old value -> new value.
--  * The same bill photo used twice is flagged for admins.
--  * Cash Check: an admin counts the real cash and the app records
--    expected / counted / difference. It never changes a balance.
-- =====================================================================

-- ======================================================== audit log
create table if not exists public.audit_log (
  id          bigint generated always as identity primary key,
  table_name  text        not null,
  row_id      uuid        not null,
  action      text        not null check (action in ('insert', 'update', 'delete', 'restore')),
  at          timestamptz not null default now(),
  actor_id    uuid references public.app_users (id) on delete set null,
  actor_name  text,
  person_id   uuid references public.app_users (id) on delete set null,
  summary     text,
  changes     jsonb,
  old_row     jsonb,
  new_row     jsonb
);

comment on table public.audit_log is
  'Append only. Written by triggers, never by the app.';
comment on column public.audit_log.actor_name is
  'The name at the time, so old history still reads correctly after a rename.';

create index if not exists audit_log_at_idx        on public.audit_log (at desc);
create index if not exists audit_log_row_idx       on public.audit_log (table_name, row_id, at desc);
create index if not exists audit_log_person_idx    on public.audit_log (person_id, at desc);
create index if not exists audit_log_actor_idx     on public.audit_log (actor_id, at desc);

-- Fields that change by themselves and would only add noise.
create or replace function public.audit_noise_keys()
returns text[] language sql immutable as $fn$
  select array['updated_at', 'deleted_at', 'deleted_by', 'duplicate_photo']
$fn$;

create or replace function public.audit_row()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_old     jsonb := case when tg_op = 'INSERT' then null else to_jsonb(old) end;
  v_new     jsonb := case when tg_op = 'DELETE' then null else to_jsonb(new) end;
  v_body    jsonb := coalesce(v_new, v_old);
  v_changes jsonb := '{}'::jsonb;
  v_key     text;
  v_action  text;
  v_actor   uuid := auth.uid();
  v_name    text;
  v_person  uuid;
  v_summary text;
begin
  if tg_op = 'UPDATE' then
    for v_key in select jsonb_object_keys(v_new) loop
      if v_key = any (public.audit_noise_keys()) then
        continue;
      end if;
      if v_new -> v_key is distinct from v_old -> v_key then
        v_changes := v_changes || jsonb_build_object(
          v_key, jsonb_build_object('old', v_old -> v_key, 'new', v_new -> v_key));
      end if;
    end loop;

    -- Nothing a person would care about actually moved.
    if v_changes = '{}'::jsonb then
      return null;
    end if;
  end if;

  if tg_op = 'INSERT' then
    v_action := 'insert';
  elsif tg_op = 'DELETE' then
    v_action := 'delete';
  elsif (v_old ->> 'is_deleted')::boolean is distinct from (v_new ->> 'is_deleted')::boolean then
    v_action := case when (v_new ->> 'is_deleted')::boolean then 'delete' else 'restore' end;
  else
    v_action := 'update';
  end if;

  select u.full_name into v_name from public.app_users u where u.id = v_actor;

  -- Which person's khata this belongs to, for the "filter by person" view.
  if tg_argv[0] is not null and v_body ? tg_argv[0] then
    v_person := (v_body ->> tg_argv[0])::uuid;
  end if;

  if tg_table_name = 'entries' then
    v_summary := initcap(replace(v_body ->> 'type', '_', ' '))
                 || ' SAR ' || to_char((v_body ->> 'amount')::numeric, 'FM999,999,990.00');
  elsif tg_table_name = 'cash_checks' then
    v_summary := 'Cash Check, counted SAR '
                 || to_char((v_body ->> 'counted')::numeric, 'FM999,999,990.00');
  elsif tg_table_name = 'app_users' then
    v_summary := coalesce(v_body ->> 'full_name', 'Person');
  elsif tg_table_name = 'expense_categories' then
    v_summary := 'Category ' || coalesce(v_body ->> 'name', '');
  end if;

  insert into public.audit_log
    (table_name, row_id, action, actor_id, actor_name, person_id, summary,
     changes, old_row, new_row)
  values
    (tg_table_name, (v_body ->> 'id')::uuid, v_action, v_actor,
     coalesce(v_name, 'System'), v_person, v_summary,
     case when v_changes = '{}'::jsonb then null else v_changes end,
     v_old, v_new);

  return null;
end
$fn$;

drop trigger if exists audit_entries_trg on public.entries;
create trigger audit_entries_trg
  after insert or update or delete on public.entries
  for each row execute function public.audit_row('person_id');

drop trigger if exists audit_app_users_trg on public.app_users;
create trigger audit_app_users_trg
  after insert or update on public.app_users
  for each row execute function public.audit_row('id');

drop trigger if exists audit_categories_trg on public.expense_categories;
create trigger audit_categories_trg
  after insert or update or delete on public.expense_categories
  for each row execute function public.audit_row();

-- The log can never be edited or thrown away.
create or replace function public.audit_log_is_append_only()
returns trigger language plpgsql as $fn$
begin
  raise exception 'The change history cannot be edited.' using errcode = 'P0001';
end
$fn$;

drop trigger if exists audit_log_append_only_trg on public.audit_log;
create trigger audit_log_append_only_trg
  before update or delete on public.audit_log
  for each row execute function public.audit_log_is_append_only();

alter table public.audit_log enable row level security;
revoke all on table public.audit_log from anon, authenticated;
grant select on table public.audit_log to authenticated;
grant all on table public.audit_log to service_role;

drop policy if exists audit_log_select_admin on public.audit_log;
create policy audit_log_select_admin on public.audit_log
  for select to authenticated
  using (public.is_admin());

-- ================================================== duplicate bills
alter table public.entries
  add column if not exists duplicate_photo boolean not null default false,
  add column if not exists delete_reason text;

comment on column public.entries.duplicate_photo is
  'Set by a trigger when one of this entry''s bill photos is already on another entry.';

create index if not exists entries_duplicate_idx
  on public.entries (duplicate_photo) where duplicate_photo and not is_deleted;

-- Replaces the photo check from 0002: it now also raises the duplicate
-- flag. Runs at COMMIT, so the entry and its photos are both in place.
create or replace function public.entry_commit_check()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_duplicate boolean;
begin
  if new.is_deleted then
    return null;
  end if;

  if new.type = 'expense'
     and not exists (select 1 from public.entry_photos p where p.entry_id = new.id) then
    raise exception 'An expense needs at least one bill photo.' using errcode = 'P0001';
  end if;

  select exists (
    select 1
    from public.entry_photos mine
    join public.entry_photos other
      on other.sha256 = mine.sha256 and other.entry_id <> mine.entry_id
    join public.entries oe on oe.id = other.entry_id and not oe.is_deleted
    where mine.entry_id = new.id
  ) into v_duplicate;

  -- The recursive write settles on the second pass, because by then the
  -- flag already matches and nothing is written.
  if v_duplicate is distinct from new.duplicate_photo then
    update public.entries set duplicate_photo = v_duplicate where id = new.id;
  end if;

  return null;
end
$fn$;

drop trigger if exists expense_needs_photo_trg on public.entries;
drop trigger if exists entry_commit_check_trg on public.entries;
create constraint trigger entry_commit_check_trg
  after insert or update on public.entries
  deferrable initially deferred
  for each row execute function public.entry_commit_check();

/**
 * Before saving, the app asks whether this bill has been seen before.
 * Security definer on purpose: an employee cannot read other people's
 * entries, but must still be told "this bill was already used on 14 Oct
 * by Rana for SAR 120". Only those three facts come back.
 */
create or replace function public.check_duplicates(
  p_hashes    text[] default '{}',
  p_person_id uuid default null,
  p_amount    numeric default null,
  p_bill_date date default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_photo jsonb;
  v_same  jsonb;
begin
  if coalesce(array_length(p_hashes, 1), 0) > 0 then
    select jsonb_build_object(
             'entry_id',    e.id,
             'bill_date',   e.bill_date,
             'amount',      e.amount,
             'person_name', u.full_name)
      into v_photo
      from public.entry_photos p
      join public.entries e on e.id = p.entry_id and not e.is_deleted
      join public.app_users u on u.id = e.person_id
     where p.sha256 = any (p_hashes)
     order by e.entered_at desc
     limit 1;
  end if;

  if p_person_id is not null and p_amount is not null and p_bill_date is not null then
    select jsonb_build_object(
             'entry_id',      e.id,
             'bill_date',     e.bill_date,
             'amount',        e.amount,
             'category_name', c.name)
      into v_same
      from public.entries e
      left join public.expense_categories c on c.id = e.category_id
     where not e.is_deleted
       and e.type = 'expense'
       and e.person_id = p_person_id
       and e.amount = p_amount
       and e.bill_date = p_bill_date
     order by e.entered_at desc
     limit 1;
  end if;

  return jsonb_build_object('same_photo', v_photo, 'same_amount', v_same);
end
$fn$;

grant execute on function public.check_duplicates(text[], uuid, numeric, date) to authenticated;

-- ============================================== editing and deleting
/**
 * An Admin changes a saved entry. Who entered it and when stay frozen by
 * the entries_guard trigger, and the audit trigger records the before
 * and after of everything that moved.
 */
create or replace function public.update_entry(
  p_id              uuid,
  p_amount          numeric default null,
  p_bill_date       date default null,
  p_person_id       uuid default null,
  p_counterparty_id uuid default null,
  p_category_id     uuid default null,
  p_note            text default null,
  p_clear_note      boolean default false
)
returns uuid
language plpgsql
security invoker
set search_path = public, pg_temp
as $fn$
declare
  v_row public.entries;
begin
  select * into v_row from public.entries where id = p_id;
  if not found then
    raise exception 'That entry was not found.' using errcode = 'P0001';
  end if;

  if p_amount is not null then
    if p_amount <= 0 then
      raise exception 'Enter an amount bigger than zero.' using errcode = 'P0001';
    end if;
    if round(p_amount, 2) <> p_amount then
      raise exception 'An amount can have at most 2 decimals.' using errcode = 'P0001';
    end if;
  end if;

  update public.entries
     set amount          = coalesce(p_amount, amount),
         bill_date       = coalesce(p_bill_date, bill_date),
         person_id       = coalesce(p_person_id, person_id),
         counterparty_id = case when v_row.type = 'transfer'
                                then coalesce(p_counterparty_id, counterparty_id)
                                else counterparty_id end,
         category_id     = case when v_row.type = 'expense'
                                then coalesce(p_category_id, category_id)
                                else category_id end,
         note            = case when p_clear_note then null
                                else coalesce(nullif(btrim(coalesce(p_note, '')), ''), note) end
   where id = p_id;

  return p_id;
end
$fn$;

grant execute on function public.update_entry(uuid, numeric, date, uuid, uuid, uuid, text, boolean)
  to authenticated;

/** A delete only hides the entry. Nothing is ever really removed. */
create or replace function public.delete_entry(p_id uuid, p_reason text default null)
returns uuid
language plpgsql
security invoker
set search_path = public, pg_temp
as $fn$
begin
  update public.entries
     set is_deleted    = true,
         delete_reason = nullif(btrim(coalesce(p_reason, '')), '')
   where id = p_id and not is_deleted;

  if not found then
    raise exception 'That entry was not found, or is already deleted.' using errcode = 'P0001';
  end if;
  return p_id;
end
$fn$;

grant execute on function public.delete_entry(uuid, text) to authenticated;

create or replace function public.restore_entry(p_id uuid)
returns uuid
language plpgsql
security invoker
set search_path = public, pg_temp
as $fn$
begin
  update public.entries
     set is_deleted = false, delete_reason = null
   where id = p_id and is_deleted;

  if not found then
    raise exception 'That entry was not found, or is not deleted.' using errcode = 'P0001';
  end if;
  return p_id;
end
$fn$;

grant execute on function public.restore_entry(uuid) to authenticated;

-- ===================================================== Cash Check
create table if not exists public.cash_checks (
  id          uuid primary key default gen_random_uuid(),
  person_id   uuid not null references public.app_users (id) on delete restrict,
  expected    numeric(12, 2) not null,
  counted     numeric(12, 2) not null check (counted >= 0),
  difference  numeric(12, 2) not null,
  note        text check (note is null or length(note) <= 300),
  checked_by  uuid not null references public.app_users (id) on delete restrict,
  checked_at  timestamptz not null default now(),
  is_deleted  boolean not null default false,
  deleted_at  timestamptz,
  deleted_by  uuid references public.app_users (id) on delete set null
);

comment on table public.cash_checks is
  'A record of counting someone''s real cash. It never changes a balance.';
comment on column public.cash_checks.difference is
  'counted - expected. Minus is Short, plus is Extra.';

create index if not exists cash_checks_person_idx on public.cash_checks (person_id, checked_at desc);
create index if not exists cash_checks_at_idx     on public.cash_checks (checked_at desc);

-- A Cash Check is a record of a moment. Nobody edits it.
create or replace function public.cash_checks_guard()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
begin
  if tg_op = 'DELETE' then
    raise exception 'A Cash Check is never removed for good.' using errcode = 'P0001';
  end if;

  if new.expected   is distinct from old.expected
     or new.counted is distinct from old.counted
     or new.difference is distinct from old.difference
     or new.person_id  is distinct from old.person_id
     or new.checked_by is distinct from old.checked_by
     or new.checked_at is distinct from old.checked_at
     or new.note       is distinct from old.note then
    raise exception 'A Cash Check cannot be changed. Delete it and count again.'
      using errcode = 'P0001';
  end if;

  if new.is_deleted and not old.is_deleted then
    new.deleted_at := now();
    new.deleted_by := auth.uid();
  elsif not new.is_deleted and old.is_deleted then
    new.deleted_at := null;
    new.deleted_by := null;
  end if;

  return new;
end
$fn$;

drop trigger if exists cash_checks_guard_trg on public.cash_checks;
create trigger cash_checks_guard_trg
  before update or delete on public.cash_checks
  for each row execute function public.cash_checks_guard();

drop trigger if exists audit_cash_checks_trg on public.cash_checks;
create trigger audit_cash_checks_trg
  after insert or update on public.cash_checks
  for each row execute function public.audit_row('person_id');

alter table public.cash_checks enable row level security;
grant all on table public.cash_checks to service_role;

drop policy if exists cash_checks_select on public.cash_checks;
create policy cash_checks_select on public.cash_checks
  for select to authenticated
  using (public.is_admin() or person_id = auth.uid());

-- Only Admin and Sub-admin may soft-delete one.
drop policy if exists cash_checks_update_admin on public.cash_checks;
create policy cash_checks_update_admin on public.cash_checks
  for update to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- No INSERT policy on purpose. The expected figure has to be worked out
-- by the server at that exact moment, so it only happens inside the
-- record_cash_check function below.

/**
 * Counts someone's real cash against what the khata says they should be
 * holding. The expected figure is read here, on the server, so it can
 * never be typed in or tampered with.
 */
create or replace function public.record_cash_check(
  p_person_id uuid,
  p_counted   numeric,
  p_note      text default null
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_expected numeric(12, 2);
  v_id       uuid;
begin
  if not public.is_admin() then
    raise exception 'Only an Admin can run a Cash Check.' using errcode = 'P0001';
  end if;
  if p_counted is null or p_counted < 0 then
    raise exception 'Enter the amount you counted.' using errcode = 'P0001';
  end if;
  if round(p_counted, 2) <> p_counted then
    raise exception 'An amount can have at most 2 decimals.' using errcode = 'P0001';
  end if;
  if not exists (select 1 from public.app_users u where u.id = p_person_id) then
    raise exception 'That person was not found.' using errcode = 'P0001';
  end if;

  select coalesce(sum(
           case
             when e.type = 'money_given' then e.amount
             else -e.amount
           end), 0)
       + coalesce((select sum(t.amount)
                     from public.entries t
                    where not t.is_deleted
                      and t.type = 'transfer'
                      and t.counterparty_id = p_person_id), 0)
    into v_expected
    from public.entries e
   where not e.is_deleted and e.person_id = p_person_id;

  insert into public.cash_checks
    (person_id, expected, counted, difference, note, checked_by)
  values
    (p_person_id, v_expected, p_counted, p_counted - v_expected,
     nullif(btrim(coalesce(p_note, '')), ''), auth.uid())
  returning id into v_id;

  return v_id;
end
$fn$;

grant execute on function public.record_cash_check(uuid, numeric, text) to authenticated;

create or replace function public.delete_cash_check(p_id uuid)
returns uuid
language plpgsql
security invoker
set search_path = public, pg_temp
as $fn$
begin
  update public.cash_checks set is_deleted = true where id = p_id and not is_deleted;
  if not found then
    raise exception 'That Cash Check was not found.' using errcode = 'P0001';
  end if;
  return p_id;
end
$fn$;

grant execute on function public.delete_cash_check(uuid) to authenticated;

-- ================================================================ views

-- The Cash Check list, with names and a plain-English result.
drop view if exists public.cash_check_feed cascade;
create view public.cash_check_feed
with (security_invoker = true)
as
select
  c.id,
  c.person_id,
  p.full_name  as person_name,
  c.expected,
  c.counted,
  c.difference,
  case
    when c.difference < 0 then 'short'
    when c.difference > 0 then 'extra'
    else 'matched'
  end          as result,
  c.note,
  c.checked_by,
  b.full_name  as checked_by_name,
  c.checked_at
from public.cash_checks c
left join public.people_names p on p.id = c.person_id
left join public.people_names b on b.id = c.checked_by
where not c.is_deleted;

grant select on public.cash_check_feed to authenticated;

-- "4 checks, 2 short, total short SAR 130"
drop view if exists public.person_check_summary cascade;
create view public.person_check_summary
with (security_invoker = true)
as
select
  c.person_id,
  count(*)                                                            as check_count,
  count(*) filter (where c.difference < 0)                            as short_count,
  count(*) filter (where c.difference > 0)                            as extra_count,
  count(*) filter (where c.difference = 0)                            as matched_count,
  coalesce(-sum(c.difference) filter (where c.difference < 0), 0)     as total_short,
  coalesce(sum(c.difference) filter (where c.difference > 0), 0)      as total_extra,
  max(c.checked_at)                                                   as last_checked_at
from public.cash_checks c
where not c.is_deleted
group by c.person_id;

grant select on public.person_check_summary to authenticated;

-- The Change History screen reads this.
drop view if exists public.audit_feed cascade;
create view public.audit_feed
with (security_invoker = true)
as
select
  a.id,
  a.table_name,
  a.row_id,
  a.action,
  a.at,
  a.actor_id,
  a.actor_name,
  a.person_id,
  pn.full_name as person_name,
  a.summary,
  a.changes
from public.audit_log a
left join public.people_names pn on pn.id = a.person_id;

grant select on public.audit_feed to authenticated;

-- entry_feed, now carrying the duplicate-bill flag.
drop view if exists public.entry_feed cascade;
create view public.entry_feed
with (security_invoker = true)
as
select
  l.entry_id              as id,
  l.person_id,
  l.line_type,
  l.signed_amount,
  e.type,
  e.amount,
  e.bill_date,
  e.entered_at,
  e.note,
  e.person_id             as owner_id,
  own.full_name           as owner_name,
  e.counterparty_id,
  cp.full_name            as counterparty_name,
  l.other_person_id,
  other.full_name         as other_person_name,
  e.entered_by,
  eb.full_name            as entered_by_name,
  (e.entered_by <> e.person_id) as entered_for_someone_else,
  e.duplicate_photo,
  e.category_id,
  c.name                  as category_name,
  c.icon                  as category_icon,
  e.project_id,
  (select count(*) from public.entry_photos p where p.entry_id = e.id)   as photo_count,
  (select p.thumb_path from public.entry_photos p
     where p.entry_id = e.id order by p.position, p.created_at limit 1)  as thumb_path
from public.entry_lines l
join public.entries e            on e.id = l.entry_id
left join public.people_names own   on own.id = e.person_id
left join public.people_names cp    on cp.id = e.counterparty_id
left join public.people_names other on other.id = l.other_person_id
left join public.people_names eb    on eb.id = e.entered_by
left join public.expense_categories c on c.id = e.category_id;

grant select on public.entry_feed to authenticated;

-- What an Admin sees under "deleted", so a mistake can be put back.
drop view if exists public.deleted_entries cascade;
create view public.deleted_entries
with (security_invoker = true)
as
select
  e.id,
  e.type,
  e.amount,
  e.bill_date,
  e.note,
  e.delete_reason,
  e.person_id,
  own.full_name as person_name,
  e.counterparty_id,
  cp.full_name  as counterparty_name,
  e.entered_by,
  eb.full_name  as entered_by_name,
  e.entered_at,
  e.deleted_at,
  e.deleted_by,
  db.full_name  as deleted_by_name,
  c.name        as category_name,
  c.icon        as category_icon
from public.entries e
left join public.people_names own on own.id = e.person_id
left join public.people_names cp  on cp.id = e.counterparty_id
left join public.people_names eb  on eb.id = e.entered_by
left join public.people_names db  on db.id = e.deleted_by
left join public.expense_categories c on c.id = e.category_id
where e.is_deleted;

grant select on public.deleted_entries to authenticated;

-- The People screen: balance plus how the last count went.
drop view if exists public.people_list cascade;
create view public.people_list
with (security_invoker = true)
as
select
  u.id,
  u.full_name,
  u.mobile,
  u.role,
  u.is_owner,
  u.is_active,
  u.job_title,
  u.created_at,
  u.disabled_at,
  c.full_name                        as created_by_name,
  coalesce(t.money_given, 0)         as money_given,
  coalesce(t.transfers_in, 0)        as transfers_in,
  coalesce(t.transfers_out, 0)       as transfers_out,
  coalesce(t.expenses, 0)            as expenses,
  coalesce(t.returned, 0)            as returned,
  coalesce(t.balance, 0)             as balance,
  coalesce(t.entry_count, 0)         as entry_count,
  le.last_entry_at,
  coalesce(s.check_count, 0)         as check_count,
  coalesce(s.short_count, 0)         as short_count,
  coalesce(s.total_short, 0)         as total_short,
  coalesce(s.total_extra, 0)         as total_extra,
  s.last_checked_at,
  lc.difference                      as last_check_difference,
  lc.result                          as last_check_result
from public.app_users u
left join public.app_users c on c.id = u.created_by
left join public.person_totals t on t.person_id = u.id
left join public.person_check_summary s on s.person_id = u.id
left join lateral (
  select max(e.entered_at) as last_entry_at
  from public.entries e
  where not e.is_deleted and (e.person_id = u.id or e.counterparty_id = u.id)
) le on true
left join lateral (
  select f.difference, f.result
  from public.cash_check_feed f
  where f.person_id = u.id
  order by f.checked_at desc
  limit 1
) lc on true;

grant select on public.people_list to authenticated;
