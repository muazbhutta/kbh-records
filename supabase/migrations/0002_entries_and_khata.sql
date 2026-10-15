-- =====================================================================
--  KBH Contracting Record Management System
--  Migration 0002 - Money entries, categories, bill photos, balances
--  Run this AFTER 0001, in the Supabase SQL Editor.
-- =====================================================================
--  The money model
--
--    Balance = Money Given + Transfers In
--            - Transfers Out - Expenses - Returned
--
--  A transfer is stored ONCE: person_id is the sender, counterparty_id
--  is the receiver. The entry_lines view then shows it in both khatas,
--  as "Sent to Ibrar" on one side and "Received from Rana" on the other,
--  so the two halves can never drift apart.
--
--  Every total is worked out here in SQL, never on the phone.
-- =====================================================================

-- ---------------------------------------------------------------- enum
do $do$
begin
  create type public.entry_type as enum ('money_given', 'transfer', 'expense', 'returned');
exception
  when duplicate_object then null;
end
$do$;

-- --------------------------------------------------- expense categories
create table if not exists public.expense_categories (
  id         uuid primary key default gen_random_uuid(),
  name       text not null check (length(btrim(name)) between 2 and 40),
  icon       text not null default 'pricetag-outline',
  sort_order smallint not null default 100,
  is_hidden  boolean not null default false,
  created_at timestamptz not null default now(),
  created_by uuid references public.app_users (id) on delete set null
);

-- Two categories can never share a name, whatever the capitalisation.
create unique index if not exists expense_categories_name_key
  on public.expense_categories (lower(btrim(name)));

comment on table public.expense_categories is
  'Material, Transport, Fuel ... Categories are hidden, never deleted, once used.';

insert into public.expense_categories (name, icon, sort_order)
values
  ('Material',          'cube-outline',        10),
  ('Transport',         'car-outline',         20),
  ('Fuel',              'speedometer-outline', 30),
  ('Labour',            'people-outline',      40),
  ('Food',              'fast-food-outline',   50),
  ('Tools / Equipment', 'hammer-outline',      60),
  ('Other',             'ellipsis-horizontal', 99)
on conflict do nothing;

-- -------------------------------------------------------------- entries
create table if not exists public.entries (
  id              uuid primary key default gen_random_uuid(),
  type            public.entry_type not null,
  amount          numeric(12, 2) not null check (amount > 0),

  -- whose khata this entry belongs to, and for a transfer, who receives
  person_id       uuid not null references public.app_users (id) on delete restrict,
  counterparty_id uuid references public.app_users (id) on delete restrict,

  category_id     uuid references public.expense_categories (id) on delete restrict,
  note            text check (note is null or length(note) <= 300),

  bill_date       date not null,
  entered_by      uuid not null references public.app_users (id) on delete restrict,
  entered_at      timestamptz not null default now(),

  -- Site / project tracking is not built yet. When it is, it becomes a
  -- foreign key to a new public.projects table; old rows simply stay null.
  project_id      uuid,

  -- Sent from a phone that was offline, so a retry cannot double-save.
  client_id       uuid unique,

  is_deleted      boolean not null default false,
  deleted_at      timestamptz,
  deleted_by      uuid references public.app_users (id) on delete set null,
  updated_at      timestamptz not null default now(),

  constraint entries_transfer_shape
    check ((type = 'transfer') = (counterparty_id is not null)),
  constraint entries_expense_shape
    check ((type = 'expense') = (category_id is not null)),
  constraint entries_no_self_transfer
    check (counterparty_id is null or counterparty_id <> person_id)
);

comment on column public.entries.person_id is
  'Whose khata. For a transfer this is the SENDER.';
comment on column public.entries.counterparty_id is
  'Transfers only: who receives the cash.';
comment on column public.entries.entered_at is
  'Server clock. Nobody can change it, not even an Admin.';

create index if not exists entries_person_idx
  on public.entries (person_id, bill_date desc) where not is_deleted;
create index if not exists entries_counterparty_idx
  on public.entries (counterparty_id, bill_date desc) where not is_deleted;
create index if not exists entries_type_idx
  on public.entries (type, bill_date desc) where not is_deleted;
create index if not exists entries_bill_date_idx
  on public.entries (bill_date desc) where not is_deleted;
