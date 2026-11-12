-- A month, for one man, on one sheet.
--
-- The office wants to hand a man a page that answers everything at
-- once: which days he worked, which of those were Fridays and so
-- carried a bonus, what he drew in advance and on which day and why,
-- what he has been paid, and what is still owed.
--
-- The figures for all that already exist - salary_month for the
-- totals, salary_month_payments for what changed hands. What was
-- missing was the register itself: the days, one by one.

create or replace function public.attendance_sheet(p_month date default null)
returns table (
  person_id uuid,
  on_date   date,
  present   boolean,
  /** What the day was worth to him then: a day's wage, or a Friday bonus. */
  rate      numeric,
  is_friday boolean,
  note      text,
  marked_by_name text
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_month date := date_trunc('month', coalesce(p_month, current_date))::date;
  v_next  date := (v_month + interval '1 month')::date;
begin
  if not public.can_payroll() then
    raise exception 'Only an Admin or a Sub-admin can see attendance.'
      using errcode = 'P0001';
  end if;

  return query
  select
    a.person_id,
    a.on_date,
    a.present,
    a.rate,
    extract(isodow from a.on_date) = 5,
    a.note,
    mb.full_name
  from public.attendance a
  left join public.app_users mb on mb.id = a.marked_by
  where a.on_date >= v_month and a.on_date < v_next
  order by a.person_id, a.on_date;
end
$fn$;

revoke all on function public.attendance_sheet(date) from public, anon;
grant execute on function public.attendance_sheet(date) to authenticated;

-- -------------------------------------------------- and the download is logged
/*
 * Whoever looks after the wages may take a man's slip, so the log has
 * to let them write to it.
 *
 * Every download that leaves this app is recorded, and an unrecorded
 * one is worse than none at all - so the gate opens for the wages, and
 * only for the wages. The expense reports and the photo ZIPs stay an
 * Admin's business exactly as before: a kind that does not begin
 * 'pdf_salary' is still refused to anybody else.
 */
create or replace function public.log_report_download(
  p_kind        text,
  p_from        date default null,
  p_to          date default null,
  p_person_id   uuid default null,
  p_rows        integer default null,
  p_total       numeric default null,
  p_note        text default null,
  p_category_id uuid default null
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_actor uuid := auth.uid();
begin
  if not (
    public.is_admin()
    or (p_kind like 'pdf_salary%' and public.can_payroll())
  ) then
    raise exception 'Only an Admin can download reports.' using errcode = 'P0001';
  end if;

  insert into public.report_downloads
    (kind, actor_id, actor_name, from_date, to_date, person_id, person_name,
     row_count, total, note, category_name)
  values (
    p_kind,
    v_actor,
    (select full_name from public.app_users where id = v_actor),
    p_from, p_to, p_person_id,
    (select full_name from public.app_users where id = p_person_id),
    p_rows, p_total, p_note,
    (select name from public.expense_categories where id = p_category_id)
  );
end
$fn$;

grant execute on function public.log_report_download(
  text, date, date, uuid, integer, numeric, text, uuid) to authenticated;
