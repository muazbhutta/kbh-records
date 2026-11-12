-- Kafalat is the company's money, laid out for a man who is away.
--
-- Some of the men have gone home on leave. They are earning nothing -
-- nobody is marking them, so the books already say so - but the company
-- goes on paying their kafalat every month, and that is money he will
-- give back. Until now the only way to write it down was as an advance,
-- which on a man's own sheet reads as cash handed to him, and the one
-- thing a wage sheet must not do is tell a man he took money he never
-- saw.
--
-- So kafalat becomes a kind of its own. It counts against him exactly
-- as an advance does - the company is out of pocket either way - but it
-- is named for what it is wherever it is shown.
--
-- And leave becomes a thing the books know about, with the day he went
-- and the day he came back, so a month spent away says so on the sheet
-- instead of being a page of empty days nobody can explain.

-- --------------------------------------------------------------- the kind
alter table public.salary_payments
  drop constraint if exists salary_payments_kind_check;

alter table public.salary_payments
  add constraint salary_payments_kind_check
  check (kind in ('salary', 'advance', 'kafalat'));

comment on column public.salary_payments.kind is
  'salary: wages handed over. advance: cash drawn early. kafalat: the company paid his sponsorship, and he owes it back.';

/*
 * The guard inside record_salary_payment names the kinds it will take,
 * and that function has been rewritten once already - 0060 changed who
 * may call it. Patching the live text rather than writing the function
 * out again keeps that change, and any other, instead of quietly
 * undoing it.
 */
do $patch$
declare
  v_src text;
begin
  select pg_get_functiondef(p.oid) into v_src
    from pg_proc p
   where p.proname = 'record_salary_payment'
     and p.pronamespace = 'public'::regnamespace;

  if v_src is null then
    raise exception 'record_salary_payment is not there to patch';
  end if;
  if position($q$'salary', 'advance'$q$ in v_src) = 0 then
    raise exception 'record_salary_payment does not say what was expected';
  end if;

  execute replace(v_src, $q$'salary', 'advance'$q$, $q$'salary', 'advance', 'kafalat'$q$);
end
$patch$;

-- ---------------------------------------------------------------- the leave
/**
 * When a man went home, and when he came back.
 *
 * A period rather than a flag, so a month gone by still knows it was a
 * month away after he has returned. came_back null means he is away
 * now.
 */
create table if not exists public.salary_leave (
  id        bigint generated always as identity primary key,
  person_id uuid not null references public.salary_people (id) on delete cascade,
  went_on   date not null,
  came_back date,
  note      text check (note is null or length(note) <= 200),
  marked_by uuid references public.app_users (id) on delete set null,
  marked_at timestamptz not null default now(),
  check (came_back is null or came_back >= went_on)
);

comment on table public.salary_leave is
  'Who was away, from when to when. A man away earns nothing, and the kafalat the company pays meanwhile is his to give back.';

create index if not exists salary_leave_person_idx
  on public.salary_leave (person_id, went_on desc);

-- A man can only be away once at a time.
create unique index if not exists salary_leave_one_open
  on public.salary_leave (person_id) where came_back is null;

alter table public.salary_leave enable row level security;

drop policy if exists salary_leave_office on public.salary_leave;
create policy salary_leave_office on public.salary_leave
  for select to authenticated using (public.can_payroll());

grant select on public.salary_leave to authenticated;

/** Send a man on leave, from the day he went. */
create or replace function public.go_on_leave(
  p_person_id uuid,
  p_went_on   date default null,
  p_note      text default null
)
returns bigint
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_id   bigint;
  v_went date := coalesce(p_went_on, current_date);
begin
  if not public.can_payroll() then
    raise exception 'Only an Admin or a Sub-admin can send a man on leave.'
      using errcode = 'P0001';
  end if;
  if v_went > current_date then
    raise exception 'The day he went cannot be in the future.' using errcode = 'P0001';
  end if;
  if not exists (select 1 from public.salary_people where id = p_person_id and is_active) then
    raise exception 'That person is not on the payroll list.' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.salary_leave
              where person_id = p_person_id and came_back is null) then
    raise exception 'He is already away.' using errcode = 'P0001';
  end if;

  insert into public.salary_leave (person_id, went_on, note, marked_by)
  values (p_person_id, v_went, nullif(btrim(coalesce(p_note, '')), ''), auth.uid())
  returning id into v_id;

  return v_id;
