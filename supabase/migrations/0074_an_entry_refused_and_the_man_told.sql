-- An entry refused, and the man who made it told why.
--
-- The office checks every entry. Until now the only answers it could
-- give were silence and a correction made over the top of somebody's
-- work. There was no way to say "this is wrong, and here is why" and
-- have the man who recorded it find out.
--
-- Half of it was already here and never used. cancel_entry has taken a
-- reason since the beginning; not one entry in 595 has ever been
-- cancelled, because no screen ever called it, and every report
-- function already leaves a cancelled entry out of the books. So the
-- refusing itself needs no inventing - it needs a button, and it needs
-- the reason to travel.
--
-- Nothing already running is altered here. The office's own tickets are
-- a table of their own and are not touched: a refusal deliberately does
-- NOT raise a ticket, because entry_tickets is the office's inbox and
-- open_tickets reads it without looking at kind - a new kind in there
-- would appear in Waiting for you the same afternoon. A refusal travels
-- on the entry's own columns instead, which have been sitting there
-- unused for exactly this.

-- ------------------------------------------------------- has he seen it
/*
 * Whether the man has read the refusal.
 *
 * is_cancelled, cancelled_at, cancelled_by and cancel_reason are all
 * already on the row. The one thing missing was somewhere to record
 * that it had been read, so his screen can stop asking.
 */
alter table public.entries
  add column if not exists cancel_seen_at timestamptz;

comment on column public.entries.cancel_seen_at is
  'When the person who recorded this entry read the refusal. Null while it still needs his eye.';

create index if not exists entries_refused_unseen_idx
  on public.entries (entered_by, cancelled_at desc)
  where is_cancelled and cancel_seen_at is null and not is_deleted;

-- -------------------------------------------------------- the refusing
/*
 * The same patch as always: the live text is read and changed in place,
 * because writing a function out again from memory is how an earlier
 * change gets quietly undone.
 */
create or replace function pg_temp.patch_once(p_src text, p_find text, p_put text)
returns text
language plpgsql
as $helper$
declare
  v_hits integer;
begin
  v_hits := (length(p_src) - length(replace(p_src, p_find, ''))) / length(p_find);
  if v_hits <> 1 then
    raise exception 'Expected to find this once, found % times: %', v_hits, left(p_find, 60);
  end if;
  return replace(p_src, p_find, p_put);
end
$helper$;

do $patch$
declare
  v_src text;
begin
  select pg_get_functiondef(p.oid) into v_src
    from pg_proc p
   where p.proname = 'cancel_entry' and p.pronamespace = 'public'::regnamespace;
  if v_src is null then
    raise exception 'cancel_entry is not there to patch';
  end if;

  /*
   * A refusal without a reason is worse than none: the man is told his
   * work was thrown out and not told what to do differently. It was
   * optional while nothing called this; it cannot stay optional now.
   */
  v_src := pg_temp.patch_once(v_src,
    $q$  if not public.is_admin() then$q$,
    $q$  if coalesce(btrim(p_reason), '') = '' then$q$ || chr(10) ||
    $q$    raise exception 'Say why it is being refused. The person who recorded it is told the reason.'$q$ || chr(10) ||
    $q$      using errcode = 'P0001';$q$ || chr(10) ||
    $q$  end if;$q$ || chr(10) || chr(10) ||
    $q$  if not public.is_admin() then$q$);

  -- is_admin() has meant Admin or Sub-admin all along; only this
  -- sentence said otherwise.
  v_src := pg_temp.patch_once(v_src,
    $q$'Only an Admin can cancel an entry.'$q$,
    $q$'Only an Admin or a Sub-admin can refuse an entry.'$q$);

  -- Who refused it and when. The columns have been on the row from the
  -- start and nothing has ever filled them; his screen needs both.
  v_src := pg_temp.patch_once(v_src,
    $q$         cancel_reason = nullif(btrim(coalesce(p_reason, '')), '')$q$,
    $q$         cancel_reason = nullif(btrim(coalesce(p_reason, '')), ''),$q$ || chr(10) ||
    $q$         cancelled_at  = now(),$q$ || chr(10) ||
    $q$         cancelled_by  = auth.uid(),$q$ || chr(10) ||
    $q$         cancel_seen_at = null$q$);

  execute v_src;
end
$patch$;

/*
 * uncancel_entry is left exactly as it is.
 *
 * It was going to have the seen mark cleared in it, until reading it
 * showed there was nothing to do: it only turns is_cancelled off, and
 * every count below asks for is_cancelled, so a refusal taken back
 * disappears on its own. cancel_entry clears the mark when an entry is
 * refused again. A patch that changes nothing is still a patch that can
 * fail in front of somebody.
 */

-- --------------------------------------------------- what he is shown
/**
 * The entries of mine that were refused, and why.
 *
 * His own only: entered_by is the man who typed it, which is the man
 * who has to put it right. An Admin looking at this sees his own
 * refusals and nobody else's, which is the point - the office has its
 * own screens.
 */
