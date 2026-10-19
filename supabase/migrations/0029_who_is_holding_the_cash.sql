-- "Cash with people" is the one figure on the dashboard that is not about
-- a period at all: it is what is in people's hands right now. Tapping it
-- should answer the question it begs - whose hands - and, for each of
-- them, how the figure came to be what it is.
--
-- It counts what dashboard_summary counts: active people only, and the
-- same person_totals the rest of the app balances on. So the people who
-- are holding add up to the figure on the card, and the people the
-- company owes add up to the line underneath it.

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
    (t.money_given + t.transfers_in)::numeric,
    -- What they spent on bills.
    t.expenses::numeric,
    -- What left their hands again: given back, or passed on to their own people.
    (t.returned + t.transfers_out)::numeric,
    t.balance::numeric,
    t.entry_count
  from public.person_totals t
  join public.app_users u on u.id = t.person_id and u.is_active
  left join public.app_users h on h.id = u.head_id
  order by t.balance desc, u.full_name;
end
$fn$;

comment on function public.cash_with_people() is
  'Who is holding company cash right now, and the sums behind each figure.';

revoke all on function public.cash_with_people() from public, anon;
grant execute on function public.cash_with_people() to authenticated;
