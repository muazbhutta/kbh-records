-- A refused entry can be put right, and the office still decides.
--
-- Telling a man his entry was not accepted, and why, and then giving
-- him nothing to do about it but record the whole thing again is half
-- a conversation. He should be able to correct the thing he got wrong.
--
-- But a refusal is the office's decision, and a man must not be able to
-- overturn it by editing his way back into the books. So the correction
-- travels the road that already exists for every other correction an
-- employee makes: he asks, the office looks at both figures, and the
-- books move when the office says so. The only thing added is what that
-- approval now means for an entry that was refused - it comes back.
--
-- Three changes, each on a function that is already carrying this kind
-- of work:
--
--   request_entry_change  stops turning away a refused entry, and takes
--                         the notice off his screen when he acts on it
--   decide_entry_change   brings a refused entry back into the books
--                         when the office approves the correction
--   my_refused_entries    hands back person_id as well, so his screen
--                         can open the entry for editing
--
-- A deleted entry is still turned away. Deleted is the office tidying
-- up; refused is the office answering him.

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

-- ------------------------------------------------------------ he asks
do $patch$
declare
  v_src text;
begin
  select pg_get_functiondef(p.oid) into v_src
    from pg_proc p
   where p.proname = 'request_entry_change' and p.pronamespace = 'public'::regnamespace;
  if v_src is null then
    raise exception 'request_entry_change is not there to patch';
  end if;

  /*
   * A refused entry is the one he most needs to correct.
   *
   * Both were turned away together while a refusal had nowhere to be
   * seen and nothing to be done about it. Deleted stays turned away:
   * there is no conversation to be had about an entry the office has
   * taken off the books for its own reasons.
   */
  v_src := pg_temp.patch_once(v_src,
    $q$  if v_entry.is_deleted or v_entry.is_cancelled then$q$ || chr(10) ||
    $q$    raise exception 'That entry is not in the books any more.' using errcode = 'P0001';$q$,
    $q$  if v_entry.is_deleted then$q$ || chr(10) ||
    $q$    raise exception 'That entry is not in the books any more.' using errcode = 'P0001';$q$);

  /*
   * And asking is acting on it.
   *
   * The notice on his home screen is there to be dealt with. A man who
   * has read why his entry was refused and sent back a correction has
   * dealt with it, and leaving the card up afterwards asks him to deal
   * with it twice.
   */
  v_src := pg_temp.patch_once(v_src,
    $q$  returning id into v_id;$q$,
    $q$  returning id into v_id;$q$ || chr(10) || chr(10) ||
    $q$  update public.entries$q$ || chr(10) ||
    $q$     set cancel_seen_at = now()$q$ || chr(10) ||
    $q$   where id = p_entry_id and is_cancelled and cancel_seen_at is null;$q$);

  execute v_src;
end
$patch$;

-- ------------------------------------------------------ the office answers
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
   * Approving a correction to a refused entry is accepting the entry.
   *
   * Anything else leaves it corrected and still out of the books, which
   * is the office saying yes and no in the same breath. Only when it
   * was refused: a plain approval on a live entry has nothing to undo.
   *
   * No ticket is raised by this. The office has just this moment
   * looked at it, which is what approving means.
   */
  v_src := pg_temp.patch_once(v_src,
    $q$     where id = v_req.entry_id;$q$,
    $q$     where id = v_req.entry_id;$q$ || chr(10) || chr(10) ||
    $q$    update public.entries$q$ || chr(10) ||
    $q$       set is_cancelled = false,$q$ || chr(10) ||
    $q$           cancel_seen_at = now()$q$ || chr(10) ||
    $q$     where id = v_req.entry_id and is_cancelled;$q$);

  execute v_src;
end
$patch$;

-- ------------------------------------------------- what his screen is told
/*
 * person_id as well as the name.
 *
 * The edit screen is opened with the person the entry is about, and it
 * turns away anybody else, so the card cannot offer to open it without
 * knowing who that is.
 */
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
  /** True while he has a correction sitting with the office. */
  asked         boolean
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
                  where r.entry_id = e.id and r.status = 'waiting')
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
