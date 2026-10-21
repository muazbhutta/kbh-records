-- A man's correction waits for the office before it touches the books.
--
-- Until now an employee's edit went straight in and the office was told
-- afterwards. That is the wrong way round for money: by the time anybody
-- looked, the figure had already changed and the old one was only in the
-- history. The office should see what is being asked before the books
-- say it.
--
-- So an employee does not edit. He asks. The entry does not move, the
-- change history says nothing, and the office gets a notification with
-- the old figure beside the new one and the reason in his own words.
-- When it is approved the change is applied for real - and only then
-- does it become part of the record.
--
-- The office still edits directly. There is nobody above them to ask,
-- and an approval you grant yourself is a form filled in for its own
-- sake.

create table if not exists public.entry_change_requests (
  id            bigint generated always as identity primary key,
  entry_id      uuid not null references public.entries (id) on delete cascade,

  asked_by      uuid references public.app_users (id) on delete set null,
  asked_by_name text,
  asked_at      timestamptz not null default now(),
  /** In his own words. The office reads this before deciding. */
  reason        text not null,

  -- What he is asking for. Null means "leave this one alone".
  new_amount    numeric(12, 2),
  new_bill_date date,
  new_category  uuid references public.expense_categories (id) on delete set null,
  new_note      text,
  clear_note    boolean not null default false,

  -- What it said when he asked, so the office sees both sides even if
  -- something else moves in the meantime.
  old_amount    numeric(12, 2) not null,
  old_bill_date date not null,
  old_category  uuid references public.expense_categories (id) on delete set null,
  old_note      text,

  status        text not null default 'waiting'
                check (status in ('waiting', 'approved', 'refused')),
  decided_by    uuid references public.app_users (id) on delete set null,
  decided_by_name text,
  decided_at    timestamptz,
  /** Why it was refused, if it was. */
  decision_note text
);

comment on table public.entry_change_requests is
  'A correction asked for and not yet applied. The entry does not move until it is approved.';

create index if not exists entry_change_requests_waiting_idx
  on public.entry_change_requests (asked_at desc) where status = 'waiting';
create index if not exists entry_change_requests_entry_idx
  on public.entry_change_requests (entry_id);

alter table public.entry_change_requests enable row level security;

drop policy if exists change_requests_select on public.entry_change_requests;
create policy change_requests_select on public.entry_change_requests
  for select to authenticated
  using (public.is_admin() or asked_by = auth.uid());

comment on policy change_requests_select on public.entry_change_requests is
  'The office sees every request. A man sees the ones he asked for.';

grant select on public.entry_change_requests to authenticated;

-- ---------------------------------------------------------- the asking
/**
 * Ask for a correction. Nothing in the books moves.
 *
 * One waiting request per entry: asking twice over the same entry
 * replaces the first, because two different answers to the same question
 * is how an office ends up applying both.
 */
create or replace function public.request_entry_change(
  p_entry_id    uuid,
  p_reason      text,
  p_amount      numeric default null,
  p_bill_date   date default null,
  p_category_id uuid default null,
  p_note        text default null,
  p_clear_note  boolean default false
)
returns bigint
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_entry  public.entries;
  v_reason text := btrim(coalesce(p_reason, ''));
  v_name   text;
  v_id     bigint;
begin
  if not public.is_active_user() then
    raise exception 'Your account is turned off.' using errcode = 'P0001';
  end if;

  select * into v_entry from public.entries where id = p_entry_id;
  if not found then
    raise exception 'That entry was not found.' using errcode = 'P0001';
  end if;

  if v_entry.person_id <> auth.uid() then
    raise exception 'You can only ask about your own entries.' using errcode = 'P0001';
  end if;
  if v_entry.is_deleted or v_entry.is_cancelled then
    raise exception 'That entry is not in the books any more.' using errcode = 'P0001';
  end if;

  if length(v_reason) < 3 then
    raise exception 'Say why you are asking for this change.' using errcode = 'P0001';
  end if;
  if length(v_reason) > 300 then
    raise exception 'Keep the reason under 300 letters.' using errcode = 'P0001';
  end if;

  if p_amount is not null then
    if p_amount <= 0 then
      raise exception 'Enter an amount bigger than zero.' using errcode = 'P0001';
    end if;
    if round(p_amount, 2) <> p_amount then
      raise exception 'An amount can have at most 2 decimals.' using errcode = 'P0001';
    end if;
  end if;

  -- One question at a time about any one entry.
  update public.entry_change_requests
     set status = 'refused',
         decided_at = now(),
         decision_note = 'Replaced by a later request'
   where entry_id = p_entry_id and status = 'waiting';

  select full_name into v_name from public.app_users where id = auth.uid();

  insert into public.entry_change_requests (
    entry_id, asked_by, asked_by_name, reason,
    new_amount, new_bill_date, new_category, new_note, clear_note,
    old_amount, old_bill_date, old_category, old_note
  ) values (
    p_entry_id, auth.uid(), v_name, v_reason,
    p_amount, p_bill_date, p_category_id,
    nullif(btrim(coalesce(p_note, '')), ''), coalesce(p_clear_note, false),
    v_entry.amount, v_entry.bill_date, v_entry.category_id, v_entry.note
  )
  returning id into v_id;

  return v_id;
end
$fn$;

