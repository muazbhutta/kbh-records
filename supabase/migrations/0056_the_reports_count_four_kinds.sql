-- The reports have to count four kinds, not three.
--
-- The Reports screen refuses to make anything while the kinds do not
-- add up to the total - which is what caught Labour being added
-- half-way. So the figures learn the new kind in the same breath.
--
-- Nothing is moved. Every expense stays exactly where it is filed;
-- the office will mark the transfers itself, one bill at a time, on
-- the ticket where it is already looking at the paper.

create or replace function public.expense_report_totals(
  p_from date default null,
  p_to date default null,
  p_person_id uuid default null,
  p_category_id uuid default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_all            numeric := 0;
  v_petty          numeric := 0;
  v_invoice        numeric := 0;
  v_labour         numeric := 0;
  v_transfer       numeric := 0;
  v_count          bigint  := 0;
  v_petty_count    bigint  := 0;
  v_invoice_count  bigint  := 0;
  v_labour_count   bigint  := 0;
  v_transfer_count bigint  := 0;
  v_photos         bigint  := 0;
begin
  if not public.is_admin() then
    raise exception 'Only an Admin can read reports.' using errcode = 'P0001';
  end if;

  select
    coalesce(sum(e.amount), 0),
    coalesce(sum(e.amount) filter (where e.expense_type = 'petty'), 0),
    coalesce(sum(e.amount) filter (where e.expense_type = 'invoice'), 0),
    coalesce(sum(e.amount) filter (where e.expense_type = 'labour'), 0),
    coalesce(sum(e.amount) filter (where e.expense_type = 'bank_transfer'), 0),
    count(*),
    count(*) filter (where e.expense_type = 'petty'),
    count(*) filter (where e.expense_type = 'invoice'),
    count(*) filter (where e.expense_type = 'labour'),
    count(*) filter (where e.expense_type = 'bank_transfer'),
    coalesce(sum((select count(*) from public.entry_photos ph where ph.entry_id = e.id)), 0)
  into v_all, v_petty, v_invoice, v_labour, v_transfer,
       v_count, v_petty_count, v_invoice_count, v_labour_count, v_transfer_count, v_photos
  from public.entries e
  where e.type = 'expense'
    and not e.is_deleted
    and not e.is_cancelled
    and (p_from is null or e.bill_date >= p_from)
    and (p_to   is null or e.bill_date <= p_to)
    and (p_person_id is null or e.person_id = p_person_id)
    and (p_category_id is null or e.category_id = p_category_id);

  return jsonb_build_object(
    'all_total',      v_all,
    'petty_total',    v_petty,
    'invoice_total',  v_invoice,
    'labour_total',   v_labour,
    'transfer_total', v_transfer,
    'entry_count',    v_count,
    'petty_count',    v_petty_count,
    'invoice_count',  v_invoice_count,
    'labour_count',   v_labour_count,
    'transfer_count', v_transfer_count,
    'photo_count',    v_photos
  );
end
$fn$;

comment on type public.expense_kind is
  'What the paper is: a petty slip, a tax invoice, a day''s labour, or a bank transfer receipt.';