create index if not exists entries_entered_at_idx
  on public.entries (entered_at desc);
create index if not exists entries_entered_by_idx
  on public.entries (entered_by, entered_at desc);
create index if not exists entries_category_idx
  on public.entries (category_id) where not is_deleted;

-- --------------------------------------------------------- bill photos
create table if not exists public.entry_photos (
  id           uuid primary key default gen_random_uuid(),
  entry_id     uuid not null references public.entries (id) on delete cascade,
  storage_path text not null,
  thumb_path   text,
  sha256       text not null,
  width        integer,
  height       integer,
  bytes        integer,
  position     smallint not null default 0,
  created_at   timestamptz not null default now()
);

comment on column public.entry_photos.sha256 is
  'Hash of the compressed photo, so the same bill cannot be claimed twice.';

create index if not exists entry_photos_entry_idx on public.entry_photos (entry_id, position);
create index if not exists entry_photos_sha_idx   on public.entry_photos (sha256);
create index if not exists entry_photos_path_idx  on public.entry_photos (storage_path);
create index if not exists entry_photos_thumb_idx on public.entry_photos (thumb_path);

-- ============================================================ triggers

-- Bill date may not be in the future, and the server stamps can never
-- be edited by anyone.
create or replace function public.entries_guard()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_today date := (now() at time zone 'Asia/Riyadh')::date;
begin
  if tg_op = 'DELETE' then
    raise exception
      'Entries are never removed for good. Delete marks them as deleted instead.'
      using errcode = 'P0001';
  end if;

  if new.bill_date > v_today then
    raise exception 'The bill date cannot be in the future.' using errcode = 'P0001';
  end if;

  if tg_op = 'INSERT' then
    new.entered_at := now();
    new.is_deleted := coalesce(new.is_deleted, false);
  else
    new.entered_at := old.entered_at;
    new.entered_by := old.entered_by;
    new.type       := old.type;
    new.client_id  := old.client_id;
    new.updated_at := now();

    if new.is_deleted and not old.is_deleted then
      new.deleted_at := now();
      new.deleted_by := auth.uid();
    elsif not new.is_deleted and old.is_deleted then
      new.deleted_at := null;
      new.deleted_by := null;
    end if;
  end if;

  return new;
end
$fn$;

drop trigger if exists entries_guard_trg on public.entries;
create trigger entries_guard_trg
  before insert or update or delete on public.entries
  for each row execute function public.entries_guard();

-- An expense is not an expense without a bill. Checked at COMMIT, so the
-- entry and its photos can be written in the same transaction.
create or replace function public.expense_needs_photo()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
begin
  if new.type = 'expense' and not new.is_deleted then
    if not exists (select 1 from public.entry_photos p where p.entry_id = new.id) then
      raise exception 'An expense needs at least one bill photo.' using errcode = 'P0001';
    end if;
  end if;
  return null;
end
$fn$;

drop trigger if exists expense_needs_photo_trg on public.entries;
create constraint trigger expense_needs_photo_trg
  after insert or update on public.entries
  deferrable initially deferred
  for each row execute function public.expense_needs_photo();

-- A category that has been used can be hidden but never removed.
create or replace function public.category_guard()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
begin
  if exists (select 1 from public.entries e where e.category_id = old.id) then
    raise exception
      'This category is already used by entries. Hide it instead of deleting it.'
      using errcode = 'P0001';
  end if;
  return old;
end
$fn$;

drop trigger if exists category_guard_trg on public.expense_categories;
create trigger category_guard_trg
  before delete on public.expense_categories
  for each row execute function public.category_guard();

-- ================================================================ views

-- Names only. Everyone signed in may read these, because an Expense can
-- be entered "for" a colleague and a Transfer needs a receiver. Nothing
-- else about a person leaks: no mobile, no role, no balance.
drop view if exists public.people_names cascade;
create view public.people_names
with (security_invoker = false)
as
select u.id, u.full_name, u.is_active, u.is_owner
from public.app_users u;

revoke all on public.people_names from anon;
grant select on public.people_names to authenticated;

