-- An entry can be put right.
--
-- A figure typed wrong on payday could be taken out, but not changed,
-- so correcting one meant taking it out and typing the whole thing
-- again - and the hardest one to get right the first time is the one
-- nobody is handing over: what a man already owes, which somebody has
-- to work out from an old notebook.
--
-- Changing it in place would be the obvious thing and is wrong for this
-- table, which says of itself that nothing is ever really removed. A
-- wage sheet that can be edited without trace is not a record of
-- anything. So an edit is what it has always been here: the old entry
-- is struck out, with the reason, and a new one takes its place. Both
-- stay. Only the new one counts.
create or replace function public.edit_salary_payment(
  p_id      bigint,
  p_amount  numeric,
  p_paid_on date default null,
  p_note    text default null,
  p_kind    text default null,
  p_method  public.pay_method default null
)
returns bigint
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_old  public.salary_payments%rowtype;
  v_new  bigint;
  v_kind text;
  v_paid date;
begin
  if not public.can_payroll() then
    raise exception 'Only an Admin or a Sub-admin can change an entry.'
      using errcode = 'P0001';
  end if;

  select * into v_old from public.salary_payments
   where id = p_id and not is_deleted;

  if not found then
    raise exception 'That entry is not there, or is already out.' using errcode = 'P0001';
  end if;

  v_kind := coalesce(nullif(btrim(coalesce(p_kind, '')), ''), v_old.kind);
  v_paid := coalesce(p_paid_on, v_old.paid_on);

  if v_kind not in ('salary', 'advance', 'kafalat', 'owing') then
    raise exception 'That is not a kind of salary entry.' using errcode = 'P0001';
  end if;
  if p_amount is null or p_amount <= 0 then
    raise exception 'Enter an amount bigger than zero.' using errcode = 'P0001';
  end if;
  if round(p_amount, 2) <> p_amount then
    raise exception 'An amount can have at most 2 decimals.' using errcode = 'P0001';
  end if;
  if v_paid > current_date then
    raise exception 'The day it was handed over cannot be in the future.'
      using errcode = 'P0001';
  end if;

  -- Struck out, and said why, so the two are a pair and not a mystery.
  update public.salary_payments
     set is_deleted = true,
         deleted_at = now(),
         deleted_by = auth.uid(),
         delete_reason = 'Changed'
   where id = p_id;

  insert into public.salary_payments
    (person_id, for_month, amount, kind, paid_on, method, note, entered_by)
  values
    (v_old.person_id, v_old.for_month, p_amount, v_kind, v_paid,
     coalesce(p_method, v_old.method),
     nullif(btrim(coalesce(p_note, '')), ''),
     auth.uid())
  returning id into v_new;

  return v_new;
end
$fn$;

revoke all on function public.edit_salary_payment(
  bigint, numeric, date, text, text, public.pay_method) from public, anon;
grant execute on function public.edit_salary_payment(
  bigint, numeric, date, text, text, public.pay_method) to authenticated;
