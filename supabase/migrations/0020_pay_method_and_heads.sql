-- =====================================================================
--  Migration 0020 - How the money came, and what a head may do
-- ---------------------------------------------------------------------
--  Two things a person asked for and the books could not answer:
--
--  1. "How did I get this money?" Every handover is now marked either
--     Cash in hand or Bank transfer, and each person's totals say how
--     much came each way.
--
--  2. A head of employees. Until now being a head was only a label on
--     the Admin's dashboard. A head can now hand his own cash to the
--     people under him and see what they spent. They still cannot see
--     each other, and a plain employee can no longer hand money to
--     anyone at all - only his head or an Admin can.
-- =====================================================================

-- ============================================ how it changed hands
do $$
begin
  if not exists (select 1 from pg_type where typname = 'pay_method') then
    create type public.pay_method as enum ('cash', 'transfer');
  end if;
end
$$;

comment on type public.pay_method is
  'cash = notes handed over. transfer = sent to a bank account.';

alter table public.entries
  add column if not exists pay_method public.pay_method;

comment on column public.entries.pay_method is
  'How the money moved. Null on an expense, which is money going out of a hand, not between hands.';

-- Everything recorded before today was cash handed over, which is how
-- the company worked until the bank option existed.
update public.entries
   set pay_method = 'cash'
 where pay_method is null
   and type in ('money_given', 'transfer', 'returned');

-- The rule that an expense has no method, and a handover always has
-- one, is added in 0021: a table cannot be altered in the same breath as
-- the rows it has just written.

-- ============================================ who is whose head
/** The people under one head, for the head himself to look at. */
create or replace function public.my_team_ids()
returns setof uuid
language sql
stable
security definer
set search_path = public, pg_temp
as $fn$
  select u.id
    from public.app_users u
   where u.head_id = auth.uid()
     and exists (select 1 from public.app_users me
                  where me.id = auth.uid() and me.is_head and me.is_active);
$fn$;

grant execute on function public.my_team_ids() to authenticated;

/** True when the signed-in person is an active head of employees. */
create or replace function public.is_head()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $fn$
  select coalesce(
    (select u.is_head and u.is_active from public.app_users u where u.id = auth.uid()),
    false);
$fn$;

grant execute on function public.is_head() to authenticated;

-- ============================================ what each person may see
-- A head sees his own money and his team's. Nobody else's.
drop policy if exists entries_select on public.entries;
create policy entries_select on public.entries
  for select to authenticated
  using (
    public.is_admin()
    or person_id = auth.uid()
    or counterparty_id = auth.uid()
    or entered_by = auth.uid()
    or person_id in (select public.my_team_ids())
  );

drop policy if exists entry_photos_select on public.entry_photos;
create policy entry_photos_select on public.entry_photos
  for select to authenticated
  using (
    exists (
      select 1 from public.entries e
      where e.id = entry_id
        and (
          public.is_admin()
          or e.person_id = auth.uid()
          or e.counterparty_id = auth.uid()
          or e.entered_by = auth.uid()
          or e.person_id in (select public.my_team_ids())
        )
    )
  );

-- ============================================ what each person may write
-- A plain employee writes only his own spending. A head may also hand
-- his own cash to someone on his team.
drop policy if exists entries_insert_employee on public.entries;
create policy entries_insert_employee on public.entries
  for insert to authenticated
  with check (
    public.is_active_user()
    and entered_by = auth.uid()
    and person_id = auth.uid()
    and (
      type = 'expense'
      or (
        type = 'transfer'
        and public.is_head()
        and counterparty_id in (select public.my_team_ids())
      )
    )
  );

comment on policy entries_insert_employee on public.entries is
  'An employee records his own spending. A head may also pass his own cash down to his own team.';

-- ============================================ the money in, split by how it came
drop view if exists public.entry_lines cascade;
create view public.entry_lines
with (security_invoker = true)
as
select
  e.id as entry_id,
  e.person_id,
  case e.type
    when 'money_given' then 'money_given'
    when 'transfer'    then 'transfer_out'
    when 'expense'     then 'expense'
    when 'returned'    then 'returned'
  end as line_type,
  case when e.type = 'money_given' then e.amount else -e.amount end as signed_amount,
  e.counterparty_id as other_person_id,
  e.pay_method
from public.entries e
where not e.is_deleted and not e.is_cancelled

union all

select
  e.id,
  e.counterparty_id,
  'transfer_in',
  e.amount,
  e.person_id,
  e.pay_method
from public.entries e
where not e.is_deleted and not e.is_cancelled and e.type = 'transfer';

grant select on public.entry_lines to authenticated;

create view public.person_totals
with (security_invoker = true)
as
select
  l.person_id,
  coalesce(sum(l.signed_amount) filter (where l.line_type = 'money_given'),  0)  as money_given,
  coalesce(sum(l.signed_amount) filter (where l.line_type = 'transfer_in'),  0)  as transfers_in,
  coalesce(-sum(l.signed_amount) filter (where l.line_type = 'transfer_out'), 0) as transfers_out,
  coalesce(-sum(l.signed_amount) filter (where l.line_type = 'expense'),      0) as expenses,
  coalesce(-sum(l.signed_amount) filter (where l.line_type = 'returned'),     0) as returned,
  -- Everything that came in, told apart by how it arrived.
  coalesce(sum(l.signed_amount) filter (
    where l.line_type in ('money_given', 'transfer_in') and l.pay_method = 'cash'), 0)     as in_cash,
  coalesce(sum(l.signed_amount) filter (
    where l.line_type in ('money_given', 'transfer_in') and l.pay_method = 'transfer'), 0) as in_transfer,
  coalesce(-sum(l.signed_amount) filter (
    where l.line_type in ('transfer_out', 'returned') and l.pay_method = 'cash'), 0)       as out_cash,
  coalesce(-sum(l.signed_amount) filter (
    where l.line_type in ('transfer_out', 'returned') and l.pay_method = 'transfer'), 0)   as out_transfer,
  coalesce(sum(l.signed_amount), 0)                                             as balance,
  count(*)                                                                      as entry_count
