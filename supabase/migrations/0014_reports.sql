-- =====================================================================
--  Migration 0014 - What the reports and the photo ZIP read
-- ---------------------------------------------------------------------
--  One call returns every expense row a report needs, already filtered
--  and sorted, so the phone does no arithmetic of its own. Cancelled and
--  deleted expenses are never in it.
--
--  Every report and every ZIP download is written down: who, when, and
--  which filters. That log is itself part of the audit trail.
-- =====================================================================

/**
 * The rows behind Petty / Invoice / All Expenses, and behind the ZIP.
 * p_kind: null for every expense, or 'petty' / 'invoice'.
 */
create or replace function public.expense_report(
  p_from      date default null,
  p_to        date default null,
  p_person_id uuid default null,
  p_kind      public.expense_kind default null
)
returns table (
  id             uuid,
  system_id      text,
  bill_date      date,
  entered_at     timestamptz,
  person_id      uuid,
  person_name    text,
  entered_by_name text,
  category_id    uuid,
  category_name  text,
  expense_type   public.expense_kind,
  type_source    public.type_source,
  note           text,
  amount         numeric,
  vat_number     text,
  qr_seller_name text,
  photo_count    bigint
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $fn$
begin
  if not public.is_admin() then
    raise exception 'Only an Admin can read reports.' using errcode = 'P0001';
  end if;

  return query
  select
    e.id,
    e.system_id,
    e.bill_date,
    e.entered_at,
    e.person_id,
    p.full_name,
    eb.full_name,
    e.category_id,
    c.name,
    e.expense_type,
    e.type_source,
    e.note,
    e.amount,
    e.vat_number,
    e.qr_seller_name,
    (select count(*) from public.entry_photos ph where ph.entry_id = e.id)
  from public.entries e
  left join public.app_users p  on p.id = e.person_id
  left join public.app_users eb on eb.id = e.entered_by
  left join public.expense_categories c on c.id = e.category_id
  where e.type = 'expense'
    and not e.is_deleted
    and not e.is_cancelled
    and (p_from is null or e.bill_date >= p_from)
    and (p_to   is null or e.bill_date <= p_to)
    and (p_person_id is null or e.person_id = p_person_id)
    and (p_kind is null or e.expense_type = p_kind)
  order by e.bill_date, e.entered_at, e.system_id;
end
$fn$;

grant execute on function public.expense_report(date, date, uuid, public.expense_kind) to authenticated;

/**
 * The same filters, but only the totals. The app compares this with what
 * it is about to print; if the two ever disagree it refuses to make the
 * PDF rather than hand someone a wrong number.
 */
create or replace function public.expense_report_totals(
  p_from      date default null,
  p_to        date default null,
  p_person_id uuid default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_all     numeric := 0;
  v_petty   numeric := 0;
  v_invoice numeric := 0;
  v_count   bigint  := 0;
  v_photos  bigint  := 0;
begin
  if not public.is_admin() then
    raise exception 'Only an Admin can read reports.' using errcode = 'P0001';
  end if;

  select
    coalesce(sum(e.amount), 0),
    coalesce(sum(e.amount) filter (where e.expense_type = 'petty'), 0),
    coalesce(sum(e.amount) filter (where e.expense_type = 'invoice'), 0),
    count(*),
    coalesce(sum((select count(*) from public.entry_photos ph where ph.entry_id = e.id)), 0)
  into v_all, v_petty, v_invoice, v_count, v_photos
  from public.entries e
  where e.type = 'expense'
    and not e.is_deleted
    and not e.is_cancelled
    and (p_from is null or e.bill_date >= p_from)
    and (p_to   is null or e.bill_date <= p_to)
    and (p_person_id is null or e.person_id = p_person_id);

  return jsonb_build_object(
    'all_total',     v_all,
    'petty_total',   v_petty,
    'invoice_total', v_invoice,
    'entry_count',   v_count,
    'photo_count',   v_photos
  );
end
$fn$;

grant execute on function public.expense_report_totals(date, date, uuid) to authenticated;

/** Every photo a ZIP needs, with the names already worked out in order. */
create or replace function public.report_photos(
  p_from      date default null,
  p_to        date default null,
  p_person_id uuid default null,
  p_kind      public.expense_kind default null
)
returns table (
  entry_id      uuid,
  system_id     text,
  storage_path  text,
  photo_index   smallint,
  photo_total   bigint,
  bill_date     date,
  entered_at    timestamptz,
  person_name   text,
  category_name text,
  expense_type  public.expense_kind,
  amount        numeric
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $fn$
begin
  if not public.is_admin() then
    raise exception 'Only an Admin can download bill photos.' using errcode = 'P0001';
  end if;

  return query
  select
    e.id,
    e.system_id,
    ph.storage_path,
    ph.position,
    (select count(*) from public.entry_photos x where x.entry_id = e.id),
    e.bill_date,
    e.entered_at,
    p.full_name,
    c.name,
    e.expense_type,
    e.amount
  from public.entries e
  join public.entry_photos ph on ph.entry_id = e.id
  left join public.app_users p on p.id = e.person_id
  left join public.expense_categories c on c.id = e.category_id
  where e.type = 'expense'
    and not e.is_deleted
    and not e.is_cancelled
    and (p_from is null or e.bill_date >= p_from)
    and (p_to   is null or e.bill_date <= p_to)
    and (p_person_id is null or e.person_id = p_person_id)
    and (p_kind is null or e.expense_type = p_kind)
  order by e.bill_date, e.entered_at, e.system_id, ph.position;
end
$fn$;

grant execute on function public.report_photos(date, date, uuid, public.expense_kind) to authenticated;

-- ============================================ who downloaded what
create table if not exists public.report_downloads (
  id          bigint generated always as identity primary key,
  kind        text not null,
  at          timestamptz not null default now(),
  actor_id    uuid references public.app_users (id) on delete set null,
  actor_name  text,
  from_date   date,
  to_date     date,
  person_id   uuid references public.app_users (id) on delete set null,
  person_name text,
  row_count   integer,
  total       numeric(14, 2),
  note        text
);

comment on table public.report_downloads is
  'Every PDF and every photo ZIP that left the app. Append only.';

create index if not exists report_downloads_at_idx on public.report_downloads (at desc);

alter table public.report_downloads enable row level security;
revoke all on table public.report_downloads from anon, authenticated;
grant select on table public.report_downloads to authenticated;
grant all on table public.report_downloads to service_role;

drop policy if exists report_downloads_select_admin on public.report_downloads;
create policy report_downloads_select_admin on public.report_downloads
  for select to authenticated
  using (public.is_admin());

create or replace function public.log_report_download(
  p_kind      text,
  p_from      date default null,
  p_to        date default null,
  p_person_id uuid default null,
  p_rows      integer default null,
  p_total     numeric default null,
  p_note      text default null
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_actor uuid := auth.uid();
begin
  if not public.is_admin() then
    raise exception 'Only an Admin can download reports.' using errcode = 'P0001';
  end if;

  insert into public.report_downloads
    (kind, actor_id, actor_name, from_date, to_date, person_id, person_name,
     row_count, total, note)
  values (
    p_kind,
    v_actor,
    (select full_name from public.app_users where id = v_actor),
    p_from, p_to, p_person_id,
    (select full_name from public.app_users where id = p_person_id),
    p_rows, p_total, p_note
  );
end
$fn$;

grant execute on function public.log_report_download(text, date, date, uuid, integer, numeric, text)
  to authenticated;

-- The log can never be edited or thrown away.
create or replace function public.report_downloads_append_only()
returns trigger language plpgsql as $fn$
begin
  raise exception 'The download log cannot be changed.' using errcode = 'P0001';
end
$fn$;

drop trigger if exists report_downloads_append_only_trg on public.report_downloads;
create trigger report_downloads_append_only_trg
  before update or delete on public.report_downloads
  for each row execute function public.report_downloads_append_only();

drop view if exists public.report_download_log cascade;
create view public.report_download_log
with (security_invoker = true)
as
select id, kind, at, actor_id, actor_name, from_date, to_date,
       person_id, person_name, row_count, total, note
from public.report_downloads;

grant select on public.report_download_log to authenticated;
