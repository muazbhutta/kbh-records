// Sends the phone notification when a ticket is raised.
//
// The database calls this the moment an entry is recorded or corrected.
// It finds every Admin and Sub-admin who has turned notifications on,
// and pushes a line to each of their phones.
//
// This is a nudge, never the record. The ticket is already in the books
// by the time this runs, and the Waiting for you list is the truth. If a
// phone is off, or a subscription has gone stale, or this whole function
// falls over, nothing is lost - the office still sees the ticket when it
// next opens the app. That is deliberate: a notification that people
// come to depend on is a notification that must never be the only copy.
//
// Protected by a secret of its own rather than the service key. Somebody
// who got hold of it could make a phone buzz; they could not read a
// riyal of the books.
import webpush from 'npm:web-push@3.6.7';
import { createClient } from 'jsr:@supabase/supabase-js@2';

const VAPID_PUBLIC = Deno.env.get('VAPID_PUBLIC_KEY') ?? '';
const VAPID_PRIVATE = Deno.env.get('VAPID_PRIVATE_KEY') ?? '';
const NOTIFY_SECRET = Deno.env.get('NOTIFY_SECRET') ?? '';
const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

webpush.setVapidDetails('mailto:records@kbh.example', VAPID_PUBLIC, VAPID_PRIVATE);

type Ticket = {
  id: number;
  entry_id: string;
  kind: 'new' | 'edit';
  actor_name: string | null;
  reason: string | null;
  amount: string | number | null;
  person_name: string | null;
  category_name: string | null;
};

function money(value: string | number | null): string {
  const n = Number(value ?? 0);
  if (!Number.isFinite(n)) return 'SAR 0.00';
  return `SAR ${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/** What the phone says on the lock screen. Short, and enough to act on. */
function wording(t: Ticket): { title: string; body: string } {
  const who = t.person_name ?? 'Somebody';
  const what = t.category_name ? ` · ${t.category_name}` : '';

  if (t.kind === 'edit') {
    return {
      title: `${who} corrected an entry`,
      body: `${money(t.amount)}${what}${t.reason ? ` — "${t.reason}"` : ''}`,
    };
  }
  return {
    title: `${who} recorded ${money(t.amount)}`,
    body: `${what.replace(' · ', '')}${t.actor_name && t.actor_name !== who ? ` · entered by ${t.actor_name}` : ''}`.trim() ||
      'Tap to look at it.',
  };
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') {
    return new Response('Not here', { status: 405 });
  }
  if (!NOTIFY_SECRET || req.headers.get('x-kbh-notify') !== NOTIFY_SECRET) {
    return new Response('No', { status: 401 });
  }

  let ticket: Ticket;
  try {
    ticket = (await req.json()).ticket;
    if (!ticket?.id) throw new Error('no ticket');
  } catch {
    return new Response('Nothing to send', { status: 400 });
  }

  const db = createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { persistSession: false },
  });

  // Everybody who should be told, and is listening.
  const { data: subs, error } = await db
    .from('push_subscriptions')
    .select('id, endpoint, p256dh, auth, person_id, app_users!inner(role, is_active)')
    .eq('app_users.is_active', true)
    .in('app_users.role', ['admin', 'sub_admin']);

  if (error) {
    console.error('could not read the subscriptions', error.message);
    return new Response('Could not look them up', { status: 500 });
  }

  const { title, body } = wording(ticket);
  const payload = JSON.stringify({
    title,
    body,
    tag: `ticket-${ticket.id}`,
    entryId: ticket.entry_id,
    personId: ticket.person_name,
  });

  let sent = 0;
  const gone: number[] = [];

  await Promise.all(
    (subs ?? []).map(async (s) => {
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          payload,
          { TTL: 24 * 60 * 60, urgency: 'normal' },
        );
        sent += 1;
      } catch (err) {
        // 404 and 410 mean the phone threw the subscription away - the
        // app was deleted, or the browser cleared it. Those rows are
        // dead and should go, or they pile up and slow every send.
        const status = (err as { statusCode?: number }).statusCode;
        if (status === 404 || status === 410) gone.push(s.id);
        else console.error('push failed', status, (err as Error).message);
      }
    }),
  );

  if (gone.length > 0) {
    await db.from('push_subscriptions').delete().in('id', gone);
  }

  return new Response(JSON.stringify({ sent, removed: gone.length }), {
    headers: { 'content-type': 'application/json' },
  });
});
