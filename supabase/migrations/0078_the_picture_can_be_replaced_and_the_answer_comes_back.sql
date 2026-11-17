-- The picture can be replaced, the office can see it, and a man hears
-- the answer either way.
--
-- Three things, all of them the same conversation finishing properly.
--
-- 1. A bill refused for its photograph could have a better photograph
--    added and the bad one stayed beside it, so the entry ended up
--    carrying two. The old one can now be taken off the entry.
--
--    Taken off, not destroyed. It is moved to a table of its own and
--    the file is left in the bucket, so the picture the office objected
--    to can still be found by anyone who needs to ask what happened,
--    while nobody has to look at it on the entry any more.
--
--    Moving the row rather than flagging it is deliberate: sixteen
--    different places read entry_photos - reports, duplicate checks,
--    the ledger, the tickets - and a flag would have meant patching
--    every one of them and being wrong about one. A row that is not
--    there is already invisible to all sixteen.
--
-- 2. The office answers a correction without being shown the bill. The
--    card has carried a count of photographs and not the photograph,
--    which on a correction that is entirely about the photograph is the
--    one thing missing.
--
-- 3. And when the office turns a correction down, nothing at all
--    reached the man who asked. His notice had gone from his screen the
--    moment he sent the correction, which was right while it was
--    waiting and wrong the moment it was refused: he had been told his
--    entry was not accepted, he had done what he was asked, and then
--    silence. The notice comes back, with what the office said, and his
--    phone is told the same way it was told the first time.

-- ------------------------------------------------- 1. the picture taken off
create table if not exists public.entry_photos_removed (
  /** The id it had on the entry, so the two can be matched up later. */
  id           uuid primary key,
  entry_id     uuid not null references public.entries (id) on delete cascade,
  storage_path text not null,
  thumb_path   text,
  sha256       text,
  phash        text,
  width        integer,
  height       integer,
  bytes        integer,
  position     smallint,
  created_at   timestamptz,
  removed_at   timestamptz not null default now(),
  removed_by   uuid references public.app_users (id) on delete set null
);

comment on table public.entry_photos_removed is
  'Bill photographs taken off an entry. Kept, with their files, so a picture the office objected to can still be found.';

create index if not exists entry_photos_removed_entry_idx
  on public.entry_photos_removed (entry_id);

alter table public.entry_photos_removed enable row level security;

-- Nobody reads it through the app. It is a record, for the books and
-- for whoever has to ask what happened, not a screen.
revoke all on public.entry_photos_removed from public, anon, authenticated;

/**
 * Takes a photograph off an entry.
 *
 * The office, or the man whose entry it is - the same rule that decides
 * who may add one. The row moves to entry_photos_removed and the file
 * stays where it is.
 */
create or replace function public.remove_entry_photo(p_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_photo public.entry_photos;
  v_entry public.entries;
begin
  if not public.is_active_user() then
    raise exception 'Your account is turned off.' using errcode = 'P0001';
  end if;

  select * into v_photo from public.entry_photos where id = p_id;
  if not found then
    raise exception 'That photo was not found.' using errcode = 'P0001';
  end if;

  select * into v_entry from public.entries where id = v_photo.entry_id;

  if not public.is_admin() and v_entry.person_id <> auth.uid() then
    raise exception 'You can only change the photos on your own entry.' using errcode = 'P0001';
  end if;
  if v_entry.is_deleted then
    raise exception 'That entry is not in the books any more.' using errcode = 'P0001';
  end if;

  insert into public.entry_photos_removed
    (id, entry_id, storage_path, thumb_path, sha256, phash,
     width, height, bytes, position, created_at, removed_by)
  values
    (v_photo.id, v_photo.entry_id, v_photo.storage_path, v_photo.thumb_path,
     v_photo.sha256, v_photo.phash, v_photo.width, v_photo.height,
     v_photo.bytes, v_photo.position, v_photo.created_at, auth.uid())
  on conflict (id) do nothing;

  delete from public.entry_photos where id = p_id;

  return v_photo.entry_id;
end
$fn$;

revoke all on function public.remove_entry_photo(uuid) from public, anon;
grant execute on function public.remove_entry_photo(uuid) to authenticated;

-- --------------------------------------- 2. the office is shown the bill
create or replace function pg_temp.patch_once(p_src text, p_find text, p_put text)
returns text
language plpgsql
as $helper$
declare
  v_hits integer;
begin
  v_hits := (length(p_src) - length(replace(p_src, p_find, ''))) / length(p_find);
  if v_hits <> 1 then
    raise exception 'Expected this once, found %: %', v_hits, left(p_find, 50);
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
   where p.proname = 'waiting_changes' and p.pronamespace = 'public'::regnamespace;
  if v_src is null then
    raise exception 'waiting_changes is not there to patch';
  end if;

  v_src := pg_temp.patch_once(v_src,
    $q$clear_note boolean, photo_count bigint)$q$,
    $q$clear_note boolean, photo_count bigint, thumb_path text, storage_path text)$q$);

  v_src := pg_temp.patch_once(v_src,
    $q$    (select count(*) from public.entry_photos p where p.entry_id = e.id)$q$,
    $q$    (select count(*) from public.entry_photos p where p.entry_id = e.id),$q$ || chr(10) ||
    $q$    (select p.thumb_path from public.entry_photos p$q$ || chr(10) ||
    $q$      where p.entry_id = e.id order by p.position limit 1),$q$ || chr(10) ||
    $q$    (select p.storage_path from public.entry_photos p$q$ || chr(10) ||
    $q$      where p.entry_id = e.id order by p.position limit 1)$q$);

  -- A column added to what it hands back changes its type.
  execute 'drop function public.waiting_changes(integer)';
  execute v_src;
