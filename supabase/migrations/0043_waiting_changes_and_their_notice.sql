-- The office's list, and the notice that it has something on it.

/** Every correction waiting for an answer, with both figures side by side. */
create or replace function public.waiting_changes(p_limit integer default 50)
returns table (
  id            bigint,
  entry_id      uuid,
  asked_at      timestamptz,
  asked_by_name text,
  reason        text,
  person_name   text,
  system_id     text,
  entry_type    text,
  old_amount    numeric,
  new_amount    numeric,
  old_bill_date date,
  new_bill_date date,
  old_category  text,
  new_category  text,
  old_note      text,
  new_note      text,
  clear_note    boolean,
  photo_count   bigint
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $fn$
begin
  if not public.is_admin() then
    raise exception 'Only an Admin or a Sub-admin can see the change requests.'
      using errcode = 'P0001';
  end if;

  return query
  select
    r.id, r.entry_id, r.asked_at, r.asked_by_name, r.reason,
    u.full_name, e.system_id, e.type::text,
    r.old_amount, r.new_amount,
    r.old_bill_date, r.new_bill_date,
    oc.name, nc.name,
    r.old_note, r.new_note, r.clear_note,
    (select count(*) from public.entry_photos p where p.entry_id = e.id)
  from public.entry_change_requests r
  join public.entries e on e.id = r.entry_id
  left join public.app_users u on u.id = e.person_id
  left join public.expense_categories oc on oc.id = r.old_category
  left join public.expense_categories nc on nc.id = r.new_category
  where r.status = 'waiting' and not e.is_deleted
  order by r.asked_at desc
  limit greatest(p_limit, 1);
end
$fn$;

/**
 * What the office still has to look at: entries nobody has acknowledged,
 * and corrections nobody has answered. One number, because it is one
 * question - is there anything waiting for me.
 */
create or replace function public.open_ticket_count()
returns bigint
language sql
stable
security definer
set search_path = public, pg_temp
as $fn$
  select case when public.is_admin() then (
    (select count(*) from public.entry_tickets t
      join public.entries e on e.id = t.entry_id
     where t.seen_at is null and not e.is_deleted)
    +
    (select count(*) from public.entry_change_requests r
      join public.entries e on e.id = r.entry_id
     where r.status = 'waiting' and not e.is_deleted)
  ) else 0 end;
$fn$;

-- ---------------------------------------------------- telling the phone
/**
 * A correction asked for is the one thing in this app that stops the
 * books until somebody answers it, so it is the one most worth a buzz.
 */
create or replace function public.notify_about_change_request()
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
  if v_url is null or v_secret is null then
    return null;
  end if;

  select jsonb_build_object('ticket', jsonb_build_object(
    'id', new.id,
    'entry_id', new.entry_id,
    'kind', 'request',
    'actor_name', new.asked_by_name,
    'reason', new.reason,
    'amount', coalesce(new.new_amount, new.old_amount),
    'person_name', u.full_name,
    'category_name', c.name
  ))
  into v_body
  from public.entries e
  left join public.app_users u on u.id = e.person_id
  left join public.expense_categories c on c.id = e.category_id
  where e.id = new.entry_id;

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
  -- The request is saved either way. A phone that cannot be reached is
  -- not a reason to lose somebody's correction.
  raise warning 'could not send the notification: %', SQLERRM;
  return null;
end
$fn$;

drop trigger if exists change_requests_notify_trg on public.entry_change_requests;
create trigger change_requests_notify_trg
  after insert on public.entry_change_requests
  for each row execute function public.notify_about_change_request();

revoke all on function public.waiting_changes(integer) from public, anon;
grant execute on function public.waiting_changes(integer) to authenticated;
