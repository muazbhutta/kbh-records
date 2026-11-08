-- The labour already on the books.
--
-- Every expense filed under the Labour category was recorded before
-- there was a Labour kind to put it in, so it all sits as Petty. The
-- office asked for the old data to be in the Labour report, and the
-- category is the only record of what it was - so the category is what
-- this reads.
--
-- Only the kind moves. The amount, the person, the date, the bill and
-- the category are all left exactly as they are, and a cancelled or
-- deleted expense is moved too, so that restoring one later does not
-- bring back a row that disagrees with every other.

update public.entries e
   set expense_type = 'labour',
       type_source  = 'changed_by_admin',
       type_flags   = array(select f from unnest(e.type_flags) f
                             where f not in ('type_check', 'old_entry_check'))
  from public.expense_categories c
 where c.id = e.category_id
   and lower(btrim(c.name)) = 'labour'
   and e.type = 'expense'
   and e.expense_type is distinct from 'labour';

comment on type public.expense_kind is
  'What the paper is: a petty cash bill, a tax invoice, or a day''s labour.';

-- The figures on the Reports screen have to be able to say "labour"
-- too, or picking the Labour chip would show the figure for everything.
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
  v_all           numeric := 0;
  v_petty         numeric := 0;
  v_invoice       numeric := 0;
  v_labour        numeric := 0;
  v_count         bigint  := 0;
  v_petty_count   bigint  := 0;
  v_invoice_count bigint  := 0;
  v_labour_count  bigint  := 0;
  v_photos        bigint  := 0;
begin
  if not public.is_admin() then
    raise exception 'Only an Admin can read reports.' using errcode = 'P0001';
  end if;

  select
    coalesce(sum(e.amount), 0),
    coalesce(sum(e.amount) filter (where e.expense_type = 'petty'), 0),
    coalesce(sum(e.amount) filter (where e.expense_type = 'invoice'), 0),
    coalesce(sum(e.amount) filter (where e.expense_type = 'labour'), 0),
    count(*),
    count(*) filter (where e.expense_type = 'petty'),
    count(*) filter (where e.expense_type = 'invoice'),
    count(*) filter (where e.expense_type = 'labour'),
    coalesce(sum((select count(*) from public.entry_photos ph where ph.entry_id = e.id)), 0)
  into v_all, v_petty, v_invoice, v_labour,
       v_count, v_petty_count, v_invoice_count, v_labour_count, v_photos
  from public.entries e
  where e.type = 'expense'
    and not e.is_deleted
    and not e.is_cancelled
    and (p_from is null or e.bill_date >= p_from)
    and (p_to   is null or e.bill_date <= p_to)
    and (p_person_id is null or e.person_id = p_person_id)
    and (p_category_id is null or e.category_id = p_category_id);

  return jsonb_build_object(
    'all_total',     v_all,
    'petty_total',   v_petty,
    'invoice_total', v_invoice,
    'labour_total',  v_labour,
    'entry_count',   v_count,
    'petty_count',   v_petty_count,
    'invoice_count', v_invoice_count,
    'labour_count',  v_labour_count,
    'photo_count',   v_photos
  );
end
$fn$;