end
$patch$;

revoke all on function public.waiting_changes(integer) from public, anon;
grant execute on function public.waiting_changes(integer) to authenticated;

-- ------------------------------- 3. he hears it when his correction is refused
do $patch$
declare
  v_src text;
begin
  select pg_get_functiondef(p.oid) into v_src
    from pg_proc p
   where p.proname = 'decide_entry_change' and p.pronamespace = 'public'::regnamespace;
  if v_src is null then
    raise exception 'decide_entry_change is not there to patch';
  end if;

  /*
   * Turning a correction down puts the notice back on his screen.
   *
   * It came off when he sent the correction, which was right while it
   * was waiting. The moment it is refused he is back where he started
   * and does not know it: told his entry was not accepted, asked to put
   * it right, did so, and then nothing. The mark goes back to null, his
   * card returns, and the trigger below takes it to his phone.
   *
   * What the office said is carried in a setting rather than written
   * over cancel_reason, because the first reason is still true and is
   * still the reason the entry is out of the books.
   */
  v_src := pg_temp.patch_once(v_src,
    $q$  update public.entry_change_requests$q$,
    $q$  if not p_approve then$q$ || chr(10) ||
    $q$    perform set_config('kbh.turned_down',$q$ || chr(10) ||
    $q$      coalesce(nullif(btrim(coalesce(p_note, '')), ''), 'No reason was given.'), true);$q$ || chr(10) ||
    $q$    update public.entries$q$ || chr(10) ||
    $q$       set cancel_seen_at = null$q$ || chr(10) ||
    $q$     where id = v_req.entry_id and is_cancelled;$q$ || chr(10) ||
    $q$  end if;$q$ || chr(10) || chr(10) ||
    $q$  update public.entry_change_requests$q$);

  execute v_src;
end
$patch$;

/**
 * The notice going back up is itself worth telling him about.
 *
 * notify_about_refusal fired when an entry turned refused. It now also
 * fires when the notice is put back on a refused entry, which is the
 * one other moment he needs to hear from the office and the only other
 * moment the mark goes back to null.
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
  v_fresh  boolean;
  v_again  boolean;
  v_note   text;
begin
  if new.is_cancelled is not true or new.entered_by is null then
    return null;
  end if;

  -- Just refused, or just told again.
  v_fresh := old.is_cancelled is distinct from new.is_cancelled;
  v_again := new.cancel_seen_at is null and old.cancel_seen_at is not null;
  if not v_fresh and not v_again then
    return null;
  end if;

  select decrypted_secret into v_url
    from vault.decrypted_secrets where name = 'notify_url';
  select decrypted_secret into v_secret
    from vault.decrypted_secrets where name = 'notify_secret';
  if v_url is null or v_secret is null then
    return null;
  end if;

  v_note := nullif(current_setting('kbh.turned_down', true), '');

  select jsonb_build_object('refusal', jsonb_build_object(
    'entry_id', new.id,
    'person_id', new.entered_by,
    'reason', coalesce(v_note, new.cancel_reason),
    'amount', new.amount,
    'refused_by', b.full_name,
    'category_name', c.name,
    'again', (v_again and v_note is not null)
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
  after update of is_cancelled, cancel_seen_at on public.entries
  for each row execute function public.notify_about_refusal();

-- ------------------------------------------- and his screen says which it is
drop function if exists public.my_refused_entries(integer);

create function public.my_refused_entries(p_limit integer default 50)
returns table (
  id            uuid,
  amount        numeric,
  entry_type    text,
  bill_date     date,
  note          text,
  system_id     text,
  category_name text,
  person_id     uuid,
  person_name   text,
  reason        text,
  refused_at    timestamptz,
  refused_by    text,
  seen_at       timestamptz,
  /** True while a correction of his is sitting with the office. */
  asked         boolean,
  /** What the office said if it turned his last correction down. */
  turned_down   text
)
language sql
stable
security definer
set search_path = public, pg_temp
as $fn$
  select e.id, e.amount, e.type::text, e.bill_date, e.note, e.system_id,
         c.name, e.person_id, u.full_name,
         e.cancel_reason, e.cancelled_at, b.full_name, e.cancel_seen_at,
         exists (select 1 from public.entry_change_requests r
                  where r.entry_id = e.id and r.status = 'waiting'),
         (select r.decision_note from public.entry_change_requests r
           where r.entry_id = e.id and r.status = 'refused'
             and r.decided_at is not null
           order by r.decided_at desc limit 1)
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

revoke all on function public.my_refused_entries(integer) from public, anon;
grant execute on function public.my_refused_entries(integer) to authenticated;
