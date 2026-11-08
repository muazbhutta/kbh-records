-- A different day is a different expense.
--
-- Mazin records SAR 200, "Expense Mazin and Saram", every few days -
-- the 28th, the 1st, the 4th, the 5th, the 6th, the 7th - and attaches
-- the same photograph to each, because it is the same standing
-- arrangement and there is no new piece of paper to take. The check
-- saw one file against two entries and called every one of them a
-- duplicate. Ten of the sixteen sitting in that list this morning are
-- that one honest habit.
--
-- The office's rule, and it is the right one: a duplicate is a bill
-- entered twice for the same day. Change the day and it is another
-- day's money, however alike the paper looks and whoever took it.
--
-- So the day has to agree, for both signals:
--   the same file  -> only when the day agrees
--   the same look  -> only when the day and the money both agree
--
-- With no day given there is nothing to agree about, so nothing is
-- raised. A warning that cannot be trusted is worse than none: it
-- teaches the office to wave the list through, and then the real one
-- goes through with it.

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
  -- The very same file, on the very same day.
  if p_bill_date is not null and coalesce(array_length(p_sha, 1), 0) > 0 then
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
       and e.bill_date = p_bill_date
     order by e.entered_at
     limit 1;

    if v_photo is not null then
      v_kind := 'exact';
    end if;
  end if;

  -- The same bill photographed again: the day and the money must both
  -- agree. Two bills on one letterhead are two bills.
  if v_photo is null
     and p_bill_date is not null
     and p_amount is not null
     and coalesce(array_length(p_phash, 1), 0) > 0 then
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
       and e.bill_date = p_bill_date
       and e.amount = p_amount
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

  -- And the quieter hint: same person, same money, same day. This one
  -- already asked for the day to agree, and still does.
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
