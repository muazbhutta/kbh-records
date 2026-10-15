-- =====================================================================
--  Migration 0027 - A fresh start for the company
-- ---------------------------------------------------------------------
--  Everything recorded while the app was being built and tested is
--  practice, not the company's books. This clears it out so KBH starts
--  from zero: no entries, no bill photos, no cash checks, no history,
--  and nobody on the books but the Owner, who then adds the real staff,
--  sub-admins and heads himself.
--
--  THIS IS A ONE-OFF. On a fresh database every statement finds nothing
--  to remove and does nothing, so the file is safe to keep in the
--  history. The bill photos in storage were cleared separately before
--  this ran.
--
--  Two guards are lifted for the length of this transaction and put
--  straight back: the one that forbids deleting a person, and the one
--  that makes the change history append-only. Both are there to stop a
--  careless hand in daily use; this is the one deliberate exception.
-- =====================================================================

begin;

-- ---------------------------------------------------------- the money
alter table public.entries disable trigger user;
alter table public.entry_photos disable trigger user;
alter table public.cash_checks disable trigger user;
alter table public.audit_log disable trigger user;
alter table public.report_downloads disable trigger user;

delete from public.entry_photos;
delete from public.entries;
delete from public.cash_checks;
delete from public.report_downloads;
delete from public.audit_log;
delete from public.login_attempts;

-- The expense numbering starts again at EXP-<year>-000001.
delete from public.expense_counters;

alter table public.entries enable trigger user;
alter table public.entry_photos enable trigger user;
alter table public.cash_checks enable trigger user;
alter table public.audit_log enable trigger user;
alter table public.report_downloads enable trigger user;

-- --------------------------------------------------------- the people
-- Everyone except the Owner goes, PIN and login with them. app_users.id
-- points at auth.users with ON DELETE RESTRICT, so the app row has to go
-- first and the login second.
create temporary table _going on commit drop as
  select id from public.app_users where not is_owner;

alter table public.app_users disable trigger user;

-- Nothing should still point at them by the time we get here, but say so
-- plainly rather than leave it to a cascade.
update public.app_users set created_by = null
 where created_by in (select id from _going);
update public.app_users set head_id = null
 where head_id in (select id from _going);

delete from public.user_secrets where user_id in (select id from _going);
delete from public.app_users   where id      in (select id from _going);
delete from auth.users         where id      in (select id from _going);

alter table public.app_users enable trigger user;

commit;
