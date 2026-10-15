-- =====================================================================
--  Migration 0015 - An employee may only write in his own khata
-- ---------------------------------------------------------------------
--  The old rule let an employee insert an expense with any person_id on
--  it. Waqas could charge SAR 5,000 to Rana's khata and Rana's balance
--  would drop, with Waqas's name only in the small print.
--
--  An employee spends the cash he himself is holding, so the expense
--  belongs in his own khata. A transfer already had to come from his own
--  khata; now an expense does too. Admin and Sub-admin are untouched and
--  can still record anything for anybody.
-- =====================================================================

drop policy if exists entries_insert_employee on public.entries;
create policy entries_insert_employee on public.entries
  for insert to authenticated
  with check (
    public.is_active_user()
    and entered_by = auth.uid()
    -- The money must be his own, whichever kind of entry it is.
    and person_id = auth.uid()
    and type in ('expense', 'transfer')
  );

comment on policy entries_insert_employee on public.entries is
  'An employee records only his own spending and his own handovers.';
