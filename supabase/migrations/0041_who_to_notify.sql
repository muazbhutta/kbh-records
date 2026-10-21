-- Who the notification goes to, decided in SQL.
--
-- This was a query built out of PostgREST embedding in the edge
-- function - a join, a filter across it, and row level security all
-- leaning on one another. It returned nothing, and returning nothing is
-- indistinguishable from "there was nobody to tell". Twenty minutes went
-- on which of the three it was.
--
-- Here it is one function, and it can be run and read like anything
-- else in the books.

create or replace function public.push_targets()
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
    and u.role in ('admin', 'sub_admin');
$fn$;

comment on function public.push_targets() is
  'Every browser belonging to the office that has asked to be told.';

/** The sender clears out the ones a push service says are gone. */
create or replace function public.forget_push_targets(p_ids bigint[])
returns void
language sql
security definer
set search_path = public, pg_temp
as $fn$
  delete from public.push_subscriptions where id = any(p_ids);
$fn$;

revoke all on function public.push_targets() from public, anon, authenticated;
revoke all on function public.forget_push_targets(bigint[]) from public, anon, authenticated;
