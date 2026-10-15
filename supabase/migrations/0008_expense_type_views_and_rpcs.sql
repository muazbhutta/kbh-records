-- =====================================================================
--  Migration 0008 - Views and calls for Petty / Invoice
-- ---------------------------------------------------------------------
--  Everything the app already reads keeps the same name and the same
--  columns; the new ones are added on the end. A cancelled expense now
--  drops out of the money views, which is what puts the cash back in the
--  person's hand.
-- =====================================================================

-- ====================================================== money views
-- Cancelled entries leave the balances. Deleted ones already did.
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
where not e.is_deleted and not e.is_cancelled

union all

select
  e.id,
  e.counterparty_id,
  'transfer_in',
  e.amount,
  e.person_id
from public.entries e
where not e.is_deleted and not e.is_cancelled and e.type = 'transfer';

grant select on public.entry_lines to authenticated;

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

-- entry_feed, now carrying the System ID and the expense type. The QR
-- details are deliberately NOT here: employees read this view.
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
  e.system_id,
  e.expense_type,
  e.type_source,
  e.type_flags,
  e.bill_scan_state,
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

-- What the QR told us. Admin and Sub-admin only.
drop view if exists public.invoice_details cascade;
create view public.invoice_details
with (security_invoker = false)
as
select
  e.id as entry_id,
  e.system_id,
  e.vat_number,
  e.qr_seller_name,
  e.qr_vat_number,
  e.qr_issued_at,
  e.qr_total,
  e.qr_vat_amount,
  (e.qr_total is not null and e.qr_total <> e.amount) as amount_differs
from public.entries e
where public.is_admin();

grant select on public.invoice_details to authenticated;

-- The Admin "Check type" list: anything the system was unsure about.
drop view if exists public.expenses_to_check cascade;
create view public.expenses_to_check
with (security_invoker = true)
as
select
  e.id,
  e.system_id,
  e.amount,
  e.bill_date,
  e.entered_at,
  e.note,
  e.expense_type,
  e.type_source,
  e.type_flags,
  e.bill_scan_state,
  e.person_id,
  p.full_name as person_name,
  c.name      as category_name,
  c.icon      as category_icon,
  e.qr_total,
  (select count(*) from public.entry_photos ph where ph.entry_id = e.id) as photo_count,
  (select ph.thumb_path from public.entry_photos ph
     where ph.entry_id = e.id order by ph.position, ph.created_at limit 1) as thumb_path
from public.entries e
left join public.people_names p on p.id = e.person_id
left join public.expense_categories c on c.id = e.category_id
where e.type = 'expense'
  and not e.is_deleted
  and not e.is_cancelled
  and (e.type_flags && array['type_check', 'old_entry_check', 'amount_differs']
       or e.bill_scan_state = 'pending');

grant select on public.expenses_to_check to authenticated;

-- ================================================= saving an expense
-- The old call is replaced by one that also carries the type and the QR.
drop function if exists public.create_entry(
  public.entry_type, numeric, uuid, date, uuid, uuid, text, jsonb, uuid);

create or replace function public.create_entry(
  p_type            public.entry_type,
  p_amount          numeric,
  p_person_id       uuid,
  p_bill_date       date,
  p_counterparty_id uuid default null,
  p_category_id     uuid default null,
  p_note            text default null,
  p_photos          jsonb default '[]'::jsonb,
  p_client_id       uuid default null,
  p_expense_type    public.expense_kind default null,
  p_type_source     public.type_source default null,
  p_qr              jsonb default null,
  p_flags           text[] default '{}'
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
  v_flags text[] := coalesce(p_flags, '{}');
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

  -- The bill said one thing, the person typed another.
  if p_qr is not null and (p_qr ->> 'total') is not null
     and (p_qr ->> 'total')::numeric <> p_amount then
    v_flags := array(select distinct unnest(v_flags || array['amount_differs']));
  end if;

  insert into public.entries
    (type, amount, person_id, counterparty_id, category_id, note,
     bill_date, entered_by, client_id,
     expense_type, type_source, type_flags, bill_scan_state,
     qr_seller_name, qr_vat_number, qr_issued_at, qr_total, qr_vat_amount, qr_raw,
     vat_number)
  values
    (p_type, p_amount, p_person_id, p_counterparty_id, p_category_id,
     nullif(btrim(coalesce(p_note, '')), ''),
     p_bill_date, auth.uid(), p_client_id,
     case when p_type = 'expense' then coalesce(p_expense_type, 'petty') end,
     case when p_type = 'expense' then coalesce(p_type_source, 'auto_none') end,
     v_flags,
     case
       when p_type <> 'expense' then 'not_needed'
       -- A QR settles it; anything else still wants a look at the text.
       when p_type_source = 'auto_qr' then 'done'
       else 'pending'
     end,
     p_qr ->> 'seller_name',
     p_qr ->> 'vat_number',
     nullif(p_qr ->> 'issued_at', '')::timestamptz,
     nullif(p_qr ->> 'total', '')::numeric,
     nullif(p_qr ->> 'vat_amount', '')::numeric,
     p_qr ->> 'raw',
     p_qr ->> 'vat_number')
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
  public.entry_type, numeric, uuid, date, uuid, uuid, text, jsonb, uuid,
  public.expense_kind, public.type_source, jsonb, text[]
) to authenticated;

