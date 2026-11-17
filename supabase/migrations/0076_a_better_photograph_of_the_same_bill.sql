-- A better photograph of the same bill.
--
-- Most refusals will be about the paper: the photograph is dark, or
-- half the total is off the edge, or a thumb is over the date. The man
-- can now correct the figures on a refused entry and send it back, and
-- he still cannot do the one thing he was actually asked to do, which
-- is take the picture again.
--
-- Photographs could only ever be attached while an entry was being
-- recorded. This lets them be added to one already in the books.
--
-- Added, and never taken away. A man must not be able to remove the
-- photograph the office is objecting to - that is evidence, and an
-- entry whose bill can be swapped out quietly is worth less than one
-- with no bill at all. The dark photograph stays where it is and the
-- clear one joins it, so whoever looks later sees both and sees what
-- happened.
--
-- It needs no approval. A photograph moves no money: it is the thing
-- the figures are evidenced by, not one of them. The figures still go
-- the long way round, through a request the office answers.

create or replace function public.add_entry_photos(p_entry_id uuid, p_photos jsonb)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_entry  public.entries;
  v_photo  jsonb;
  v_have   integer;
  v_next   integer;
  v_added  integer := 0;
  /** The same ceiling the recording screen keeps. */
  v_most   constant integer := 5;
begin
  if not public.is_active_user() then
    raise exception 'Your account is turned off.' using errcode = 'P0001';
  end if;

  select * into v_entry from public.entries where id = p_entry_id;
  if not found then
    raise exception 'That entry was not found.' using errcode = 'P0001';
  end if;

  /*
   * The office, or the man whose entry it is.
   *
   * The same rule the editing screen keeps, so a man who may correct
   * the figures on an entry may also photograph it again. A refused
   * entry is included on purpose: it is the one most likely to need it.
   */
  if not public.is_admin() and v_entry.person_id <> auth.uid() then
    raise exception 'You can only add a photo to your own entry.' using errcode = 'P0001';
  end if;

  if v_entry.is_deleted then
    raise exception 'That entry is not in the books any more.' using errcode = 'P0001';
  end if;

  select count(*), coalesce(max(position), -1) + 1
    into v_have, v_next
    from public.entry_photos where entry_id = p_entry_id;

  for v_photo in select * from jsonb_array_elements(coalesce(p_photos, '[]'::jsonb))
  loop
    if v_have + v_added >= v_most then
      raise exception 'An entry can hold % photos. Nothing was added.', v_most
        using errcode = 'P0001';
    end if;

    insert into public.entry_photos
      (entry_id, storage_path, thumb_path, sha256, phash, width, height, bytes, position)
    values (
      p_entry_id,
      v_photo ->> 'storage_path',
      v_photo ->> 'thumb_path',
      v_photo ->> 'sha256',
      nullif(v_photo ->> 'phash', ''),
      (v_photo ->> 'width')::int,
      (v_photo ->> 'height')::int,
      (v_photo ->> 'bytes')::int,
      v_next + v_added
    );
    v_added := v_added + 1;
  end loop;

  return v_added;
end
$fn$;

revoke all on function public.add_entry_photos(uuid, jsonb) from public, anon;
grant execute on function public.add_entry_photos(uuid, jsonb) to authenticated;

comment on function public.add_entry_photos(uuid, jsonb) is
  'Adds photographs to an entry already in the books. Never removes one: the picture the office objected to stays beside the new one.';