-- One row per person per entry. A transfer makes two rows: money out of
-- the sender's khata and the same money into the receiver's.
drop view if exists public.entry_lines cascade;
create view public.entry_lines
with (security_invoker = true)
as
select
  e.id as entry_id,
  e.person_id,
  case e.type
    when 'money_given' then 'money_given'
    when 'transfer'    then 'transfer_out'
    when 'expense'     then 'expense'
    when 'returned'    then 'returned'
  end as line_type,
  case when e.type = 'money_given' then e.amount else -e.amount end as signed_amount,
  e.counterparty_id as other_person_id
from public.entries e
where not e.is_deleted

union all

select
  e.id,
  e.counterparty_id,
  'transfer_in',
  e.amount,
  e.person_id
from public.entries e
where not e.is_deleted and e.type = 'transfer';

grant select on public.entry_lines to authenticated;

-- What every person should be holding right now.
drop view if exists public.person_totals cascade;
create view public.person_totals
with (security_invoker = true)
as
select
  l.person_id,
  coalesce(sum(l.signed_amount) filter (where l.line_type = 'money_given'),  0)  as money_given,
  coalesce(sum(l.signed_amount) filter (where l.line_type = 'transfer_in'),  0)  as transfers_in,
  coalesce(-sum(l.signed_amount) filter (where l.line_type = 'transfer_out'), 0) as transfers_out,
  coalesce(-sum(l.signed_amount) filter (where l.line_type = 'expense'),      0) as expenses,
  coalesce(-sum(l.signed_amount) filter (where l.line_type = 'returned'),     0) as returned,
  coalesce(sum(l.signed_amount), 0)                                             as balance,
  count(*)                                                                      as entry_count
from public.entry_lines l
group by l.person_id;

grant select on public.person_totals to authenticated;

-- The list a person actually reads: an entry, from one person's side,
-- with every name and label already filled in.
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

-- People screen: everyone with the cash they should be holding.
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
  le.last_entry_at
from public.app_users u
left join public.app_users c on c.id = u.created_by
left join public.person_totals t on t.person_id = u.id
left join lateral (
  select max(e.entered_at) as last_entry_at
  from public.entries e
  where not e.is_deleted and (e.person_id = u.id or e.counterparty_id = u.id)
) le on true;

grant select on public.people_list to authenticated;

-- ===================================================== Row Level Security
alter table public.entries            enable row level security;
alter table public.entry_photos       enable row level security;
alter table public.expense_categories enable row level security;

-- entries -------------------------------------------------------------
-- You may read an entry if it touches your khata, you entered it, or
-- you are an Admin.
drop policy if exists entries_select on public.entries;
create policy entries_select on public.entries
  for select to authenticated
  using (
    public.is_admin()
    or person_id = auth.uid()
    or counterparty_id = auth.uid()
    or entered_by = auth.uid()
  );

-- Admin and Sub-admin can record anything for anybody.
drop policy if exists entries_insert_admin on public.entries;
create policy entries_insert_admin on public.entries
  for insert to authenticated
  with check (public.is_admin() and entered_by = auth.uid());

-- An Employee can record an Expense (their own, or for a colleague who
-- cannot) and can send their own cash to someone else. Money Given and
-- Returned stay with the Admins, because that is the company's cash.
drop policy if exists entries_insert_employee on public.entries;
create policy entries_insert_employee on public.entries
  for insert to authenticated
  with check (
    public.is_active_user()
    and entered_by = auth.uid()
    and (
      type = 'expense'
      or (type = 'transfer' and person_id = auth.uid())
    )
  );

-- Only Admin and Sub-admin can change or delete an entry, and the guard
-- trigger still freezes who entered it and when.
drop policy if exists entries_update_admin on public.entries;
create policy entries_update_admin on public.entries
  for update to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- No DELETE policy: rows are only ever marked deleted.

-- entry_photos --------------------------------------------------------
drop policy if exists entry_photos_select on public.entry_photos;
create policy entry_photos_select on public.entry_photos
  for select to authenticated
  using (
    exists (select 1 from public.entries e where e.id = entry_id)
  );

drop policy if exists entry_photos_insert on public.entry_photos;
create policy entry_photos_insert on public.entry_photos
  for insert to authenticated
  with check (
    exists (
      select 1 from public.entries e
      where e.id = entry_id and (e.entered_by = auth.uid() or public.is_admin())
    )
  );

drop policy if exists entry_photos_delete_admin on public.entry_photos;
create policy entry_photos_delete_admin on public.entry_photos
  for delete to authenticated
  using (public.is_admin());

