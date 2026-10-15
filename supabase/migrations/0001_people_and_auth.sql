-- =====================================================================
--  Migration 0001 - People, roles and the PIN login
-- ---------------------------------------------------------------------
--  Every person who uses KBH Records, the role that decides what they can
--  reach, and the hashed PIN they sign in with.
--
--  Three rules live in here and are enforced by the database itself, not
--  by the screens:
--    * the Owner can never be deleted, turned off or taken off Admin;
--    * nobody can read a PIN hash, not even an Admin;
--    * a person cannot promote themselves.
--
--  This file was rebuilt from the live database after the original was
--  lost, so it says exactly what is running.
-- =====================================================================

-- The three roles. Admin and Sub-admin have the same powers; the Owner is
-- an Admin with a flag that cannot be taken off.
do $$
begin
  if not exists (select 1 from pg_type where typname = 'user_role') then
    create type public.user_role as enum ('admin', 'sub_admin', 'employee');
  end if;
end
$$;

-- ============================================ app_users
create table if not exists public.app_users (
  id uuid not null,
  full_name text not null,
  mobile text not null,
  role user_role default 'employee'::user_role not null,
  is_owner boolean default false not null,
  is_active boolean default true not null,
  job_title text,
  created_at timestamp with time zone default now() not null,
  created_by uuid,
  updated_at timestamp with time zone default now() not null,
  disabled_at timestamp with time zone,
  is_head boolean default false not null,
  head_id uuid,
  PRIMARY KEY (id),
  CHECK (((length(btrim(full_name)) >= 2) AND (length(btrim(full_name)) <= 80))),
  CHECK ((mobile ~ '^9665[0-9]{8}$'::text)),
  FOREIGN KEY (created_by) REFERENCES app_users(id) ON DELETE SET NULL,
  FOREIGN KEY (head_id) REFERENCES app_users(id) ON DELETE SET NULL,
  FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE RESTRICT
);
create unique index if not exists app_users_mobile_key ON public.app_users USING btree (mobile);
create unique index if not exists app_users_one_owner ON public.app_users USING btree (is_owner) WHERE is_owner;
create index if not exists app_users_role_active_idx ON public.app_users USING btree (role, is_active);
create index if not exists app_users_name_idx ON public.app_users USING btree (lower(full_name));
create index if not exists app_users_head_idx ON public.app_users USING btree (head_id) WHERE (head_id IS NOT NULL);
create index if not exists app_users_is_head_idx ON public.app_users USING btree (is_head) WHERE is_head;

alter table public.app_users enable row level security;
-- Not signed in means not a word of this table.
revoke all on table public.app_users from anon;
grant select, insert, update on table public.app_users to authenticated;
grant delete, insert, references, select, trigger, truncate, update on table public.app_users to service_role;

drop policy if exists app_users_select on public.app_users;
create policy app_users_select on public.app_users
  for select to authenticated
  using ((((id = auth.uid()) AND is_active) OR is_admin()));

drop policy if exists app_users_update_admin on public.app_users;
create policy app_users_update_admin on public.app_users
  for update to authenticated
  using (is_admin())
  with check (is_admin());

-- ============================================ user_secrets
create table if not exists public.user_secrets (
  user_id uuid not null,
  pin_hash text not null,
  auth_password text not null,
  failed_attempts smallint default 0 not null,
  locked_until timestamp with time zone,
  pin_set_at timestamp with time zone default now() not null,
  pin_set_by uuid,
  PRIMARY KEY (user_id),
  FOREIGN KEY (pin_set_by) REFERENCES app_users(id) ON DELETE SET NULL,
  FOREIGN KEY (user_id) REFERENCES app_users(id) ON DELETE CASCADE
);

alter table public.user_secrets enable row level security;
grant delete, insert, references, select, trigger, truncate, update on table public.user_secrets to service_role;

-- ============================================ login_attempts
create table if not exists public.login_attempts (
  id bigint not null,
  mobile text not null,
  user_id uuid,
  success boolean not null,
  reason text,
  at timestamp with time zone default now() not null,
  PRIMARY KEY (id),
  FOREIGN KEY (user_id) REFERENCES app_users(id) ON DELETE SET NULL
);
create index if not exists login_attempts_mobile_at_idx ON public.login_attempts USING btree (mobile, at DESC);
create index if not exists login_attempts_at_idx ON public.login_attempts USING btree (at DESC);

alter table public.login_attempts enable row level security;
grant select on table public.login_attempts to authenticated;
grant delete, insert, references, select, trigger, truncate, update on table public.login_attempts to service_role;

drop policy if exists login_attempts_select_admin on public.login_attempts;
create policy login_attempts_select_admin on public.login_attempts
  for select to authenticated
  using (is_admin());


-- ============================================ the rules themselves

create or replace function public.current_app_role()
 RETURNS user_role
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  select u.role
    from public.app_users u
   where u.id = auth.uid() and u.is_active;
