-- The register says he was away, rather than saying nothing.
--
-- Umer went home on the 14th of September. His sheet for that month
-- shows thirteen days marked and then seventeen reading "Likha nahi" -
-- nobody said. Which is untrue twice over: somebody did say, on the
-- day he left, and what it looks like to the man holding the page is
-- an office that stopped keeping his register halfway through the
-- month.
--
-- The books know the answer. What they had no way to tell the sheet
-- was which days those were: salary_month gives the day he went only
-- while he is still away, so a month he has since come back from
-- arrives with no dates at all.
--
-- This hands back the stretches themselves, clipped to the month
-- asked for, so a sheet can say "Chhutti par" against the days he was
-- at home and keep "Likha nahi" for the ones somebody really did
-- forget.

create or replace function public.salary_leave_month(p_month date default null)
returns table (
  person_id uuid,
  /** Clipped to the month asked for, so a sheet can use them as they come. */
  went_on   date,
  /** Null while he is still away, which means to the end of the month. */
  came_back date,
  note      text
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_month date := date_trunc('month', coalesce(p_month, current_date))::date;
  v_last  date := (v_month + interval '1 month' - interval '1 day')::date;
begin
  if not public.can_payroll() then
    raise exception 'Only an Admin or a Sub-admin can see who was away.'
      using errcode = 'P0001';
  end if;

  return query
  select l.person_id,
         greatest(l.went_on, v_month),
         case
           when l.came_back is null then null
           else least(l.came_back, v_last)
         end,
         l.note
    from public.salary_leave l
   where l.went_on <= v_last
     and (l.came_back is null or l.came_back >= v_month)
   order by l.person_id, l.went_on;
end
$fn$;

revoke all on function public.salary_leave_month(date) from public, anon;
grant execute on function public.salary_leave_month(date) to authenticated;