-- =================================================== invoice duplicate
/**
 * Has this exact invoice been recorded before, by anybody, on any date?
 * Security definer because an employee cannot read other people's
 * entries but still has to be told. Only what the warning shows comes
 * back.
 */
create or replace function public.check_invoice_duplicate(
  p_vat_number text,
  p_issued_at  timestamptz,
  p_total      numeric
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_hit jsonb;
begin
  if p_vat_number is null or p_issued_at is null or p_total is null then
    return null;
  end if;

  select jsonb_build_object(
           'entry_id',    e.id,
           'system_id',   e.system_id,
           'bill_date',   e.bill_date,
           'entered_at',  e.entered_at,
           'amount',      e.amount,
           'person_name', u.full_name)
    into v_hit
    from public.entries e
    join public.app_users u on u.id = e.person_id
   where e.qr_vat_number = p_vat_number
     and e.qr_issued_at  = p_issued_at
     and e.qr_total      = p_total
     and not e.is_deleted
     and not e.is_cancelled
   order by e.entered_at
   limit 1;

  return v_hit;
end
$fn$;

grant execute on function public.check_invoice_duplicate(text, timestamptz, numeric) to authenticated;

-- ================================================ changing the type
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
         cancel_reason = cancel_reason
   where id = p_id and type = 'expense';

  if not found then
    raise exception 'That expense was not found.' using errcode = 'P0001';
  end if;
  return p_id;
end
$fn$;

grant execute on function public.set_expense_type(uuid, public.expense_kind, text) to authenticated;

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
                             where f not in ('type_check', 'old_entry_check', 'amount_differs'))
   where id = p_id and type = 'expense';

  if not found then
    raise exception 'That expense was not found.' using errcode = 'P0001';
  end if;
  return p_id;
end
$fn$;

grant execute on function public.clear_type_flags(uuid) to authenticated;

-- ================================================ cancelling a duplicate
create or replace function public.cancel_entry(p_id uuid, p_reason text default null)
returns uuid
language plpgsql
security invoker
set search_path = public, pg_temp
as $fn$
begin
  if not public.is_admin() then
    raise exception 'Only an Admin can cancel an entry.' using errcode = 'P0001';
  end if;

  update public.entries
     set is_cancelled  = true,
         cancel_reason = nullif(btrim(coalesce(p_reason, '')), '')
   where id = p_id and not is_cancelled;

  if not found then
    raise exception 'That entry was not found, or is already cancelled.' using errcode = 'P0001';
  end if;
  return p_id;
end
$fn$;

create or replace function public.uncancel_entry(p_id uuid)
returns uuid
language plpgsql
security invoker
set search_path = public, pg_temp
as $fn$
begin
  if not public.is_admin() then
    raise exception 'Only an Admin can do this.' using errcode = 'P0001';
  end if;

  update public.entries set is_cancelled = false where id = p_id and is_cancelled;
  if not found then
    raise exception 'That entry was not found, or is not cancelled.' using errcode = 'P0001';
  end if;
  return p_id;
end
$fn$;

grant execute on function public.cancel_entry(uuid, text) to authenticated;
grant execute on function public.uncancel_entry(uuid) to authenticated;

-- ============================================ what the scanner writes
/**
 * Called by the scan-bill Edge Function once it has looked at the photos.
 * Service role only, so nothing on a phone can claim an expense is an
 * invoice without a bill to back it up.
 */