create or replace function public.my_refused_entries(p_limit integer default 50)
returns table (
  id            uuid,
  amount        numeric,
  entry_type    text,
  bill_date     date,
  note          text,
  system_id     text,
  category_name text,
  person_name   text,
  reason        text,
  refused_at    timestamptz,
  refused_by    text,
  seen_at       timestamptz
)
language sql
stable
security definer
set search_path = public, pg_temp
as $fn$
  select e.id, e.amount, e.type::text, e.bill_date, e.note, e.system_id,
         c.name, u.full_name,
         e.cancel_reason, e.cancelled_at, b.full_name, e.cancel_seen_at
    from public.entries e
    left join public.expense_categories c on c.id = e.category_id
    left join public.app_users u on u.id = e.person_id
    left join public.app_users b on b.id = e.cancelled_by
   where e.is_cancelled
     and not e.is_deleted
     and e.entered_by = auth.uid()
   order by e.cancelled_at desc nulls last, e.entered_at desc
   limit greatest(coalesce(p_limit, 50), 1);
$fn$;

/** How many of them he has not read yet, for the mark on the screen. */
create or replace function public.my_refused_count()
returns bigint
language sql
stable
security definer
set search_path = public, pg_temp
as $fn$
  select count(*)
    from public.entries e
   where e.is_cancelled
     and not e.is_deleted
     and e.cancel_seen_at is null
     and e.entered_by = auth.uid();
$fn$;

/** He says he has read it. His own entries only. */
create or replace function public.mark_refusal_seen(p_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
begin
  update public.entries
     set cancel_seen_at = now()
   where id = p_id
     and is_cancelled
     and entered_by = auth.uid()
     and cancel_seen_at is null;
  return p_id;
end
$fn$;

revoke all on function public.my_refused_entries(integer) from public, anon;
revoke all on function public.my_refused_count() from public, anon;
revoke all on function public.mark_refusal_seen(uuid) from public, anon;
grant execute on function public.my_refused_entries(integer) to authenticated;
grant execute on function public.my_refused_count() to authenticated;
grant execute on function public.mark_refusal_seen(uuid) to authenticated;

/**
 * One entry's refusal, for the screen that shows the entry.
 *
 * entry_feed - which every list and every entry screen reads - is left
 * alone. Adding four columns to a view the whole app depends on, to
 * show a thing that is true of two entries in six hundred, is a poor
 * trade when a function beside it will do.
 *
 * The man who recorded it, and the office. Nobody else has any
 * business knowing an entry of somebody else's was turned down.
 */
create or replace function public.entry_refusal(p_id uuid)
returns table (
  is_refused boolean,
  reason     text,
  refused_at timestamptz,
  refused_by text,
  seen_at    timestamptz
)
language sql
stable
security definer
set search_path = public, pg_temp
as $fn$
  select e.is_cancelled, e.cancel_reason, e.cancelled_at, b.full_name, e.cancel_seen_at
    from public.entries e
    left join public.app_users b on b.id = e.cancelled_by
   where e.id = p_id
     and (public.is_admin() or e.entered_by = auth.uid());
$fn$;

revoke all on function public.entry_refusal(uuid) from public, anon;
grant execute on function public.entry_refusal(uuid) to authenticated;

-- ------------------------------------------------------ telling his phone
/**
 * The subscriptions of one person.
 *
 * push_targets - everybody in the office - is left exactly as it is.
 * This is its opposite number: the one man a refusal concerns.
 */
create or replace function public.push_targets_for(p_person uuid)
returns table (id bigint, endpoint text, p256dh text, auth text, full_name text)
language sql
stable
security definer
set search_path = public, pg_temp
as $fn$
  select s.id, s.endpoint, s.p256dh, s.auth, u.full_name
    from public.push_subscriptions s
    join public.app_users u on u.id = s.person_id
   where u.is_active
     and s.person_id = p_person;
$fn$;

revoke all on function public.push_targets_for(uuid) from public, anon, authenticated;

/**
 * The nudge, when an entry is refused.
 *
 * Built exactly like notify_about_ticket and sent to the same door,
 * with a refusal in the parcel instead of a ticket. Like that one it
 * can fail without taking anything down: the refusal is already in the
 * books, and his screen shows it the next time he opens the app.
 */
create or replace function public.notify_about_refusal()
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
  -- Only the moment it turns, and only when there is somebody to tell.
  if new.is_cancelled is not true
     or old.is_cancelled is not distinct from new.is_cancelled
     or new.entered_by is null then
    return null;
  end if;

  select decrypted_secret into v_url
    from vault.decrypted_secrets where name = 'notify_url';
  select decrypted_secret into v_secret
    from vault.decrypted_secrets where name = 'notify_secret';
  if v_url is null or v_secret is null then
    return null;
  end if;

  select jsonb_build_object('refusal', jsonb_build_object(
    'entry_id', new.id,
    'person_id', new.entered_by,
    'reason', new.cancel_reason,
    'amount', new.amount,
    'refused_by', b.full_name,
    'category_name', c.name
  ))
  into v_body
  from (select 1) one
  left join public.app_users b on b.id = new.cancelled_by
  left join public.expense_categories c on c.id = new.category_id;

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
  raise warning 'could not send the refusal notice: %', SQLERRM;
  return null;
end
$fn$;

drop trigger if exists entries_refusal_notify_trg on public.entries;
create trigger entries_refusal_notify_trg
  after update of is_cancelled on public.entries
  for each row execute function public.notify_about_refusal();