-- --------------------------------------------------------- the deciding
/**
 * The office's answer. Approving applies the change for real; refusing
 * leaves the books exactly as they were and tells the man why.
 */
create or replace function public.decide_entry_change(
  p_id      bigint,
  p_approve boolean,
  p_note    text default null
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_req  public.entry_change_requests;
  v_name text;
begin
  if not public.is_admin() then
    raise exception 'Only an Admin or a Sub-admin can answer a change request.'
      using errcode = 'P0001';
  end if;

  select * into v_req from public.entry_change_requests
   where id = p_id and status = 'waiting';
  if not found then
    raise exception 'That request is not there, or has already been answered.'
      using errcode = 'P0001';
  end if;

  select full_name into v_name from public.app_users where id = auth.uid();

  if p_approve then
    -- Now it touches the books, and now it belongs in the history. The
    -- reason carried from the man who asked, so the change history says
    -- why and not merely what.
    perform set_config(
      'kbh.edit_reason',
      v_req.reason || ' (approved by ' || coalesce(v_name, 'the office') || ')',
      true);
    -- The office has just looked at this one; a ticket telling them to
    -- look at it would be a second queue for a job already done.
    perform set_config('kbh.skip_ticket', 'yes', true);

    update public.entries
       set amount      = coalesce(v_req.new_amount, amount),
           bill_date   = coalesce(v_req.new_bill_date, bill_date),
           category_id = case when type = 'expense'
                              then coalesce(v_req.new_category, category_id)
                              else category_id end,
           note        = case when v_req.clear_note then null
                              else coalesce(v_req.new_note, note) end
     where id = v_req.entry_id;
  end if;

  update public.entry_change_requests
     set status          = case when p_approve then 'approved' else 'refused' end,
         decided_by      = auth.uid(),
         decided_by_name = v_name,
         decided_at      = now(),
         decision_note   = nullif(btrim(coalesce(p_note, '')), '')
   where id = p_id;
end
$fn$;

-- The trigger that raises an edit ticket steps aside when the office is
-- applying a change it has just approved.
create or replace function public.entries_raise_ticket()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_changes jsonb := '{}'::jsonb;
  v_reason  text;
  v_actor   uuid := auth.uid();
  v_name    text;
begin
  if TG_OP = 'INSERT' then
    select full_name into v_name from public.app_users where id = coalesce(new.entered_by, v_actor);
    insert into public.entry_tickets (entry_id, kind, actor_id, actor_name)
    values (new.id, 'new', coalesce(new.entered_by, v_actor), v_name);
    return null;
  end if;

  if new.is_deleted is distinct from old.is_deleted then return null; end if;

  -- An approval that has just been granted needs no ticket asking for
  -- one; the request itself carries who decided and when.
  if coalesce(current_setting('kbh.skip_ticket', true), '') = 'yes' then
    return null;
  end if;

  if new.amount is distinct from old.amount then
    v_changes := v_changes || jsonb_build_object('Amount',
      jsonb_build_object('from', old.amount::text, 'to', new.amount::text));
  end if;
  if new.bill_date is distinct from old.bill_date then
    v_changes := v_changes || jsonb_build_object('Bill date',
      jsonb_build_object('from', old.bill_date::text, 'to', new.bill_date::text));
  end if;
  if new.person_id is distinct from old.person_id then
    v_changes := v_changes || jsonb_build_object('Whose khata',
      jsonb_build_object(
        'from', (select full_name from public.app_users where id = old.person_id),
        'to',   (select full_name from public.app_users where id = new.person_id)));
  end if;
  if new.counterparty_id is distinct from old.counterparty_id then
    v_changes := v_changes || jsonb_build_object('Received by',
      jsonb_build_object(
        'from', (select full_name from public.app_users where id = old.counterparty_id),
        'to',   (select full_name from public.app_users where id = new.counterparty_id)));
  end if;
  if new.category_id is distinct from old.category_id then
    v_changes := v_changes || jsonb_build_object('What for',
      jsonb_build_object(
        'from', (select name from public.expense_categories where id = old.category_id),
        'to',   (select name from public.expense_categories where id = new.category_id)));
  end if;
  if new.note is distinct from old.note then
    v_changes := v_changes || jsonb_build_object('Note',
      jsonb_build_object('from', old.note, 'to', new.note));
  end if;
  if new.expense_type is distinct from old.expense_type then
    v_changes := v_changes || jsonb_build_object('Bill type',
      jsonb_build_object('from', old.expense_type::text, 'to', new.expense_type::text));
  end if;

  if v_changes = '{}'::jsonb then
    return null;
  end if;

  v_reason := nullif(btrim(coalesce(current_setting('kbh.edit_reason', true), '')), '');

  select full_name into v_name from public.app_users where id = v_actor;
  insert into public.entry_tickets (entry_id, kind, actor_id, actor_name, reason, changes)
  values (new.id, 'edit', v_actor, v_name, v_reason, v_changes);

  return null;
end
$fn$;

revoke all on function public.request_entry_change(uuid, text, numeric, date, uuid, text, boolean)
  from public, anon;
revoke all on function public.decide_entry_change(bigint, boolean, text) from public, anon;
grant execute on function public.request_entry_change(uuid, text, numeric, date, uuid, text, boolean)
  to authenticated;
grant execute on function public.decide_entry_change(bigint, boolean, text) to authenticated;
