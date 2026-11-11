-- A report can be about one site.
--
-- Projects were a thing the office could look at on their own screen
-- and nothing more: no way to take the bills for one site out of the
-- app, which is the question a client or a costing actually asks.
--
-- The three report functions learn one more filter. Adding a parameter
-- changes the signature, and PostgREST would then see two shapes of
-- each and refuse to call either, so the old ones go first. The
-- parameter is last and defaults to null, so every existing call means
-- exactly what it meant before: every project, and the ones filed
-- against none.

drop function if exists public.expense_report(date, date, uuid, public.expense_kind, uuid);
drop function if exists public.report_photos(date, date, uuid, public.expense_kind, uuid);
drop function if exists public.expense_report_totals(date, date, uuid, uuid);

create function public.expense_report(
  p_from date default null,
  p_to date default null,
  p_person_id uuid default null,
  p_kind public.expense_kind default null,
  p_category_id uuid default null,
  p_project_id uuid default null
)
returns table (
  id uuid, system_id text, bill_date date, entered_at timestamptz,
  person_id uuid, person_name text, entered_by_name text,
  category_id uuid, category_name text,
  expense_type public.expense_kind, type_source public.type_source,
  note text, amount numeric, vat_number text, qr_seller_name text,
  photo_count bigint,
  -- The site it was spent on, so a report can be grouped by one.
  project_id uuid, project_name text
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
    (select count(*) from public.entry_photos ph where ph.entry_id = e.id),
    e.project_id, pr.name
  from public.entries e
  left join public.projects pr on pr.id = e.project_id
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
    and (p_project_id is null or e.project_id = p_project_id)
  order by e.bill_date, e.entered_at, e.system_id;
end
$fn$;

create function public.report_photos(
  p_from date default null,
  p_to date default null,
  p_person_id uuid default null,
  p_kind public.expense_kind default null,
  p_category_id uuid default null,
  p_project_id uuid default null
)
returns table (
  entry_id uuid, system_id text, storage_path text,
  photo_index smallint, photo_total bigint,
  bill_date date, entered_at timestamptz,
  person_name text, category_name text,
  expense_type public.expense_kind, amount numeric
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
    and (p_project_id is null or e.project_id = p_project_id)
  order by e.bill_date, e.entered_at, e.system_id, ph.position;
end
$fn$;

create function public.expense_report_totals(
  p_from date default null,
  p_to date default null,
  p_person_id uuid default null,
  p_category_id uuid default null,
  p_project_id uuid default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_all            numeric := 0;
  v_petty          numeric := 0;
  v_invoice        numeric := 0;
  v_labour         numeric := 0;
  v_transfer       numeric := 0;
  v_count          bigint  := 0;
  v_petty_count    bigint  := 0;
  v_invoice_count  bigint  := 0;
  v_labour_count   bigint  := 0;
  v_transfer_count bigint  := 0;
  v_photos         bigint  := 0;
begin
  if not public.is_admin() then
    raise exception 'Only an Admin can read reports.' using errcode = 'P0001';
  end if;

  select
    coalesce(sum(e.amount), 0),
    coalesce(sum(e.amount) filter (where e.expense_type = 'petty'), 0),
    coalesce(sum(e.amount) filter (where e.expense_type = 'invoice'), 0),
    coalesce(sum(e.amount) filter (where e.expense_type = 'labour'), 0),
    coalesce(sum(e.amount) filter (where e.expense_type = 'bank_transfer'), 0),
    count(*),
    count(*) filter (where e.expense_type = 'petty'),
    count(*) filter (where e.expense_type = 'invoice'),
    count(*) filter (where e.expense_type = 'labour'),
    count(*) filter (where e.expense_type = 'bank_transfer'),
    coalesce(sum((select count(*) from public.entry_photos ph where ph.entry_id = e.id)), 0)
  into v_all, v_petty, v_invoice, v_labour, v_transfer,
       v_count, v_petty_count, v_invoice_count, v_labour_count, v_transfer_count, v_photos
  from public.entries e
  where e.type = 'expense'
    and not e.is_deleted
    and not e.is_cancelled
    and (p_from is null or e.bill_date >= p_from)
    and (p_to   is null or e.bill_date <= p_to)
    and (p_person_id is null or e.person_id = p_person_id)
    and (p_category_id is null or e.category_id = p_category_id)
    and (p_project_id is null or e.project_id = p_project_id);

  return jsonb_build_object(
    'all_total',      v_all,
    'petty_total',    v_petty,
    'invoice_total',  v_invoice,
    'labour_total',   v_labour,
    'transfer_total', v_transfer,
    'entry_count',    v_count,
    'petty_count',    v_petty_count,
    'invoice_count',  v_invoice_count,
    'labour_count',   v_labour_count,
    'transfer_count', v_transfer_count,
    'photo_count',    v_photos
  );
end
$fn$;

revoke all on function public.expense_report(date, date, uuid, public.expense_kind, uuid, uuid) from public, anon;
revoke all on function public.report_photos(date, date, uuid, public.expense_kind, uuid, uuid) from public, anon;
revoke all on function public.expense_report_totals(date, date, uuid, uuid, uuid) from public, anon;
grant execute on function public.expense_report(date, date, uuid, public.expense_kind, uuid, uuid) to authenticated;
grant execute on function public.report_photos(date, date, uuid, public.expense_kind, uuid, uuid) to authenticated;
grant execute on function public.expense_report_totals(date, date, uuid, uuid, uuid) to authenticated;