end
$fn$;

/** He is back. */
create or replace function public.came_back(
  p_person_id uuid,
  p_on_date   date default null
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_back date := coalesce(p_on_date, current_date);
begin
  if not public.can_payroll() then
    raise exception 'Only an Admin or a Sub-admin can mark him back.'
      using errcode = 'P0001';
  end if;
  if v_back > current_date then
    raise exception 'The day he came back cannot be in the future.' using errcode = 'P0001';
  end if;

  update public.salary_leave
     set came_back = v_back
   where person_id = p_person_id and came_back is null
     and went_on <= v_back;

  if not found then
    raise exception 'He is not away, or he came back before he went.'
      using errcode = 'P0001';
  end if;
end
$fn$;

revoke all on function public.go_on_leave(uuid, date, text) from public, anon;
revoke all on function public.came_back(uuid, date) from public, anon;
grant execute on function public.go_on_leave(uuid, date, text) to authenticated;
grant execute on function public.came_back(uuid, date) to authenticated;

-- ------------------------------------------------- the month, with both in it
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
  /** Fridays he came in, and what they came to. Monthly staff only. */
  bonus_days     bigint,
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
  on_leave_since date
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
           count(*) as n
    from public.salary_payments s
    where s.for_month = v_month and not s.is_deleted
    group by s.person_id
  ),
  worked as (
    -- Each day at what it was worth then, never at today's figure.
    select a.person_id,
           count(*) filter (where a.present) as days_in,
           count(*) as days_said,
           coalesce(sum(a.rate) filter (where a.present), 0) as worth,
           count(*) filter (where a.present and coalesce(a.rate, 0) > 0
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
           (case when pr.pay_kind = 'daily'
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
    (case when worked.person_id is null and paid.person_id is null then 0
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
     + (case when worked.person_id is null and paid.person_id is null then 0
             when p.pay_kind = 'daily' then coalesce(worked.worth, 0)
             else coalesce(p.monthly_amount, 0) + coalesce(worked.worth, 0) end)
     - coalesce(paid.adv, 0) - coalesce(paid.sal, 0) - coalesce(paid.kaf, 0))::numeric,
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
    away.since
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

-- ------------------------------------------------ and the day skips the away
/*
 * A man who is at home is not a man anybody has to answer for.
 *
 * The attendance screen counts who is still unanswered for and puts
 * that number in front of the office every day. A man on leave sat in
 * that count for as long as he was away, so the count never fell to
 * nought and stopped meaning anything.
 *
 * He is not dropped from the roster, only from the day: the moment he
 * is marked back, he is in the list again, and the days he was away
 * keep whatever was written down for them.
 */
do $patch$
declare
  v_src  text;
  /*
   * One line, no line break in it.
   *
   * The body as the server kept it has Windows line endings, because
   * that is how the migration reached it, and an anchor spanning two
   * lines matched nothing at all. A single line is the same either way.
   */
  v_old  text := '  where sp.is_active';
  v_new  text := '  where sp.is_active' || chr(10)
              || '    and not exists (' || chr(10)
              || '      select 1 from public.salary_leave l' || chr(10)
              || '       where l.person_id = sp.id' || chr(10)
              || '         and l.went_on <= v_day' || chr(10)
              || '         and (l.came_back is null or l.came_back >= v_day))';
  v_hits int;
begin
  select pg_get_functiondef(p.oid) into v_src
    from pg_proc p
   where p.proname = 'attendance_day'
     and p.pronamespace = 'public'::regnamespace;

  if v_src is null then
    raise exception 'attendance_day is not there to patch';
  end if;

  v_hits := (length(v_src) - length(replace(v_src, v_old, ''))) / length(v_old);
  if v_hits <> 1 then
    raise exception 'attendance_day says "%" % times, not once', v_old, v_hits;
  end if;
  if position('salary_leave' in v_src) > 0 then
    raise exception 'attendance_day already knows about leave';
  end if;

  execute replace(v_src, v_old, v_new);
end
$patch$;
