-- =====================================================================
--  Migration 0013 - One create_entry, not two
-- ---------------------------------------------------------------------
--  0012 added a parameter with "create or replace", which in Postgres
--  makes a SECOND function rather than replacing the first. PostgREST
--  then could not tell which one the app meant. The older signature is
--  dropped here; the one with p_duplicate_of is the only one left.
-- =====================================================================

drop function if exists public.create_entry(
  public.entry_type, numeric, uuid, date, uuid, uuid, text, jsonb, uuid,
  public.expense_kind, public.type_source, jsonb, text[]
);
