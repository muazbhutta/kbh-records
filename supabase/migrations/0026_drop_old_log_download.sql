-- =====================================================================
--  Migration 0026 - One log_report_download, not two
-- ---------------------------------------------------------------------
--  0024 gave log_report_download a category argument with "create or
--  replace". An added argument makes a SECOND function rather than
--  replacing the first, so the database ended up holding both shapes and
--  PostgREST answered "could not choose" (HTTP 300) to any call that did
--  not name the category.
--
--  The old seven-argument shape goes.
-- =====================================================================

drop function if exists public.log_report_download(
  text, date, date, uuid, integer, numeric, text);
