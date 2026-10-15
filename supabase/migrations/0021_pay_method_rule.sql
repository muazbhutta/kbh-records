-- =====================================================================
--  Migration 0021 - An expense has no method, a handover always has one
-- ---------------------------------------------------------------------
--  This is the rule behind the column 0020 added. It is on its own
--  because Postgres will not alter a table in the same transaction that
--  has just written to every row of it.
-- =====================================================================

alter table public.entries drop constraint if exists entries_pay_method_shape;
alter table public.entries add constraint entries_pay_method_shape
  check ((type = 'expense') = (pay_method is null));

create index if not exists entries_pay_method_idx
  on public.entries (pay_method) where pay_method is not null;
