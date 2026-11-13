-- The register beats the flag, and a Friday is worth what the office says.
--
-- Umer was marked present on eleven days in September and paid his
-- 1,100 for it. He was also, later, marked off salary from the 1st of
-- September - and that one mark quietly took the whole month's wage
-- away, turning a month he had worked into 1,500 of debt. Marking him
-- back did not bring it back, because the months behind him had
-- already been emptied.
--
-- A leave record is somebody's statement about a stretch of time. A
-- day marked present is somebody's statement about one day, made on
-- the day. When the two disagree the day wins: a month with anybody's
-- hand on its register is a month he was here for, whatever a later
-- flag says about the period around it.
--
-- And the Friday bonus comes back, but not as a rate. The office sets
-- what a particular Friday was worth, on that Friday, and can change
-- it afterwards. Nothing is set per man and nothing is assumed.

/**
 * What one marked day was worth.
 *
 * For a daily man that is his wage for the day and is set when he is
 * marked. For a monthly man it is nought unless the office says
 * otherwise, which is what this is for: a worked Friday, priced by
 * hand on the day, and changeable afterwards.
 */
create or replace function public.set_day_worth(
  p_person_id uuid,
  p_on_date   date,
  p_amount    numeric
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_amount numeric := coalesce(p_amount, 0);
begin
  if not public.can_payroll() then
    raise exception 'Only an Admin or a Sub-admin can price a day.'
      using errcode = 'P0001';
  end if;
  if v_amount < 0 then
    raise exception 'A day cannot be worth less than nothing.' using errcode = 'P0001';
  end if;
  if round(v_amount, 2) <> v_amount then
    raise exception 'An amount can have at most 2 decimals.' using errcode = 'P0001';
  end if;

  update public.attendance
     set rate = v_amount
   where person_id = p_person_id
     and on_date = p_on_date
     and present;

  if not found then
    raise exception 'He is not marked present on that day, so there is nothing to price.'
      using errcode = 'P0001';
  end if;
end
$fn$;

revoke all on function public.set_day_worth(uuid, date, numeric) from public, anon;
grant execute on function public.set_day_worth(uuid, date, numeric) to authenticated;

-- ------------------------------- the month, where a marked day outranks a flag
drop function if exists public.salary_month(date);

create function public.salary_month(p_month date default null)
returns table (
  person_id      uuid,
  full_name      text,
  job_title      text,
  pay_kind       text,
  monthly_amount numeric,
  daily_rate     numeric,
  /** What one worked Friday is worth to a monthly man. */
  friday_bonus   numeric,
  days_present   bigint,
  days_marked    bigint,
  /** Fridays he came in. Monthly staff only. */
  bonus_days     bigint,
  /** What those Fridays were priced at, one by one, on the day. */
  bonus_total    numeric,
  /** His month: the wage, plus bonuses - or the days, for a daily man. */
  earned         numeric,
  advance_paid   numeric,
  salary_paid    numeric,
  remaining      numeric,
  payments       bigint,
  on_payroll     boolean,
  /** Which of his own months this is: his first is 1. */
  slip_no        integer,
  /**
   * What he carried into this month from every month before it.
   *
   * Plus means the company still owed him; minus means he had drawn
   * more than he earned and owes it back.
   */
  carried_in     numeric,
  /** What the company laid out for his kafalat this month. */
  kafalat_paid   numeric,
  /** True if any day of this month was spent away. */
  on_leave       boolean,
  /** The day he went, when he is away now. */
  on_leave_since date,
  /** Money he already owed, written down by hand against this month. */
  owing_added    numeric
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
    raise exception 'Only an Admin or a Sub-admin can see the salaries.'
      using errcode = 'P0001';
  end if;

  return query
  with paid as (
    select s.person_id,
           coalesce(sum(s.amount) filter (where s.kind = 'advance'), 0) as adv,
           coalesce(sum(s.amount) filter (where s.kind = 'salary'), 0)  as sal,
           coalesce(sum(s.amount) filter (where s.kind = 'kafalat'), 0) as kaf,
           coalesce(sum(s.amount) filter (where s.kind = 'owing'), 0)   as owe,
           count(*) as n
    from public.salary_payments s
    where s.for_month = v_month and not s.is_deleted
    group by s.person_id
  ),
  /*
   * The same question, asked of every month at once, so the ledger
   * that carries a balance forward counts the same months as the
   * month on the screen. Without it the two part company the first
   * time anybody is sent home.
   */
  away_months as (
    select l.person_id, date_trunc('month', d)::date as mon
      from public.salary_leave l
      cross join lateral generate_series(
        date_trunc('month', l.went_on),
        date_trunc('month', coalesce(l.came_back, current_date + interval '1 year')),
        interval '1 month') as d
     where l.went_on <= date_trunc('month', d)::date
       and (l.came_back is null
            or l.came_back >= (date_trunc('month', d) + interval '1 month' - interval '1 day')::date)
  ),
  worked as (
    -- Each day at what it was worth then, never at today's figure.
    select a.person_id,
           count(*) filter (where a.present) as days_in,
           count(*) as days_said,
           coalesce(sum(a.rate) filter (where a.present), 0) as worth,
           count(*) filter (where a.present
                              and extract(isodow from a.on_date) = 5) as fridays
    from public.attendance a
    where a.on_date >= v_month and a.on_date < v_next
    group by a.person_id
  ),
  /*
   * Every month a man has anything in, and what it came to.
   *
   * A month counts if somebody marked him or something changed hands.
   * Months where neither happened are not months of his - counting a
   * standing wage for them would invent earnings out of an empty
   * register.
   */
  his_months as (
    select a.person_id, date_trunc('month', a.on_date)::date as mon
      from public.attendance a
    union
    select s.person_id, s.for_month
      from public.salary_payments s where not s.is_deleted
  ),
  by_month as (
    select hm.person_id,
           hm.mon,
           /*
            * A month he was away for, and nobody marked him in: nought.
            * A month somebody did mark him in is his, whatever a leave
            * record drawn around it says afterwards.
            */
           (case when am.person_id is not null and w.person_id is null then 0
                 when pr.pay_kind = 'daily'
                 then coalesce(w.worth, 0)
                 else coalesce(pr.monthly_amount, 0) + coalesce(w.worth, 0) end)
             - coalesce(t.taken, 0) as net
      from his_months hm
      /*
       * The same join the month's own figure uses, is_active and all.
       *
       * Without it the two disagreed the moment a man came off the
       * payroll: the month showed him earning nothing while the ledger
       * went on crediting him his old wage, so what one month left was
       * not what the next carried in, and his sheet argued with itself
       * by exactly one month's pay.
       *
       * Both now read it the same way - off the payroll, no wage. That
       * rewrites his past rather than remembering it, which is the
       * same hole as the raise: payroll keeps who is on it now and not
       * who was on it when. Both are closed by a record of what a man
       * was on and from when.
       */
      left join public.payroll pr
        on pr.person_id = hm.person_id and pr.is_active
      left join (
        select a.person_id, date_trunc('month', a.on_date)::date mon,
               coalesce(sum(a.rate) filter (where a.present), 0) worth
          from public.attendance a group by 1, 2
      ) w on w.person_id = hm.person_id and w.mon = hm.mon
      left join (
        select s.person_id, s.for_month mon, sum(s.amount) taken
          from public.salary_payments s where not s.is_deleted group by 1, 2
      ) t on t.person_id = hm.person_id and t.mon = hm.mon
      -- A month he spent wholly at home earns him nothing here either.
      left join away_months am
        on am.person_id = hm.person_id and am.mon = hm.mon
  ),
  /*
   * What he brings into this month: everything earned before it, less
   * everything taken before it. If he drew more than he earned last
   * month this comes in as a minus and is settled out of this month's
   * wage; if the company fell short, it comes in as a plus and is
   * paid on top.
   */
  carried as (
    select b.person_id, sum(b.net) as amount
      from by_month b
     where b.mon < v_month
     group by b.person_id
  ),
  /*
   * The month each man's wages begin, from whichever of the three
   * knows first: when his payroll row was made, the first day anybody
   * marked him, and the first month he was handed anything.
   *
   * Not payroll.since, which is the obvious choice and is wrong: since
   * moves when a man is given a raise, and would put him back to slip
   * #1 the month his pay went up. added_at does not move - set_payroll
   * leaves it alone on an edit.
   */
  began as (
    select sp.id as person_id,
           least(
             (select date_trunc('month', pr.added_at)::date
                from public.payroll pr where pr.person_id = sp.id),
             (select date_trunc('month', min(a.on_date))::date
                from public.attendance a where a.person_id = sp.id),
             (select min(s.for_month) from public.salary_payments s
               where s.person_id = sp.id and not s.is_deleted)
           ) as first_month
      from public.salary_people sp
  ),
  /*
   * Whether this month was one he spent away, and since when.
   *
   * Any overlap at all counts: a man who went home on the 20th was
   * away in that month as much as in the next, and his sheet should
   * say so rather than leave the empty second half unexplained.
   */
  away as (
    select l.person_id,
           bool_or(l.went_on < v_next
                   and (l.came_back is null or l.came_back >= v_month)) as any_day,
           /*
            * Away for every day of it, which is the month that earns
            * nothing. A man who went home on the 20th worked the first
            * nineteen and is owed for them.
            */
           bool_or(l.went_on <= v_month
                   and (l.came_back is null or l.came_back >= v_next - 1)) as all_month,
           max(l.went_on) filter (where l.came_back is null) as since
      from public.salary_leave l
     group by l.person_id
  )
  select
    sp.id,
    coalesce(u.full_name, sp.full_name),
    coalesce(u.job_title, sp.job_title),
    coalesce(p.pay_kind::text, 'monthly'),
    coalesce(p.monthly_amount, 0)::numeric,
    coalesce(p.daily_rate, 0)::numeric,
    coalesce(p.friday_bonus, 0)::numeric,
    coalesce(worked.days_in, 0)::bigint,
    coalesce(worked.days_said, 0)::bigint,
    (case when p.pay_kind = 'daily' then 0 else coalesce(worked.fridays, 0) end)::bigint,
    (case when p.pay_kind = 'daily' then 0 else coalesce(worked.worth, 0) end)::numeric,
    /*
     * What the month is worth to him - and nought for a month that is
     * not one of his.
     *
     * A standing monthly wage used to be counted for every month there
     * has ever been, so a man showed as having earned 2,700 in a month
     * nobody marked him in and nothing was handed over. The carry
     * below counts the same months, so the two cannot disagree.
     */
    (case when coalesce(away.all_month, false) and worked.person_id is null then 0
          when worked.person_id is null and paid.person_id is null then 0
          when p.pay_kind = 'daily' then coalesce(worked.worth, 0)
          else coalesce(p.monthly_amount, 0) + coalesce(worked.worth, 0) end)::numeric,
    coalesce(paid.adv, 0)::numeric,
    coalesce(paid.sal, 0)::numeric,
    /*
     * What is owed right now: this month's earnings, less what he has
     * taken for it, plus whatever he carried in.
     *
     * No longer floored at nought. A man who drew 3,050 against a
     * month worth 2,850 is 200 to the good and the books have to say
     * so, or the 200 is quietly forgiven and the next month starts
     * from a lie.
     */
    (coalesce(carried.amount, 0)
     + (case when coalesce(away.all_month, false) and worked.person_id is null then 0
             when worked.person_id is null and paid.person_id is null then 0
             when p.pay_kind = 'daily' then coalesce(worked.worth, 0)
             else coalesce(p.monthly_amount, 0) + coalesce(worked.worth, 0) end)
     - coalesce(paid.adv, 0) - coalesce(paid.sal, 0)
     - coalesce(paid.kaf, 0) - coalesce(paid.owe, 0))::numeric,
    coalesce(paid.n, 0)::bigint,
    (p.person_id is not null and p.is_active),
    -- Months are counted, not days, so a slip number cannot change
    -- halfway through a month. A man with no history at all is on his
    -- first: least() over three nulls is null, and greatest ignores it.
    greatest(
      1,
      (extract(year  from v_month)::int - extract(year  from began.first_month)::int) * 12
    + (extract(month from v_month)::int - extract(month from began.first_month)::int)
    + 1
    )::integer,
    coalesce(carried.amount, 0)::numeric,
    coalesce(paid.kaf, 0)::numeric,
    coalesce(away.any_day, false),
    away.since,
    coalesce(paid.owe, 0)::numeric
  from public.salary_people sp
  left join public.app_users u on u.id = sp.user_id
  left join public.payroll p   on p.person_id = sp.id and p.is_active
  left join paid   on paid.person_id = sp.id
  left join worked on worked.person_id = sp.id
  left join began  on began.person_id  = sp.id
  left join carried on carried.person_id = sp.id
  left join away    on away.person_id    = sp.id
  /*
   * Whose month this is.
   *
   * Somebody marked him, or something changed hands, or he walked into
   * the month owing or owed. A man on the payroll who did none of the
   * three has nothing in this month to show or to settle, and listing
   * him only invented a wage for a month with an empty register.
   */
  where sp.is_active
    and (worked.person_id is not null
      or paid.person_id is not null
      or coalesce(away.any_day, false)
      or coalesce(carried.amount, 0) <> 0
      /*
       * And, in the month the office is actually working in, everybody
       * on the payroll. Otherwise a man put on salary this morning
       * would not appear until somebody marked him, and there would be
       * no way to pay him. Past months stay honest: they show what
       * happened, not who was on the books.
       */
      or (p.is_active and v_month >= date_trunc('month', current_date)::date))
  order by (p.person_id is null), (coalesce(p.pay_kind::text, 'monthly') <> 'daily'), 2;
end
$fn$;

revoke all on function public.salary_month(date) from public, anon;
grant execute on function public.salary_month(date) to authenticated;
