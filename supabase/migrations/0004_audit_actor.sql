-- =====================================================================
--  Migration 0004 - Name the person behind an Edge Function change
-- ---------------------------------------------------------------------
--  Some work has to run with the service key (making a login account,
--  hashing a PIN). Inside those calls auth.uid() is empty, so the change
--  history was recording "System" instead of the Admin who did it.
--
--  The fix is a setting the function can carry with it, read here as a
--  fallback. It is scoped to the transaction, so it cannot leak.
-- =====================================================================

create or replace function public.audit_row()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_old     jsonb := case when tg_op = 'INSERT' then null else to_jsonb(old) end;
  v_new     jsonb := case when tg_op = 'DELETE' then null else to_jsonb(new) end;
  v_body    jsonb := coalesce(v_new, v_old);
  v_changes jsonb := '{}'::jsonb;
  v_key     text;
  v_action  text;
  v_actor   uuid;
  v_name    text;
  v_person  uuid;
  v_summary text;
begin
  -- Who is doing this: the signed-in user, or whoever the Edge Function
  -- said it was acting for.
  v_actor := coalesce(
    auth.uid(),
    nullif(current_setting('app.actor_id', true), '')::uuid
  );

  if tg_op = 'UPDATE' then
    for v_key in select jsonb_object_keys(v_new) loop
      if v_key = any (public.audit_noise_keys()) then
        continue;
      end if;
      if v_new -> v_key is distinct from v_old -> v_key then
        v_changes := v_changes || jsonb_build_object(
          v_key, jsonb_build_object('old', v_old -> v_key, 'new', v_new -> v_key));
      end if;
    end loop;

    if v_changes = '{}'::jsonb then
      return null;
    end if;
  end if;

  if tg_op = 'INSERT' then
    v_action := 'insert';
  elsif tg_op = 'DELETE' then
    v_action := 'delete';
  elsif (v_old ->> 'is_deleted')::boolean is distinct from (v_new ->> 'is_deleted')::boolean then
    v_action := case when (v_new ->> 'is_deleted')::boolean then 'delete' else 'restore' end;
  else
    v_action := 'update';
  end if;

  select u.full_name into v_name from public.app_users u where u.id = v_actor;

  if tg_argv[0] is not null and v_body ? tg_argv[0] then
    v_person := (v_body ->> tg_argv[0])::uuid;
  end if;

  if tg_table_name = 'entries' then
    v_summary := initcap(replace(v_body ->> 'type', '_', ' '))
                 || ' SAR ' || to_char((v_body ->> 'amount')::numeric, 'FM999,999,990.00');
  elsif tg_table_name = 'cash_checks' then
    v_summary := 'Cash Check, counted SAR '
                 || to_char((v_body ->> 'counted')::numeric, 'FM999,999,990.00');
  elsif tg_table_name = 'app_users' then
    v_summary := coalesce(v_body ->> 'full_name', 'Person');
  elsif tg_table_name = 'expense_categories' then
    v_summary := 'Category ' || coalesce(v_body ->> 'name', '');
  end if;

  insert into public.audit_log
    (table_name, row_id, action, actor_id, actor_name, person_id, summary,
     changes, old_row, new_row)
  values
    (tg_table_name, (v_body ->> 'id')::uuid, v_action, v_actor,
     coalesce(v_name, 'System'), v_person, v_summary,
     case when v_changes = '{}'::jsonb then null else v_changes end,
     v_old, v_new);

  return null;
end
$fn$;

-- Creating a person runs with the service key, so it carries the Admin's
-- id along for the audit trigger to pick up.
create or replace function public.create_person(
  p_id            uuid,
  p_full_name     text,
  p_mobile        text,
  p_role          public.user_role,
  p_is_owner      boolean,
  p_pin_hash      text,
  p_auth_password text,
  p_job_title     text default null,
  p_created_by    uuid default null
)
returns public.app_users
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_row public.app_users;
begin
  perform set_config('app.actor_id', coalesce(p_created_by::text, ''), true);

  insert into public.app_users
    (id, full_name, mobile, role, is_owner, job_title, created_by)
  values
    (p_id, btrim(p_full_name), p_mobile, p_role, coalesce(p_is_owner, false),
     nullif(btrim(coalesce(p_job_title, '')), ''), p_created_by)
  returning * into v_row;

  insert into public.user_secrets (user_id, pin_hash, auth_password, pin_set_by)
  values (p_id, p_pin_hash, p_auth_password, coalesce(p_created_by, p_id));

  return v_row;
end
$fn$;

revoke all on function public.create_person(uuid, text, text, public.user_role, boolean, text, text, text, uuid)
  from public, anon, authenticated;
grant execute on function public.create_person(uuid, text, text, public.user_role, boolean, text, text, text, uuid)
  to service_role;
