-- =====================================================================
--  Migration 0024 - Reports can be cut by category as well
-- ---------------------------------------------------------------------
--  "Show me only the Fuel bills, and only the Invoice ones." The three
--  report calls take one more argument: which category. Null means every
--  category, as before, so nothing that already works changes.
--
--  The old shapes are dropped first. Leaving them behind would give
--  PostgREST two functions of the same name and it would refuse to
--  choose between them.
-- =====================================================================

drop function if exists public.expense_report(date, date, uuid, public.expense_kind);
drop function if exists public.expense_report_totals(date, date, uuid);
drop function if exists public.report_photos(date, date, uuid, public.expense_kind);

/**
 * The rows behind Petty / Invoice / All Expenses, and behind the ZIP.
 * p_kind: null for every expense, or 'petty' / 'invoice'.
 * p_category_id: null for every category.
 */
create or replace function public.expense_report(
  p_from        date default null,
  p_to          date default null,
  p_person_id   uuid default null,
  p_kind        public.expense_kind default null,
  p_category_id uuid default null
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
    e.id, e.system_id, e.bill_date, e.entered_at, e.person_id,
    p.full_name, eb.full_name, e.category_id, c.name,
    e.expense_type, e.type_source, e.note, e.amount,
    e.vat_number, e.qr_seller_name,
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
    and (p_category_id is null or e.category_id = p_category_id)
  order by e.bill_date, e.entered_at, e.system_id;
end
$fn$;

grant execute on function public.expense_report(date, date, uuid, public.expense_kind, uuid)
  to authenticated;

/**
 * The same filters, but only the totals. The app compares this with what
 * it is about to print; if the two ever disagree it refuses to make the
 * PDF rather than hand someone a wrong number.
 */
create or replace function public.expense_report_totals(
  p_from        date default null,
  p_to          date default null,
  p_person_id   uuid default null,
  p_category_id uuid default null
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
    and (p_person_id is null or e.person_id = p_person_id)
    and (p_category_id is null or e.category_id = p_category_id);

  return jsonb_build_object(
    'all_total',     v_all,
    'petty_total',   v_petty,
    'invoice_total', v_invoice,
    'entry_count',   v_count,
    'photo_count',   v_photos
  );
end
$fn$;

grant execute on function public.expense_report_totals(date, date, uuid, uuid) to authenticated;

/** Every photo a ZIP needs, with the names already worked out in order. */
create or replace function public.report_photos(
  p_from        date default null,
  p_to          date default null,
  p_person_id   uuid default null,
  p_kind        public.expense_kind default null,
  p_category_id uuid default null
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
    e.id, e.system_id, ph.storage_path, ph.position,
    (select count(*) from public.entry_photos x where x.entry_id = e.id),
    e.bill_date, e.entered_at, p.full_name, c.name, e.expense_type, e.amount
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
    and (p_category_id is null or e.category_id = p_category_id)
  order by e.bill_date, e.entered_at, e.system_id, ph.position;
end
$fn$;

grant execute on function public.report_photos(date, date, uuid, public.expense_kind, uuid)
  to authenticated;

-- The download log should say which slice was taken, not just the dates.
alter table public.report_downloads
  add column if not exists category_name text;

comment on column public.report_downloads.category_name is
  'Which category the download was narrowed to, or null for all of them.';

create or replace function public.log_report_download(
  p_kind        text,
  p_from        date default null,
  p_to          date default null,
  p_person_id   uuid default null,
  p_rows        integer default null,
  p_total       numeric default null,
  p_note        text default null,
  p_category_id uuid default null
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
     row_count, total, note, category_name)
  values (
    p_kind,
    v_actor,
    (select full_name from public.app_users where id = v_actor),
    p_from, p_to, p_person_id,
    (select full_name from public.app_users where id = p_person_id),
    p_rows, p_total, p_note,
    (select name from public.expense_categories where id = p_category_id)
  );
end
$fn$;

grant execute on function public.log_report_download(
  text, date, date, uuid, integer, numeric, text, uuid) to authenticated;

drop view if exists public.report_download_log cascade;
create view public.report_download_log
with (security_invoker = true)
as
select id, kind, at, actor_id, actor_name, from_date, to_date,
       person_id, person_name, category_name, row_count, total, note
from public.report_downloads;

grant select on public.report_download_log to authenticated;
