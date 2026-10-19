-- Put the project in the right column.
--
-- 0032 added project_id to the end of the insert's column list but put
-- v_project in the middle of its value list, one place too early. So
-- bill_scan_state was handed a uuid and the database said so:
--
--   column "bill_scan_state" is of type bill_scan_state
--   but expression is of type uuid
--
-- Nothing could be recorded at all - not an expense, not money given -
-- because every kind of entry goes through this one function.
--
-- It was not caught because 0032 was never exercised by actually saving
-- an entry: the project work was tested through set_entry_project, which
-- is a separate update and touches none of this.

drop function if exists public.create_entry(
  public.entry_type, numeric, uuid, date, uuid, uuid, text, jsonb, uuid,
  public.expense_kind, public.type_source, jsonb, text[], uuid,
  public.pay_method, uuid
);

create function public.create_entry(
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
  p_duplicate_of    uuid default null,
  p_pay_method      public.pay_method default null,
  p_project_id      uuid default null
)
returns uuid
language plpgsql
security invoker
set search_path = public, pg_temp
as $fn$
declare
  v_id     uuid;
  v_photo  jsonb;
  v_i      smallint := 0;
  v_flags  text[] := coalesce(p_flags, '{}');
  v_method public.pay_method;
  v_project uuid := null;
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

  -- A project is what money was spent on, and only the people who know
  -- the sites may say which one. An employee records what he spent; the
  -- filing is done after him, by somebody who knows.
  if p_project_id is not null then
    if p_type <> 'expense' then
      raise exception 'Only an expense belongs to a project.' using errcode = 'P0001';
    end if;
    if not public.can_file_projects() then
      raise exception 'Only an Admin, a Sub-admin or a head can file an expense against a project.'
        using errcode = 'P0001';
    end if;
    if not exists (select 1 from public.projects where id = p_project_id and is_active) then
      raise exception 'That project is closed, or not there.' using errcode = 'P0001';
    end if;
    v_project := p_project_id;
  end if;

  -- Cash unless told otherwise, which is how the company worked before
  -- the bank option existed; an expense never has a method.
  v_method := case when p_type = 'expense' then null
                   else coalesce(p_pay_method, 'cash'::public.pay_method) end;

  if p_qr is not null and (p_qr ->> 'total') is not null
     and (p_qr ->> 'total')::numeric <> p_amount then
    v_flags := array(select distinct unnest(v_flags || array['amount_differs']));
  end if;

  if p_duplicate_of is not null then
    v_flags := array(select distinct unnest(v_flags || array['suspected_duplicate']));
  end if;

  insert into public.entries
    (type, amount, person_id, counterparty_id, category_id, note,
     bill_date, entered_by, client_id, pay_method,
     expense_type, type_source, type_flags, bill_scan_state, project_id,
     qr_seller_name, qr_vat_number, qr_issued_at, qr_total, qr_vat_amount, qr_raw,
     vat_number, duplicate_of)
  values
    (p_type, p_amount, p_person_id, p_counterparty_id, p_category_id,
     nullif(btrim(coalesce(p_note, '')), ''),
     p_bill_date, auth.uid(), p_client_id, v_method,
     case when p_type = 'expense' then coalesce(p_expense_type, 'petty'::public.expense_kind) end,
     case when p_type = 'expense' then coalesce(p_type_source, 'auto_none'::public.type_source) end,
     v_flags,
     case
       when p_type <> 'expense' then 'not_needed'::public.bill_scan_state
       when p_type_source = 'auto_qr' then 'done'::public.bill_scan_state
       else 'pending'::public.bill_scan_state
     end,
     v_project,
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

revoke all on function public.create_entry(
  public.entry_type, numeric, uuid, date, uuid, uuid, text, jsonb, uuid,
  public.expense_kind, public.type_source, jsonb, text[], uuid,
  public.pay_method, uuid
) from public, anon;

grant execute on function public.create_entry(
  public.entry_type, numeric, uuid, date, uuid, uuid, text, jsonb, uuid,
  public.expense_kind, public.type_source, jsonb, text[], uuid,
  public.pay_method, uuid
) to authenticated;