from public.entry_lines l
group by l.person_id;

grant select on public.person_totals to authenticated;

-- The three views that hang off person_totals, put back with the new
-- columns carried through.
create view public.entry_feed
with (security_invoker = true)
as
select
  l.entry_id              as id,
  l.person_id,
  l.line_type,
  l.signed_amount,
  e.type,
  e.amount,
  e.bill_date,
  e.entered_at,
  e.note,
  e.person_id             as owner_id,
  own.full_name           as owner_name,
  e.counterparty_id,
  cp.full_name            as counterparty_name,
  l.other_person_id,
  other.full_name         as other_person_name,
  e.entered_by,
  eb.full_name            as entered_by_name,
  (e.entered_by <> e.person_id) as entered_for_someone_else,
  e.duplicate_photo,
  e.pay_method,
  e.category_id,
  c.name                  as category_name,
  c.icon                  as category_icon,
  e.project_id,
  e.system_id,
  e.expense_type,
  e.type_source,
  e.type_flags,
  e.bill_scan_state,
  (select count(*) from public.entry_photos p where p.entry_id = e.id)   as photo_count,
  (select p.thumb_path from public.entry_photos p
     where p.entry_id = e.id order by p.position, p.created_at limit 1)  as thumb_path
from public.entry_lines l
join public.entries e            on e.id = l.entry_id
left join public.people_names own   on own.id = e.person_id
left join public.people_names cp    on cp.id = e.counterparty_id
left join public.people_names other on other.id = l.other_person_id
left join public.people_names eb    on eb.id = e.entered_by
left join public.expense_categories c on c.id = e.category_id;

grant select on public.entry_feed to authenticated;

create view public.people_list
with (security_invoker = true)
as
select
  u.id,
  u.full_name,
  u.mobile,
  u.role,
  u.is_owner,
  u.is_active,
  u.job_title,
  u.is_head,
  u.head_id,
  h.full_name                        as head_name,
  coalesce(tm.team_count, 0)         as team_count,
  u.created_at,
  u.disabled_at,
  c.full_name                        as created_by_name,
  coalesce(t.money_given, 0)         as money_given,
  coalesce(t.transfers_in, 0)        as transfers_in,
  coalesce(t.transfers_out, 0)       as transfers_out,
  coalesce(t.expenses, 0)            as expenses,
  coalesce(t.returned, 0)            as returned,
  coalesce(t.balance, 0)             as balance,
  coalesce(t.in_cash, 0)             as in_cash,
  coalesce(t.in_transfer, 0)         as in_transfer,
  coalesce(t.out_cash, 0)            as out_cash,
  coalesce(t.out_transfer, 0)        as out_transfer,
  coalesce(t.entry_count, 0)         as entry_count,
  le.last_entry_at,
  coalesce(s.check_count, 0)         as check_count,
  coalesce(s.short_count, 0)         as short_count,
  coalesce(s.total_short, 0)         as total_short,
  coalesce(s.total_extra, 0)         as total_extra,
  s.last_checked_at,
  lc.difference                      as last_check_difference,
  lc.result                          as last_check_result,
  coalesce(ex.petty_total, 0)        as petty_total,
  coalesce(ex.invoice_total, 0)      as invoice_total
from public.app_users u
left join public.app_users c on c.id = u.created_by
left join public.app_users h on h.id = u.head_id
left join public.person_totals t on t.person_id = u.id
left join public.person_check_summary s on s.person_id = u.id
left join lateral (
  select count(*) as team_count
  from public.app_users m
  where m.head_id = u.id and m.is_active
) tm on true
left join lateral (
  select max(e.entered_at) as last_entry_at
  from public.entries e
  where not e.is_deleted and not e.is_cancelled
    and (e.person_id = u.id or e.counterparty_id = u.id)
) le on true
left join lateral (
  select
    coalesce(sum(e.amount) filter (where e.expense_type = 'petty'), 0)   as petty_total,
    coalesce(sum(e.amount) filter (where e.expense_type = 'invoice'), 0) as invoice_total
  from public.entries e
  where e.type = 'expense'
    and not e.is_deleted and not e.is_cancelled
    and e.person_id = u.id
) ex on true
left join lateral (
  select f.difference, f.result
  from public.cash_check_feed f
  where f.person_id = u.id
  order by f.checked_at desc
  limit 1
) lc on true;

grant select on public.people_list to authenticated;

create view public.team_summary
with (security_invoker = true)
as
select
  h.id                                             as head_id,
  h.full_name                                      as head_name,
  h.job_title                                      as head_job_title,
  count(m.id) filter (where m.is_active)           as people_count,
  coalesce(sum(greatest(coalesce(mt.balance, 0), 0))
           filter (where m.is_active), 0)          as team_cash,
  coalesce(greatest(coalesce(ht.balance, 0), 0), 0) as head_cash
from public.app_users h
left join public.app_users m on m.head_id = h.id
left join public.person_totals mt on mt.person_id = m.id
left join public.person_totals ht on ht.person_id = h.id
where h.is_head
group by h.id, h.full_name, h.job_title, ht.balance;

grant select on public.team_summary to authenticated;