$function$
;

create or replace function public.is_admin()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  select coalesce(
    (select u.is_active and u.role in ('admin', 'sub_admin')
       from public.app_users u
      where u.id = auth.uid()),
    false);
$function$
;

create or replace function public.is_active_user()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  select coalesce((select u.is_active from public.app_users u where u.id = auth.uid()), false);
$function$
;

create or replace function public.app_users_insert_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
  if new.is_owner and new.role <> 'admin' then
    raise exception 'The Owner account must be an Admin.' using errcode = 'P0001';
  end if;
  return new;
end
$function$
;

create or replace function public.app_users_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
  if tg_op = 'DELETE' then
    raise exception
      'People are never deleted in KBH Records. Disable the account instead.'
      using errcode = 'P0001';
  end if;

  -- The Owner flag can never be taken away, moved, or granted to anyone else.
  if old.is_owner and not new.is_owner then
    raise exception 'The Owner account cannot be downgraded.' using errcode = 'P0001';
  end if;
  if new.is_owner and not old.is_owner then
    raise exception 'The Owner flag cannot be moved to another account.' using errcode = 'P0001';
  end if;

  if old.is_owner then
    if not new.is_active then
      raise exception 'The Owner account cannot be disabled.' using errcode = 'P0001';
    end if;
    if new.role <> 'admin' then
      raise exception 'The Owner account must stay an Admin.' using errcode = 'P0001';
    end if;
  end if;

  new.updated_at := now();

  if new.is_active and not old.is_active then
    new.disabled_at := null;
  elsif not new.is_active and old.is_active then
    new.disabled_at := now();
  end if;

  return new;
end
$function$
;

create or replace function public.app_users_head_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_walk  uuid;
  v_steps int := 0;
  v_team  int;
begin
  if new.head_id is not null then
    if new.head_id = new.id then
      raise exception 'A person cannot work under themselves.' using errcode = 'P0001';
    end if;

    if not exists (select 1 from public.app_users h where h.id = new.head_id and h.is_head) then
      raise exception 'That person is not a head.' using errcode = 'P0001';
    end if;

    -- Walk up the chain so a team can never loop back on itself.
    v_walk := new.head_id;
    while v_walk is not null and v_steps < 25 loop
      if v_walk = new.id then
        raise exception 'That would put the team in a circle.' using errcode = 'P0001';
      end if;
      select head_id into v_walk from public.app_users where id = v_walk;
      v_steps := v_steps + 1;
    end loop;
  end if;

  -- A head with people under them stays a head until the team is moved.
  if tg_op = 'UPDATE' and old.is_head and not new.is_head then
    select count(*) into v_team
      from public.app_users u
     where u.head_id = new.id;
    if v_team > 0 then
      raise exception
        '% % under this head. Move them to another head first.',
        v_team, case when v_team = 1 then 'person works' else 'people work' end
        using errcode = 'P0001';
    end if;
  end if;

  return new;
end
$function$
;

create or replace function public.create_person(p_id uuid, p_full_name text, p_mobile text, p_role user_role, p_is_owner boolean, p_pin_hash text, p_auth_password text, p_job_title text DEFAULT NULL::text, p_created_by uuid DEFAULT NULL::uuid)
 RETURNS app_users
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
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
$function$
;

create or replace function public.set_person_pin(p_user_id uuid, p_pin_hash text, p_set_by uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
  update public.user_secrets
     set pin_hash        = p_pin_hash,
         failed_attempts = 0,
         locked_until    = null,
         pin_set_at      = now(),
         pin_set_by      = p_set_by
   where user_id = p_user_id;

  if not found then
    raise exception 'No PIN record for this person.' using errcode = 'P0001';
  end if;
end
$function$
;


-- ============================================ triggers

drop trigger if exists app_users_guard_trg on public.app_users;
create trigger app_users_guard_trg BEFORE DELETE OR UPDATE ON public.app_users FOR EACH ROW EXECUTE FUNCTION app_users_guard();

drop trigger if exists app_users_head_guard_trg on public.app_users;
create trigger app_users_head_guard_trg BEFORE INSERT OR UPDATE ON public.app_users FOR EACH ROW EXECUTE FUNCTION app_users_head_guard();

drop trigger if exists app_users_insert_guard_trg on public.app_users;
create trigger app_users_insert_guard_trg BEFORE INSERT ON public.app_users FOR EACH ROW EXECUTE FUNCTION app_users_insert_guard();

-- The change history itself is built in 0003, so on a fresh database this
-- trigger waits for it; 0003 puts it on.
do $$
begin
  if exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
              where n.nspname = 'public' and p.proname = 'audit_row') then
    drop trigger if exists audit_app_users_trg on public.app_users;
    create trigger audit_app_users_trg
      after insert or update on public.app_users
      for each row execute function public.audit_row('id');
  end if;
end
$$;