-- expense_categories --------------------------------------------------
drop policy if exists categories_select on public.expense_categories;
create policy categories_select on public.expense_categories
  for select to authenticated
  using (true);

drop policy if exists categories_write_admin on public.expense_categories;
create policy categories_write_admin on public.expense_categories
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

grant all on table public.entries            to service_role;
grant all on table public.entry_photos       to service_role;
grant all on table public.expense_categories to service_role;

-- ================================================== saving a new entry
-- One call, one transaction: the entry and its bill photos either both
-- land or neither does. Row Level Security still decides what the caller
-- is allowed to write, because this runs as the caller.
create or replace function public.create_entry(
  p_type            public.entry_type,
  p_amount          numeric,
  p_person_id       uuid,
  p_bill_date       date,
  p_counterparty_id uuid default null,
  p_category_id     uuid default null,
  p_note            text default null,
  p_photos          jsonb default '[]'::jsonb,
  p_client_id       uuid default null
)
returns uuid
language plpgsql
security invoker
set search_path = public, pg_temp
as $fn$
declare
  v_id    uuid;
  v_photo jsonb;
  v_i     smallint := 0;
begin
  -- A phone that lost signal may send the same entry twice.
  if p_client_id is not null then
    select id into v_id from public.entries where client_id = p_client_id;
    if v_id is not null then
      return v_id;
    end if;
  end if;

  if p_amount is null or p_amount <= 0 then
    raise exception 'Enter an amount bigger than zero.' using errcode = 'P0001';
  end if;
  if round(p_amount, 2) <> p_amount then
    raise exception 'An amount can have at most 2 decimals.' using errcode = 'P0001';
  end if;
  if p_type = 'expense' and jsonb_array_length(coalesce(p_photos, '[]'::jsonb)) = 0 then
    raise exception 'An expense needs at least one bill photo.' using errcode = 'P0001';
  end if;
  if jsonb_array_length(coalesce(p_photos, '[]'::jsonb)) > 5 then
    raise exception 'Up to 5 bill photos per entry.' using errcode = 'P0001';
  end if;

  insert into public.entries
    (type, amount, person_id, counterparty_id, category_id, note,
     bill_date, entered_by, client_id)
  values
    (p_type, p_amount, p_person_id, p_counterparty_id, p_category_id,
     nullif(btrim(coalesce(p_note, '')), ''),
     p_bill_date, auth.uid(), p_client_id)
  returning id into v_id;

  for v_photo in select * from jsonb_array_elements(coalesce(p_photos, '[]'::jsonb))
  loop
    insert into public.entry_photos
      (entry_id, storage_path, thumb_path, sha256, width, height, bytes, position)
    values (
      v_id,
      v_photo ->> 'storage_path',
      v_photo ->> 'thumb_path',
      v_photo ->> 'sha256',
      (v_photo ->> 'width')::int,
      (v_photo ->> 'height')::int,
      (v_photo ->> 'bytes')::int,
      v_i
    );
    v_i := v_i + 1;
  end loop;

  return v_id;
end
$fn$;

grant execute on function public.create_entry(
  public.entry_type, numeric, uuid, date, uuid, uuid, text, jsonb, uuid
) to authenticated;

-- ============================================== bill photo storage
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('bills', 'bills', false, 10485760, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- Everyone uploads into a folder named after their own user id.
drop policy if exists "bills upload own folder" on storage.objects;
create policy "bills upload own folder" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'bills'
    and public.is_active_user()
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- You may look at a bill photo if you may look at the entry it belongs
-- to, or if you are the one who just uploaded it.
drop policy if exists "bills read allowed" on storage.objects;
create policy "bills read allowed" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'bills'
    and (
      public.is_admin()
      or owner = auth.uid()
      or exists (
        select 1
        from public.entry_photos p
        join public.entries e on e.id = p.entry_id
        where (p.storage_path = storage.objects.name or p.thumb_path = storage.objects.name)
          and (e.person_id = auth.uid()
               or e.counterparty_id = auth.uid()
               or e.entered_by = auth.uid())
      )
    )
  );

drop policy if exists "bills admin manage" on storage.objects;
create policy "bills admin manage" on storage.objects
  for delete to authenticated
  using (bucket_id = 'bills' and public.is_admin());
