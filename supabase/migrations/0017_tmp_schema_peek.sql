-- =====================================================================
--  Migration 0017 - A temporary window on the live schema
-- ---------------------------------------------------------------------
--  0001_people_and_auth.sql is an empty file, so the people and login
--  tables live only in the database. This reads the real definitions back
--  out so that file can be written from the truth rather than memory.
--
--  Migration 0018 takes this straight back out again.
-- =====================================================================

create or replace function public.tmp_schema_peek()
returns jsonb
language sql
stable
security definer
set search_path = public, pg_catalog, pg_temp
as $fn$
  select jsonb_build_object(
    'tables', (
      select jsonb_agg(jsonb_build_object(
        'table', c.relname,
        'rls', c.relrowsecurity,
        'columns', (
          select jsonb_agg(jsonb_build_object(
            'name', a.attname,
            'type', format_type(a.atttypid, a.atttypmod),
            'notnull', a.attnotnull,
            'default', pg_get_expr(d.adbin, d.adrelid)
          ) order by a.attnum)
          from pg_attribute a
          left join pg_attrdef d on d.adrelid = a.attrelid and d.adnum = a.attnum
          where a.attrelid = c.oid and a.attnum > 0 and not a.attisdropped
        ),
        'constraints', (
          select jsonb_agg(pg_get_constraintdef(con.oid) order by con.conname)
          from pg_constraint con where con.conrelid = c.oid
        ),
        'indexes', (
          select jsonb_agg(pg_get_indexdef(i.indexrelid))
          from pg_index i where i.indrelid = c.oid
        ),
        'policies', (
          select jsonb_agg(jsonb_build_object(
            'name', pol.polname,
            'cmd', pol.polcmd,
            'using', pg_get_expr(pol.polqual, pol.polrelid),
            'check', pg_get_expr(pol.polwithcheck, pol.polrelid)
          ) order by pol.polname)
          from pg_policy pol where pol.polrelid = c.oid
        ),
        'triggers', (
          select jsonb_agg(pg_get_triggerdef(t.oid) order by t.tgname)
          from pg_trigger t where t.tgrelid = c.oid and not t.tgisinternal
        )
      ) order by c.relname)
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relkind = 'r'
        and c.relname in ('app_users', 'user_secrets', 'login_attempts')
    ),
    'functions', (
      select jsonb_agg(jsonb_build_object(
        'name', p.proname,
        'def', pg_get_functiondef(p.oid)
      ) order by p.proname)
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public'
        and p.proname in ('is_admin', 'is_active_user', 'create_person',
                          'set_person_pin', 'guard_app_users', 'app_users_guard',
                          'protect_owner', 'touch_updated_at', 'set_updated_at')
    ),
    'all_function_names', (
      select jsonb_agg(distinct p.proname order by p.proname)
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public'
    )
  );
$fn$;

revoke all on function public.tmp_schema_peek() from public, anon;
grant execute on function public.tmp_schema_peek() to authenticated;
