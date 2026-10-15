-- =====================================================================
--  Migration 0023 - A person's totals belong to the people entitled to them
-- ---------------------------------------------------------------------
--  person_totals adds up entry_lines, and a person can see both sides of
--  a handover he was part of. So when a head passed cash to his man, the
--  man got back a totals row carrying the HEAD's id and the slice of the
--  head's money he happened to be part of.
--
--  It told him nothing he did not already know - it was his own money
--  arriving - but a row with another man's name on it has no business
--  being there. Totals now come back only for yourself, for your own
--  team if you are a head, and for everybody if you are an Admin.
-- =====================================================================

drop view if exists public.person_totals cascade;
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
where public.is_admin()
   or l.person_id = auth.uid()
   or l.person_id in (select public.my_team_ids())
group by l.person_id;

grant select on public.person_totals to authenticated;

-- The two views that hang off person_totals, put back unchanged.
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
