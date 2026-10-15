-- =====================================================================
--  Migration 0018 - The same window, opened a little wider
-- ---------------------------------------------------------------------
--  The first peek missed the two extra guards on app_users. This takes
--  every function the people and login tables actually lean on.
--  Migration 0019 takes the window out again.
-- =====================================================================

create or replace function public.tmp_schema_peek()
returns jsonb
language sql
stable
security definer
set search_path = public, pg_catalog, pg_temp
as $fn$
  select jsonb_build_object(
    'functions', (
      select jsonb_agg(jsonb_build_object(
        'name', p.proname,
        'def', pg_get_functiondef(p.oid)
      ) order by p.proname)
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public'
        and p.proname in ('is_admin', 'is_active_user', 'current_app_role',
                          'create_person', 'set_person_pin',
                          'app_users_guard', 'app_users_head_guard',
                          'app_users_insert_guard')
    ),
    'grants', (
      select jsonb_agg(jsonb_build_object(
        'table', table_name, 'grantee', grantee, 'privilege', privilege_type
      ) order by table_name, grantee, privilege_type)
      from information_schema.role_table_grants
      where table_schema = 'public'
        and table_name in ('app_users', 'user_secrets', 'login_attempts')
        and grantee in ('anon', 'authenticated', 'service_role')
    )
  );
$fn$;