create or replace function public.apply_bill_scan(
  p_entry_id uuid,
  p_found    boolean,
  p_source   public.type_source default null,
  p_vat      text default null,
  p_qr       jsonb default null,
  p_failed   boolean default false
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_row public.entries;
begin
  select * into v_row from public.entries where id = p_entry_id and type = 'expense';
  if not found then
    return;
  end if;

  -- An Admin has already had the last word.
  if v_row.type_source = 'changed_by_admin' then
    update public.entries set bill_scan_state = 'done' where id = p_entry_id;
    return;
  end if;

  if p_failed then
    update public.entries
       set bill_scan_state = 'failed',
           expense_type    = coalesce(expense_type, 'petty'),
           type_source     = coalesce(type_source, 'auto_none'),
           type_flags      = array(select distinct unnest(type_flags || array['type_check']))
     where id = p_entry_id;
    return;
  end if;

  update public.entries
     set bill_scan_state = 'done',
         -- The person's own choice stands; we only record that we disagree.
         expense_type = case
           when v_row.type_source = 'manual' then v_row.expense_type
           when p_found then 'invoice'::public.expense_kind
           else 'petty'::public.expense_kind
         end,
         type_source = case
           when v_row.type_source = 'manual' then v_row.type_source
           when p_found then coalesce(p_source, 'auto_vat_text')
           else 'auto_none'
         end,
         vat_number = coalesce(p_vat, vat_number),
         qr_seller_name = coalesce(p_qr ->> 'seller_name', qr_seller_name),
         qr_vat_number  = coalesce(p_qr ->> 'vat_number', qr_vat_number),
         qr_issued_at   = coalesce(nullif(p_qr ->> 'issued_at', '')::timestamptz, qr_issued_at),
         qr_total       = coalesce(nullif(p_qr ->> 'total', '')::numeric, qr_total),
         qr_vat_amount  = coalesce(nullif(p_qr ->> 'vat_amount', '')::numeric, qr_vat_amount),
         type_flags = array(
           select distinct unnest(
             array(select f from unnest(type_flags) f where f <> 'old_entry_check')
             || case
                  when v_row.type_source = 'manual'
                   and ((p_found and v_row.expense_type = 'petty')
                     or (not p_found and v_row.expense_type = 'invoice'))
                  then array['type_check']
                  else array[]::text[]
                end
           )
         )
   where id = p_entry_id;
end
$fn$;

revoke all on function public.apply_bill_scan(uuid, boolean, public.type_source, text, jsonb, boolean)
  from public, anon, authenticated;
grant execute on function public.apply_bill_scan(uuid, boolean, public.type_source, text, jsonb, boolean)
  to service_role;

-- ================================= keep the dashboard off cancelled rows
create or replace function public.dashboard_summary(
  p_from date default null,
  p_to   date default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_given    numeric := 0;
  v_expense  numeric := 0;
  v_returned numeric := 0;
  v_moved    numeric := 0;
  v_entries  bigint  := 0;
  v_cash     numeric := 0;
  v_owed     numeric := 0;
  v_holders  bigint  := 0;
  v_people   bigint  := 0;
  v_short    numeric := 0;
  v_shortp   bigint  := 0;
  v_checks   bigint  := 0;
  v_stale    bigint  := 0;
  v_petty    numeric := 0;
  v_invoice  numeric := 0;
  v_tocheck  bigint  := 0;
begin
  if not public.is_admin() then
    raise exception 'Only an Admin can see the dashboard.' using errcode = 'P0001';
  end if;

  select
    coalesce(sum(e.amount) filter (where e.type = 'money_given'), 0),
    coalesce(sum(e.amount) filter (where e.type = 'expense'), 0),
    coalesce(sum(e.amount) filter (where e.type = 'returned'), 0),
    coalesce(sum(e.amount) filter (where e.type = 'transfer'), 0),
    count(*),
    coalesce(sum(e.amount) filter (where e.type = 'expense' and e.expense_type = 'petty'), 0),
    coalesce(sum(e.amount) filter (where e.type = 'expense' and e.expense_type = 'invoice'), 0)
  into v_given, v_expense, v_returned, v_moved, v_entries, v_petty, v_invoice
  from public.entries e
  where not e.is_deleted and not e.is_cancelled
    and (p_from is null or e.bill_date >= p_from)
    and (p_to   is null or e.bill_date <= p_to);

  select
    coalesce(sum(greatest(t.balance, 0)), 0),
    coalesce(-sum(least(t.balance, 0)), 0),
    count(*) filter (where t.balance > 0)
  into v_cash, v_owed, v_holders
  from public.person_totals t
  join public.app_users u on u.id = t.person_id and u.is_active;

  select count(*) into v_people from public.app_users where is_active;

  select
    coalesce(-sum(c.difference) filter (where c.difference < 0), 0),
    count(distinct c.person_id) filter (where c.difference < 0),
    count(*)
  into v_short, v_shortp, v_checks
  from public.cash_checks c
  where not c.is_deleted
    and (p_from is null or c.checked_at::date >= p_from)
    and (p_to   is null or c.checked_at::date <= p_to);

  select count(*)
  into v_stale
  from public.app_users u
  left join public.person_check_summary s on s.person_id = u.id
  where u.is_active
    and (s.last_checked_at is null or s.last_checked_at < now() - interval '30 days');

  select count(*) into v_tocheck from public.expenses_to_check;

  return jsonb_build_object(
    'money_given',      v_given,
    'expenses',         v_expense,
    'returned',         v_returned,
    'transfers',        v_moved,
    'entry_count',      v_entries,
    'petty_total',      v_petty,
    'invoice_total',    v_invoice,
    'to_check_count',   v_tocheck,
    'cash_with_people', v_cash,
    'owed_back',        v_owed,
    'holder_count',     v_holders,
    'people_count',     v_people,
    'short_total',      v_short,
    'short_people',     v_shortp,
    'check_count',      v_checks,
    'unchecked_people', v_stale
  );
end
$fn$;

grant execute on function public.dashboard_summary(date, date) to authenticated;

create or replace function public.expenses_by_month(p_months integer default 12)
returns table (month date, label text, total numeric)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $fn$
begin
  if not public.is_admin() then
    raise exception 'Only an Admin can see the dashboard.' using errcode = 'P0001';
  end if;

  return query
  with months as (
    select (date_trunc('month', (now() at time zone 'Asia/Riyadh')::date)
            - (n || ' months')::interval)::date as m
    from generate_series(greatest(p_months, 1) - 1, 0, -1) as n
  )
  select
    months.m,
    to_char(months.m, 'Mon'),
    coalesce(sum(e.amount), 0)
  from months
  left join public.entries e
    on not e.is_deleted
   and not e.is_cancelled
   and e.type = 'expense'
   and date_trunc('month', e.bill_date)::date = months.m
  group by months.m
  order by months.m;
end
$fn$;

grant execute on function public.expenses_by_month(integer) to authenticated;

create or replace function public.expenses_by_category(
  p_from date default null,
  p_to   date default null
)
returns table (category_id uuid, name text, icon text, total numeric, entry_count bigint)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $fn$
begin
  if not public.is_admin() then
    raise exception 'Only an Admin can see the dashboard.' using errcode = 'P0001';
  end if;

  return query
  select c.id, c.name, c.icon, coalesce(sum(e.amount), 0), count(e.id)
  from public.expense_categories c
  join public.entries e
    on e.category_id = c.id
   and not e.is_deleted
   and not e.is_cancelled
   and e.type = 'expense'
   and (p_from is null or e.bill_date >= p_from)
   and (p_to   is null or e.bill_date <= p_to)
  group by c.id, c.name, c.icon
  having sum(e.amount) > 0
  order by sum(e.amount) desc;
end
$fn$;

grant execute on function public.expenses_by_category(date, date) to authenticated;

-- deleted_entries already existed; cancelled ones get their own list.
drop view if exists public.cancelled_entries cascade;
create view public.cancelled_entries
with (security_invoker = true)
as
select
  e.id, e.system_id, e.type, e.expense_type, e.amount, e.bill_date, e.note,
  e.cancel_reason, e.cancelled_at,
  e.person_id, own.full_name as person_name,
  e.entered_by, eb.full_name as entered_by_name,
  cb.full_name as cancelled_by_name,
  c.name as category_name, c.icon as category_icon
from public.entries e
left join public.people_names own on own.id = e.person_id
left join public.people_names eb  on eb.id = e.entered_by
left join public.people_names cb  on cb.id = e.cancelled_by
left join public.expense_categories c on c.id = e.category_id
where e.is_cancelled and not e.is_deleted;

grant select on public.cancelled_entries to authenticated;
