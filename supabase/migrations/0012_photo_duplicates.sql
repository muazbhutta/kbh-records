-- =====================================================================
--  Migration 0012 - Catching the same bill photographed twice
-- ---------------------------------------------------------------------
--  Every bill photo now carries two fingerprints:
--    sha256  the exact file. Catches the very same picture re-uploaded.
--    phash   what the picture LOOKS like. Catches the same bill
--            photographed again, cropped, or resized.
--
--  Being honest about the limit: this finds the same BILL. A freshly
--  written fake bill is a different picture, and nothing here can tell
--  that it is made up.
-- =====================================================================

alter table public.entry_photos
  add column if not exists phash text;

comment on column public.entry_photos.phash is
  '16 hex characters. Two photos of the same bill differ in only a few bits.';

create index if not exists entry_photos_phash_idx
  on public.entry_photos (phash) where phash is not null;

alter table public.entries
  add column if not exists duplicate_of uuid references public.entries (id) on delete set null;

comment on column public.entries.duplicate_of is
  'The earlier expense this one appears to repeat.';

create index if not exists entries_duplicate_of_idx
  on public.entries (duplicate_of) where duplicate_of is not null;

/** How many of the 64 answers differ between two fingerprints. */
create or replace function public.phash_distance(a text, b text)
returns integer
language sql
immutable
as $fn$
  select case
    when a is null or b is null or length(a) <> 16 or length(b) <> 16 then 64
    else length(replace((('x' || a)::bit(64) # ('x' || b)::bit(64))::text, '0', ''))
  end;
$fn$;

/**
 * Before saving: has this bill been seen before?
 *
 * Security definer on purpose. An employee cannot read other people's
 * entries, but still has to be told "this bill was already used on
 * 14 Oct by Rana - SAR 120". Only those few facts come back.
 */
create or replace function public.check_photo_duplicate(
  p_sha        text[] default '{}',
  p_phash      text[] default '{}',
  p_person_id  uuid default null,
  p_amount     numeric default null,
  p_bill_date  date default null,
  p_distance   integer default 6
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_photo jsonb;
  v_kind  text;
  v_same  jsonb;
begin
  -- The very same file first: that is the certain one.
  if coalesce(array_length(p_sha, 1), 0) > 0 then
    select jsonb_build_object(
             'entry_id',    e.id,
             'system_id',   e.system_id,
             'bill_date',   e.bill_date,
             'entered_at',  e.entered_at,
             'amount',      e.amount,
             'person_name', u.full_name)
      into v_photo
      from public.entry_photos p
      join public.entries e on e.id = p.entry_id
                           and not e.is_deleted and not e.is_cancelled
      join public.app_users u on u.id = e.person_id
     where p.sha256 = any (p_sha)
     order by e.entered_at
     limit 1;

    if v_photo is not null then
      v_kind := 'exact';
    end if;
  end if;

  -- Then the same bill photographed again.
  if v_photo is null and coalesce(array_length(p_phash, 1), 0) > 0 then
    select jsonb_build_object(
             'entry_id',    e.id,
             'system_id',   e.system_id,
             'bill_date',   e.bill_date,
             'entered_at',  e.entered_at,
             'amount',      e.amount,
             'person_name', u.full_name)
      into v_photo
      from public.entry_photos p
      join public.entries e on e.id = p.entry_id
                           and not e.is_deleted and not e.is_cancelled
      join public.app_users u on u.id = e.person_id
     where p.phash is not null
       and exists (
         select 1 from unnest(p_phash) h
         where public.phash_distance(p.phash, h) <= greatest(p_distance, 0)
       )
     order by e.entered_at
     limit 1;

    if v_photo is not null then
      v_kind := 'similar';
    end if;
  end if;

  -- And the quieter hint: same person, same money, same day.
  if p_person_id is not null and p_amount is not null and p_bill_date is not null then
    select jsonb_build_object(
             'entry_id',      e.id,
             'system_id',     e.system_id,
             'bill_date',     e.bill_date,
             'amount',        e.amount,
             'category_name', c.name)
      into v_same
      from public.entries e
      left join public.expense_categories c on c.id = e.category_id
     where not e.is_deleted and not e.is_cancelled
       and e.type = 'expense'
       and e.person_id = p_person_id
       and e.amount = p_amount
       and e.bill_date = p_bill_date
     order by e.entered_at
     limit 1;
  end if;

  return jsonb_build_object('same_photo', v_photo, 'photo_match', v_kind, 'same_amount', v_same);
end
$fn$;

grant execute on function public.check_photo_duplicate(text[], text[], uuid, numeric, date, integer)
  to authenticated;

-- ============================================ saving with the flag
-- create_entry now also takes the perceptual hashes and remembers which
-- earlier expense this one is suspected of repeating.
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
  p_flags           text[] default '{}',
  p_duplicate_of    uuid default null
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

  if p_qr is not null and (p_qr ->> 'total') is not null
     and (p_qr ->> 'total')::numeric <> p_amount then
    v_flags := array(select distinct unnest(v_flags || array['amount_differs']));
  end if;

  if p_duplicate_of is not null then
    v_flags := array(select distinct unnest(v_flags || array['suspected_duplicate']));
  end if;

  insert into public.entries
    (type, amount, person_id, counterparty_id, category_id, note,
     bill_date, entered_by, client_id,
     expense_type, type_source, type_flags, bill_scan_state,
     qr_seller_name, qr_vat_number, qr_issued_at, qr_total, qr_vat_amount, qr_raw,
     vat_number, duplicate_of)
  values
    (p_type, p_amount, p_person_id, p_counterparty_id, p_category_id,
     nullif(btrim(coalesce(p_note, '')), ''),
     p_bill_date, auth.uid(), p_client_id,
     case when p_type = 'expense' then coalesce(p_expense_type, 'petty'::public.expense_kind) end,
     case when p_type = 'expense' then coalesce(p_type_source, 'auto_none'::public.type_source) end,
     v_flags,
     case
       when p_type <> 'expense' then 'not_needed'::public.bill_scan_state
       when p_type_source = 'auto_qr' then 'done'::public.bill_scan_state
       else 'pending'::public.bill_scan_state
     end,
     p_qr ->> 'seller_name',
     p_qr ->> 'vat_number',
     nullif(p_qr ->> 'issued_at', '')::timestamptz,
     nullif(p_qr ->> 'total', '')::numeric,
     nullif(p_qr ->> 'vat_amount', '')::numeric,
     p_qr ->> 'raw',
     p_qr ->> 'vat_number',
     p_duplicate_of)
  returning id into v_id;

  for v_photo in select * from jsonb_array_elements(coalesce(p_photos, '[]'::jsonb))
  loop
    insert into public.entry_photos
      (entry_id, storage_path, thumb_path, sha256, phash, width, height, bytes, position)
    values (
      v_id,
      v_photo ->> 'storage_path',
      v_photo ->> 'thumb_path',
      v_photo ->> 'sha256',
      nullif(v_photo ->> 'phash', ''),
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
  public.expense_kind, public.type_source, jsonb, text[], uuid
) to authenticated;

-- ========================================== the Admin's duplicate list
drop view if exists public.suspected_duplicates cascade;
create view public.suspected_duplicates
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
  e.person_id,
  p.full_name  as person_name,
  eb.full_name as entered_by_name,
  c.name       as category_name,
  (select ph.thumb_path from public.entry_photos ph
     where ph.entry_id = e.id order by ph.position limit 1) as thumb_path,

  o.id         as other_id,
  o.system_id  as other_system_id,
  o.amount     as other_amount,
  o.bill_date  as other_bill_date,
  o.entered_at as other_entered_at,
  o.note       as other_note,
  op.full_name as other_person_name,
  oc.name      as other_category_name,
  (select ph.thumb_path from public.entry_photos ph
     where ph.entry_id = o.id order by ph.position limit 1) as other_thumb_path
from public.entries e
left join public.entries o on o.id = e.duplicate_of
left join public.people_names p  on p.id = e.person_id
left join public.people_names eb on eb.id = e.entered_by
left join public.people_names op on op.id = o.person_id
left join public.expense_categories c  on c.id = e.category_id
left join public.expense_categories oc on oc.id = o.category_id
where e.type = 'expense'
  and not e.is_deleted
  and not e.is_cancelled
  and e.type_flags && array['suspected_duplicate'];

grant select on public.suspected_duplicates to authenticated;

/**
 * An Admin's answer on a suspected duplicate.
 *   cancel        -> the expense is thrown out. Not deleted: it leaves
 *                    the balances and reports, and the person's cash
 *                    goes back up by that amount.
 *   not_duplicate -> the flag comes off and the expense stands.
 */
create or replace function public.resolve_duplicate(
  p_id     uuid,
  p_action text,
  p_reason text default null
)
returns uuid
language plpgsql
security invoker
set search_path = public, pg_temp
as $fn$
begin
  if not public.is_admin() then
    raise exception 'Only an Admin can settle a duplicate.' using errcode = 'P0001';
  end if;

  if p_action = 'cancel' then
    update public.entries
       set is_cancelled  = true,
           cancel_reason = coalesce(nullif(btrim(coalesce(p_reason, '')), ''),
                                    'Duplicate bill')
     where id = p_id and type = 'expense' and not is_cancelled;

  elsif p_action = 'not_duplicate' then
    update public.entries
       set type_flags   = array(select f from unnest(type_flags) f
                                 where f <> 'suspected_duplicate'),
           duplicate_of = null,
           duplicate_photo = false
     where id = p_id and type = 'expense';

  else
    raise exception 'Unknown action.' using errcode = 'P0001';
  end if;

  if not found then
    raise exception 'That expense was not found.' using errcode = 'P0001';
  end if;
  return p_id;
end
$fn$;

grant execute on function public.resolve_duplicate(uuid, text, text) to authenticated;
