-- =====================================================================
--  Migration 0011 - Cast the enum literals in create_entry
-- ---------------------------------------------------------------------
--  The CASE arms spelled their values as plain text, which Postgres
--  would not put into an enum column. Same logic, now with the type
--  written out.
-- =====================================================================

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
     case when p_type = 'expense' then coalesce(p_expense_type, 'petty'::public.expense_kind) end,
     case when p_type = 'expense' then coalesce(p_type_source, 'auto_none'::public.type_source) end,
     v_flags,
     case
       when p_type <> 'expense' then 'not_needed'::public.bill_scan_state
       -- A QR settles it; anything else still wants a look at the text.
       when p_type_source = 'auto_qr' then 'done'::public.bill_scan_state
       else 'pending'::public.bill_scan_state
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
