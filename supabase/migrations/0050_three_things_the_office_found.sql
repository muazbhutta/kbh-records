-- Three things the office found in use.

-- ------------------------------------------------- 1. a site is the office's
-- A head was counted among the people who know the sites, so he saw
-- every project and could start one. In this company a head is an
-- employee with men under him, not a man in the office, and three of
-- the four employees carry the mark - which is why everybody was
-- seeing everything.
--
-- The rule is now the one the office asked for: naming a site, and
-- seeing the whole list, belongs to the office. Everybody else, head
-- or not, works with the sites they have been put on.

create or replace function public.can_file_projects()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $fn$
  select public.is_admin();
$fn$;

comment on function public.can_file_projects() is
  'Naming a site is the office''s job. Everybody else picks from the sites they are on.';

-- ------------------------------------------- 2. a look-alike is not a copy
-- The photo check called two bills the same when they merely looked the
-- same. A perceptual hash is built to ignore exactly the small print
-- that tells two bills apart, so every transfer screenshot from one
-- banking app, and every bill on one letterhead, matched every other.
--
-- The same FILE is still a duplicate outright - that is certain. A
-- picture that only looks alike now has to agree about the money too,
-- and where there is no amount to agree about, it is not raised at all.

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

  -- Then the same bill photographed again - but only where the money
  -- agrees. Two bills on one letterhead are two bills.
  if v_photo is null
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

-- ------------------------------------ 3. the duplicate screen needs the real photo
-- It had only the small version to show, so tapping a bill there filled
-- the screen with a 320-pixel thumbnail. Comparing two bills is the one
-- job that screen has.

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
  (select ph.storage_path from public.entry_photos ph
     where ph.entry_id = e.id order by ph.position limit 1) as storage_path,

  o.id         as other_id,
  o.system_id  as other_system_id,
  o.amount     as other_amount,
  o.bill_date  as other_bill_date,
  o.entered_at as other_entered_at,
  o.note       as other_note,
  op.full_name as other_person_name,
  oc.name      as other_category_name,
  (select ph.thumb_path from public.entry_photos ph
     where ph.entry_id = o.id order by ph.position limit 1) as other_thumb_path,
  (select ph.storage_path from public.entry_photos ph
     where ph.entry_id = o.id order by ph.position limit 1) as other_storage_path
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
