-- =====================================================================
--  Migration 0019 - Close the window, and shut a door nobody needs
-- ---------------------------------------------------------------------
--  Takes out the temporary function that was used to read the live schema
--  back into 0001, and removes the blanket grants the anon (not signed
--  in) role was given on the people table when it was first created.
--
--  Row level security was already turning anon away, so this changes
--  nothing that works today. It is the second lock on the same door: if a
--  policy is ever written loosely, anon still has no privilege to use it.
-- =====================================================================

drop function if exists public.tmp_schema_peek();

revoke all on table public.app_users from anon;
grant select, insert, update on table public.app_users to authenticated;

revoke all on table public.user_secrets from anon, authenticated;
revoke all on table public.login_attempts from anon;
grant select on table public.login_attempts to authenticated;
