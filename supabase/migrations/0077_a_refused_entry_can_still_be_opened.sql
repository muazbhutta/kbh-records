-- A refused entry can still be opened.
--
-- "Fix This Entry" led to "You can only correct your own entries." on
-- an entry the man had recorded himself, which was true of neither
-- half of the sentence. The screen was not refusing him: it never got
-- the entry at all, and a screen with no entry in its hand cannot tell
-- whose it is, so it said the only thing it knew how to say.
--
-- entry_feed is the ledger, and it is built on entry_lines, which drops
-- anything cancelled. That is right: a refused entry is out of the
-- books and must not appear in a balance. But the two screens that read
-- the ledger for one entry at a time - opening it, and correcting it -
-- are not asking it for a balance. They are asking it for the entry,
-- and for a refused one it handed back nothing.
--
-- So a second pair of views beside the first, identical but for the one
-- condition, and only those two screens read them. The ledger is not
-- touched: no balance, no report and no total can reach these.
--
-- Both are built by copying the live definitions and changing the one
-- thing, rather than by writing them out again, so they cannot quietly
-- drift away from the originals on the day they are made. Both carry
-- security_invoker, exactly as the originals do, so the same row
-- security decides who may see which entry: an Admin, the man it is
-- about, and the man on the other side of a transfer. Nothing is opened
-- up here but the one condition.

create or replace function pg_temp.patch_times(p_src text, p_find text, p_put text, p_times integer)
returns text
language plpgsql
as $helper$
declare
  v_hits integer;
begin
  v_hits := (length(p_src) - length(replace(p_src, p_find, ''))) / length(p_find);
  if v_hits <> p_times then
    raise exception 'Expected % of "%", found %', p_times, left(p_find, 50), v_hits;
  end if;
  return replace(p_src, p_find, p_put);
end
$helper$;

do $build$
declare
  v_lines text;
  v_feed  text;
begin
  -- ------------------------------------------------- the lines, cancelled and all
  v_lines := pg_get_viewdef('public.entry_lines'::regclass);

  -- Once for the ordinary line, once for the other side of a transfer.
  v_lines := pg_temp.patch_times(
    v_lines,
    '(NOT e.is_deleted) AND (NOT e.is_cancelled)',
    '(NOT e.is_deleted)',
    2);

  execute 'create or replace view public.entry_lines_any with (security_invoker=true) as '
       || v_lines;

  -- ------------------------------------------------------- and the feed over them
  v_feed := pg_get_viewdef('public.entry_feed'::regclass);

  v_feed := pg_temp.patch_times(v_feed, 'entry_lines l', 'entry_lines_any l', 1);

  execute 'create or replace view public.entry_feed_any with (security_invoker=true) as '
       || v_feed;
end
$build$;

comment on view public.entry_lines_any is
  'entry_lines, keeping the cancelled ones. For opening a single entry, never for a balance.';
comment on view public.entry_feed_any is
  'entry_feed, keeping the cancelled ones. Read only by the screens that open one entry and correct it.';

grant select on public.entry_lines_any to authenticated;
grant select on public.entry_feed_any to authenticated;
revoke all on public.entry_lines_any from anon;
revoke all on public.entry_feed_any from anon;
