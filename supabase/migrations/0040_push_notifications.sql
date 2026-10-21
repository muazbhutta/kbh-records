-- The phone notification.
--
-- A ticket already goes into the books the moment an entry is recorded
-- or corrected, and the Waiting for you list is the truth. This is the
-- nudge on top: the office's phones buzz without anybody having to open
-- the app and look.
--
-- It is deliberately the lesser half. If a phone is off, if a browser
-- has thrown its subscription away, if the sending falls over entirely,
-- nothing is lost - the ticket is still there to be seen. A notice
-- people come to depend on must never be the only copy of itself.
--
-- A subscription belongs to a browser on a phone, not to a person: the
-- same man has one for the phone in his pocket and another for the
-- office computer, and turning it off on one leaves the other alone.

create extension if not exists pg_net with schema extensions;

create table if not exists public.push_subscriptions (
  id         bigint generated always as identity primary key,
  person_id  uuid not null references public.app_users (id) on delete cascade,
  /** The address the push service gave this browser. One row per browser. */
  endpoint   text not null unique,
  p256dh     text not null,
  auth       text not null,
  /** Only so a person can tell their phone from their desk in a list. */
  label      text,
  created_at timestamptz not null default now()
);

comment on table public.push_subscriptions is
  'One per browser that has agreed to be told. Dead ones are cleared as they are found.';

create index if not exists push_subscriptions_person_idx
  on public.push_subscriptions (person_id);

alter table public.push_subscriptions enable row level security;

drop policy if exists push_own on public.push_subscriptions;
create policy push_own on public.push_subscriptions
  for all to authenticated
  using (person_id = auth.uid())
  with check (person_id = auth.uid());

comment on policy push_own on public.push_subscriptions is
  'A person manages their own browsers and sees nobody else''s.';

grant select, insert, update, delete on public.push_subscriptions to authenticated;

-- ------------------------------------------------------- turning it on
create or replace function public.save_push_subscription(
  p_endpoint text,
  p_p256dh   text,
  p_auth     text,
  p_label    text default null
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
begin
  if not public.is_active_user() then
    raise exception 'Your account is turned off.' using errcode = 'P0001';
  end if;

  insert into public.push_subscriptions (person_id, endpoint, p256dh, auth, label)
  values (auth.uid(), p_endpoint, p_p256dh, p_auth, nullif(btrim(coalesce(p_label, '')), ''))
  on conflict (endpoint) do update
    set person_id = auth.uid(),
        p256dh    = excluded.p256dh,
        auth      = excluded.auth,
        label     = coalesce(excluded.label, public.push_subscriptions.label);
end
$fn$;

create or replace function public.forget_push_subscription(p_endpoint text)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
begin
  delete from public.push_subscriptions
   where endpoint = p_endpoint and person_id = auth.uid();
end
$fn$;

revoke all on function public.save_push_subscription(text, text, text, text) from public, anon;
revoke all on function public.forget_push_subscription(text) from public, anon;
grant execute on function public.save_push_subscription(text, text, text, text) to authenticated;
grant execute on function public.forget_push_subscription(text) to authenticated;

-- --------------------------------------------------------- the sending
/**
 * Where to send, and the secret that proves it is us asking.
 *
 * Kept in the vault rather than written here, because this file is in a
 * public repository. Set them once with:
 *
 *   select vault.create_secret('<url>',    'notify_url');
 *   select vault.create_secret('<secret>', 'notify_secret');
 */
create or replace function public.notify_about_ticket()
returns trigger
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $fn$
declare
  v_url    text;
  v_secret text;
  v_body   jsonb;
begin
  select decrypted_secret into v_url
    from vault.decrypted_secrets where name = 'notify_url';
  select decrypted_secret into v_secret
    from vault.decrypted_secrets where name = 'notify_secret';

  -- Not set up yet, or switched off. The ticket still stands.
  if v_url is null or v_secret is null then
    return null;
  end if;

  select jsonb_build_object('ticket', jsonb_build_object(
    'id', new.id,
    'entry_id', new.entry_id,
    'kind', new.kind,
    'actor_name', new.actor_name,
    'reason', new.reason,
    'amount', e.amount,
    'person_name', u.full_name,
    'category_name', c.name
  ))
  into v_body
  from public.entries e
  left join public.app_users u on u.id = e.person_id
  left join public.expense_categories c on c.id = e.category_id
  where e.id = new.entry_id;

  -- net.http_post returns at once and does the sending behind us, so a
  -- slow push service can never hold up the man saving his expense.
  perform net.http_post(
    url     := v_url,
    headers := jsonb_build_object(
                 'Content-Type', 'application/json',
                 'x-kbh-notify', v_secret),
    body    := v_body,
    timeout_milliseconds := 5000
  );

  return null;
exception when others then
  -- The books come first. A notification that cannot be sent is not a
  -- reason to refuse somebody's expense.
  raise warning 'could not send the notification: %', SQLERRM;
  return null;
end
$fn$;

drop trigger if exists entry_tickets_notify_trg on public.entry_tickets;
create trigger entry_tickets_notify_trg
  after insert on public.entry_tickets
  for each row execute function public.notify_about_ticket();
