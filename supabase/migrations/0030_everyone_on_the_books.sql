-- cash_with_people started from person_totals, which only has a row for
-- somebody who has an entry against their name. So a person just put on
-- the books, who has been handed nothing yet, was missing from the list
-- altogether: the card on the home screen said "3 of 6 holding" and the
-- screen behind it said "3 of 5". The count a person taps and the count
-- they land on have to be the same count.
--
-- Starting from app_users instead puts everyone active in the list, with
-- nothing against their name until there is something.

create or replace function public.cash_with_people()
returns table (
  person_id   uuid,
  full_name   text,
  job_title   text,
  head_name   text,
  got         numeric,
  spent       numeric,
  gave_back   numeric,
  balance     numeric,
  entry_count bigint
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $fn$
begin
  if not public.is_admin() then
    raise exception 'Only an Admin can see who is holding the cash.'
      using errcode = 'P0001';
  end if;

  return query
  select
    u.id,
    u.full_name,
    u.job_title,
    h.full_name,
    -- What reached them: handed out by the company, or passed down by a head.
    coalesce(t.money_given + t.transfers_in, 0)::numeric,
    -- What they spent on bills.
    coalesce(t.expenses, 0)::numeric,
    -- What left their hands again: given back, or passed on to their own people.
    coalesce(t.returned + t.transfers_out, 0)::numeric,
    coalesce(t.balance, 0)::numeric,
    coalesce(t.entry_count, 0)::bigint
  from public.app_users u
  left join public.person_totals t on t.person_id = u.id
  left join public.app_users h on h.id = u.head_id
  where u.is_active
  order by coalesce(t.balance, 0) desc, u.full_name;
end
$fn$;
