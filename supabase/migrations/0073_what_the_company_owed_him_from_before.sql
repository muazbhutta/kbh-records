-- What the company owed him before the app ever opened.
--
-- Owing was the first half of this: a man may walk into the records
-- already owing the company money, and now it can be written down.
-- The other half was missing. A company that has been running for
-- years and is only now keeping books owes money as often as it is
-- owed it - a month of wages never handed over, a settlement promised
-- and not paid - and there was no way to say so. The only way to get
-- the figure onto his sheet was to hand him cash and call it a salary
-- payment, which says the opposite of what happened.
--
-- So one more kind: backpay. It is the mirror of owing in every piece
-- of arithmetic - owing is money he must give back, backpay is money
-- the company must hand over - and like owing, no cash changes hands
-- when it is written down. It simply joins what he is owed, and is
-- settled out of the next wage that is paid.

-- ------------------------------------------------------------ the kind
alter table public.salary_payments
  drop constraint if exists salary_payments_kind_check;

alter table public.salary_payments
  add constraint salary_payments_kind_check
  check (kind in ('salary', 'advance', 'kafalat', 'owing', 'backpay'));

comment on column public.salary_payments.kind is
  'salary: wages handed over. advance: cash drawn early. kafalat: the company paid his sponsorship. owing: money he already owed, written down by hand. backpay: money the company already owed him, written down by hand.';

/*
 * A patch that will not apply is a patch that must stop the migration.
 *
 * Each of these functions has been rewritten more than once, and
 * writing any of them out again from memory would quietly undo
 * whichever change came last. So the live text is read, changed in
 * exactly one place, and put back - and if the place it expects is not
 * there, or is there twice, nothing happens at all.
 */
create or replace function pg_temp.patch_once(p_src text, p_find text, p_put text)
returns text
language plpgsql
as $helper$
declare
  v_hits integer;
begin
  v_hits := (length(p_src) - length(replace(p_src, p_find, ''))) / length(p_find);
  if v_hits <> 1 then
    raise exception 'Expected to find % once, found % times: %',
      p_find, v_hits, left(p_find, 60);
  end if;
  return replace(p_src, p_find, p_put);
end
$helper$;

-- ------------------------------------------- the two that write entries
do $patch$
declare
  v_name text;
  v_src  text;
begin
  foreach v_name in array array['record_salary_payment', 'edit_salary_payment'] loop
    select pg_get_functiondef(p.oid) into v_src
      from pg_proc p
     where p.proname = v_name
       and p.pronamespace = 'public'::regnamespace;

    if v_src is null then
      raise exception '% is not there to patch', v_name;
    end if;

    execute pg_temp.patch_once(
      v_src,
      $q$('salary', 'advance', 'kafalat', 'owing')$q$,
      $q$('salary', 'advance', 'kafalat', 'owing', 'backpay')$q$);
  end loop;
end
$patch$;

-- ------------------------------------------------ the month, with the debt
do $patch$
declare
  v_src text;
begin
  select pg_get_functiondef(p.oid) into v_src
    from pg_proc p
   where p.proname = 'salary_month'
     and p.pronamespace = 'public'::regnamespace;

  if v_src is null then
    raise exception 'salary_month is not there to patch';
  end if;

  -- 1. The month's own backpay, gathered beside the rest.
  v_src := pg_temp.patch_once(v_src,
    $q$           coalesce(sum(s.amount) filter (where s.kind = 'owing'), 0)   as owe,$q$,
    $q$           coalesce(sum(s.amount) filter (where s.kind = 'owing'), 0)   as owe,$q$ || chr(10) ||
    $q$           coalesce(sum(s.amount) filter (where s.kind = 'backpay'), 0) as bak,$q$);

  /*
   * 2. What a past month took off him.
   *
   * Every other kind is money that left the company's hands or a debt
   * he carries, so it comes off. Backpay is the one that goes the
   * other way: it is owed to him, so it is counted as a negative
   * taking and carries into the next month as a plus.
   */
  v_src := pg_temp.patch_once(v_src,
    $q$        select s.person_id, s.for_month mon, sum(s.amount) taken,$q$,
    $q$        select s.person_id, s.for_month mon,$q$ || chr(10) ||
    $q$               sum(case when s.kind = 'backpay' then -s.amount else s.amount end) taken,$q$);

  -- 3. And in this month's own figure, the same, with the sign the
  --    other way round from every other kind.
  v_src := pg_temp.patch_once(v_src,
    $q$     - coalesce(paid.kaf, 0) - coalesce(paid.owe, 0))::numeric,$q$,
    $q$     - coalesce(paid.kaf, 0) - coalesce(paid.owe, 0)$q$ || chr(10) ||
    $q$     + coalesce(paid.bak, 0))::numeric,$q$);

  -- 4. Named on the way out, so a sheet can say where the figure came
  --    from rather than leaving it inside a total.
  v_src := pg_temp.patch_once(v_src,
    $q$owing_added numeric)$q$,
    $q$owing_added numeric, backpay_added numeric)$q$);

  v_src := pg_temp.patch_once(v_src,
    $q$    coalesce(paid.owe, 0)::numeric$q$,
    $q$    coalesce(paid.owe, 0)::numeric,$q$ || chr(10) ||
    $q$    coalesce(paid.bak, 0)::numeric$q$);

  -- A column added to what it hands back changes its type, and a type
  -- cannot be replaced in place.
  execute 'drop function public.salary_month(date)';
  execute v_src;
end
$patch$;

revoke all on function public.salary_month(date) from public, anon;
grant execute on function public.salary_month(date) to authenticated;
