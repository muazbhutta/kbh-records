-- An edit needs a reason, and a man may put his own entry right.
--
-- Until now only the office could change an entry, so a man who typed
-- 46 instead of 460 had to ring somebody. Now he can fix it himself -
-- his own entry, never anybody else's, and never into somebody else's
-- khata - and he has to say why. The office is told either way: the
-- trigger next door raises a ticket on every edit, whoever makes it.
--
-- The reason is left in a setting that lives for the length of the
-- transaction, which is where that trigger reads it from.
--
-- This function becomes the only door. It was security invoker, leaning
-- on the table's own rules to decide who may edit; it now decides for
-- itself, because the rules it needs - this person, this entry, these
-- fields and no others - are finer than a table policy can express.

drop function if exists public.update_entry(uuid, numeric, date, uuid, uuid, uuid, text, boolean);

create function public.update_entry(
  p_id              uuid,
  p_reason          text,
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
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_row    public.entries;
  v_reason text := btrim(coalesce(p_reason, ''));
  v_admin  boolean := public.is_admin();
begin
  select * into v_row from public.entries where id = p_id;
  if not found then
    raise exception 'That entry was not found.' using errcode = 'P0001';
  end if;

  if not public.is_active_user() then
    raise exception 'Your account is turned off.' using errcode = 'P0001';
  end if;

  -- The office may correct anybody. Everybody else may correct himself.
  if not v_admin and v_row.person_id <> auth.uid() then
    raise exception 'You can only correct your own entries.' using errcode = 'P0001';
  end if;

  if v_row.is_deleted then
    raise exception 'That entry has been deleted. Put it back first.' using errcode = 'P0001';
  end if;
  if v_row.is_cancelled then
    raise exception 'That entry was thrown out as a duplicate.' using errcode = 'P0001';
  end if;

  -- Say why. Everyone, every time: it is the whole point of the ticket
  -- the office is about to receive.
  if length(v_reason) < 3 then
    raise exception 'Say why you are changing this entry.' using errcode = 'P0001';
  end if;
  if length(v_reason) > 300 then
    raise exception 'Keep the reason under 300 letters.' using errcode = 'P0001';
  end if;

  -- An entry never moves into somebody else's khata by his own hand.
  -- That was closed in 0015 for new entries; it stays closed here.
  if not v_admin and p_person_id is not null and p_person_id <> v_row.person_id then
    raise exception 'An entry cannot be moved to another person''s khata.'
      using errcode = 'P0001';
  end if;

  if p_amount is not null then
    if p_amount <= 0 then
      raise exception 'Enter an amount bigger than zero.' using errcode = 'P0001';
    end if;
    if round(p_amount, 2) <> p_amount then
      raise exception 'An amount can have at most 2 decimals.' using errcode = 'P0001';
    end if;
  end if;

  -- Where the trigger will look for it.
  perform set_config('kbh.edit_reason', v_reason, true);

  update public.entries
     set amount          = coalesce(p_amount, amount),
         bill_date       = coalesce(p_bill_date, bill_date),
         person_id       = case when v_admin
                                then coalesce(p_person_id, person_id)
                                else person_id end,
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

revoke all on function public.update_entry(
  uuid, text, numeric, date, uuid, uuid, uuid, text, boolean
) from public, anon;
grant execute on function public.update_entry(
  uuid, text, numeric, date, uuid, uuid, uuid, text, boolean
) to authenticated;
