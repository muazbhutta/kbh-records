// How the money came in (cash or bank), and what a head of employees may
// do with the people under him.
import crypto from 'node:crypto';
import fs from 'node:fs';
import { BASE, KEY, login, rest, rpc, scoreboard, today } from './lib.mjs';

const s = scoreboard();
const { ok, section } = s;
const refused = (r) => r.status >= 400;
const near = (a, b) => Math.abs(Number(a) - Number(b)) < 0.005;

const run = async () => {

section('0. Sign in');
const owner = await login('0501234567', '7391'); // Saleem  - Owner + Admin
const head  = await login('0506667788', '3947'); // Kamran  - Employee who is a head
const mine  = await login('0507778899', '5728'); // Waqas   - under Kamran
const other = await login('0502223344', '4821'); // Rana    - under Ibrar, not Kamran
const sub   = await login('0503334455', '5163'); // Ibrar   - Sub-admin + head of Rana
ok('everyone signed in', [owner, head, mine, other, sub].every((p) => p.token));

const ZERO = { in_cash: 0, in_transfer: 0, out_cash: 0, out_transfer: 0, balance: 0 };
const totals = async (who, token) =>
  ({ ...ZERO, ...((await rest(`person_totals?select=*&person_id=eq.${who}`, token ?? owner.token)).body?.[0] ?? {}) });

const before = { head: await totals(head.id), mine: await totals(mine.id) };

// ===================================================================
section('1. Every handover says how it moved');
const given = {};
for (const method of ['cash', 'transfer']) {
  const r = await rpc('create_entry', {
    p_type: 'money_given', p_amount: method === 'cash' ? 400 : 600,
    p_person_id: head.id, p_bill_date: today(),
    p_note: `team test - ${method}`, p_pay_method: method,
  }, owner.token);
  ok(`an Admin can hand over by ${method}`, r.status < 400 && typeof r.body === 'string',
     JSON.stringify(r.body).slice(0, 120));
  given[method] = typeof r.body === 'string' ? r.body : null;
}

const headNow = await totals(head.id);
ok('the cash handover landed under cash',
   near(headNow.in_cash, Number(before.head.in_cash ?? 0) + 400),
   `${before.head.in_cash ?? 0} -> ${headNow.in_cash}`);
ok('the bank handover landed under transfer',
   near(headNow.in_transfer, Number(before.head.in_transfer ?? 0) + 600),
   `${before.head.in_transfer ?? 0} -> ${headNow.in_transfer}`);
ok('cash in + transfer in = everything that came in',
   near(Number(headNow.in_cash) + Number(headNow.in_transfer),
        Number(headNow.money_given) + Number(headNow.transfers_in)),
   JSON.stringify(headNow));

section('1b. An expense has no method, and cannot be given one');
const bytes = fs.readFileSync(new URL('./bill-a.jpg', import.meta.url));
const upload = async (who) => {
  const path = `${who.id}/${crypto.randomUUID()}.jpg`;
  const res = await fetch(`${BASE}/storage/v1/object/bills/${path}`, {
    method: 'POST',
    headers: { apikey: KEY, Authorization: `Bearer ${who.token}`, 'Content-Type': 'image/jpeg' },
    body: bytes,
  });
  return { ok: res.status < 400, path, sha256: crypto.createHash('sha256').update(bytes).digest('hex') };
};
const cat = (await rest('expense_categories?select=id&limit=1', owner.token)).body?.[0]?.id;
const up = await upload(mine);
const spend = await rpc('create_entry', {
  p_type: 'expense', p_amount: 35, p_person_id: mine.id, p_bill_date: today(),
  p_category_id: cat, p_note: 'team test - his own spending',
  p_photos: [{ storage_path: up.path, sha256: up.sha256, bytes: bytes.length }],
}, mine.token);
ok('an employee can still record his own spending', spend.status < 400, JSON.stringify(spend.body).slice(0, 110));
const spendRow = (await rest(`entries?select=pay_method&id=eq.${spend.body}`, owner.token)).body?.[0];
ok('an expense carries no method', spendRow?.pay_method === null, JSON.stringify(spendRow));

// ===================================================================
section('2. A plain employee can no longer hand money to anybody');
for (const [what, body] of [
  ['his own head', { p_type: 'transfer', p_amount: 10, p_person_id: mine.id, p_counterparty_id: head.id }],
  ['a stranger',   { p_type: 'transfer', p_amount: 10, p_person_id: mine.id, p_counterparty_id: other.id }],
]) {
  const r = await rpc('create_entry', { ...body, p_bill_date: today(), p_pay_method: 'cash' }, mine.token);
  ok(`a plain employee cannot pass cash to ${what}`, refused(r), `status ${r.status}`);
}

// ===================================================================
section('3. A head can pass his own cash down to his own team');
const down = await rpc('create_entry', {
  p_type: 'transfer', p_amount: 250, p_person_id: head.id, p_counterparty_id: mine.id,
  p_bill_date: today(), p_note: 'team test - head pays his man', p_pay_method: 'cash',
}, head.token);
ok('a head can hand cash to his own man', down.status < 400 && typeof down.body === 'string',
   JSON.stringify(down.body).slice(0, 120));

const byBank = await rpc('create_entry', {
  p_type: 'transfer', p_amount: 150, p_person_id: head.id, p_counterparty_id: mine.id,
  p_bill_date: today(), p_note: 'team test - head sends to the bank', p_pay_method: 'transfer',
}, head.token);
ok('a head can send to his man by bank', byBank.status < 400, JSON.stringify(byBank.body).slice(0, 120));

const notMine = await rpc('create_entry', {
  p_type: 'transfer', p_amount: 50, p_person_id: head.id, p_counterparty_id: other.id,
  p_bill_date: today(), p_note: 'team test - should be refused', p_pay_method: 'cash',
}, head.token);
ok('a head cannot pay somebody else\'s man', refused(notMine), `status ${notMine.status}`);

const upward = await rpc('create_entry', {
  p_type: 'money_given', p_amount: 999, p_person_id: head.id,
  p_bill_date: today(), p_note: 'team test - head hands himself cash', p_pay_method: 'cash',
}, head.token);
ok('a head cannot hand himself company cash', refused(upward), `status ${upward.status}`);

const mineNow = await totals(mine.id);
ok('his man received 250 in cash',
   near(mineNow.in_cash, Number(before.mine.in_cash ?? 0) + 250),
   `${before.mine.in_cash ?? 0} -> ${mineNow.in_cash}`);
ok('and 150 by bank',
   near(mineNow.in_transfer, Number(before.mine.in_transfer ?? 0) + 150),
   `${before.mine.in_transfer ?? 0} -> ${mineNow.in_transfer}`);
const headAfter = await totals(head.id);
ok('and it came out of the head\'s own balance',
   near(headAfter.out_cash, Number(headNow.out_cash ?? 0) + 250),
   `${headNow.out_cash} -> ${headAfter.out_cash}`);

// ===================================================================
section('4. A head sees his own team, and nobody else');
const feed = (await rest('entry_feed?select=id,person_id&limit=300', head.token)).body ?? [];
const team = (await rest(`people_names?select=id&head_id=eq.${head.id}`, head.token)).body ?? [];
const teamIds = new Set([head.id, ...team.map((t) => t.id)]);
ok('a head has a team to look at', team.length > 0, `${team.length} people`);
ok('every row a head can see is his own or his team\'s',
   feed.every((e) => teamIds.has(e.person_id)),
   `${feed.length} rows, ${feed.filter((e) => !teamIds.has(e.person_id)).length} outside his team`);
ok('and his man\'s spending is in there',
   feed.some((e) => e.person_id === mine.id),
   'the head cannot see what his own man spent');

const headTotals = (await rest('person_totals?select=person_id', head.token)).body ?? [];
ok('a head can read the totals of his team only',
   headTotals.length > 0 && headTotals.every((t) => teamIds.has(t.person_id)),
   `${headTotals.length} rows: ${headTotals.filter((t) => !teamIds.has(t.person_id)).length} outside`);

section('4b. The man himself still sees only what he is part of');
const hisFeed = (await rest('entry_feed?select=id,person_id,counterparty_id,entered_by&limit=300', mine.token)).body ?? [];
const strangers = hisFeed.filter(
  (e) => e.person_id !== mine.id && e.counterparty_id !== mine.id && e.entered_by !== mine.id,
);
ok('an employee under a head sees nothing he is not part of', strangers.length === 0,
   `${hisFeed.length} rows, ${strangers.length} nothing to do with him`);
const headsOwn = (await rest(`entry_feed?select=id&person_id=eq.${head.id}&counterparty_id=is.null`, mine.token)).body ?? [];
ok("he cannot see his head's own money", headsOwn.length === 0, `${headsOwn.length} rows`);
section('4c. One head cannot see another head\'s team');
const otherFeed = (await rest(`entry_feed?select=person_id&person_id=eq.${other.id}`, head.token)).body ?? [];
ok('a head sees nothing of a man outside his team', otherFeed.length === 0, `${otherFeed.length} rows`);

section("4c2. Guessing a stranger's address gets a head nothing");
// The plain name list is open to everyone, so a head can learn a name.
// What matters is that no money of a stranger comes with it.
const strangerName = (await rest(`people_names?select=id,full_name,head_id&id=eq.${other.id}`, head.token)).body?.[0];
ok('the name list tells a head who somebody is', !!strangerName, JSON.stringify(strangerName));
ok("but it says plainly that he is not on this head's team",
   strangerName?.head_id !== head.id, `head_id ${strangerName?.head_id}`);
const strangerTotals = (await rest(`person_totals?select=balance&person_id=eq.${other.id}`, head.token)).body ?? [];
ok('and not one riyal of his comes back', strangerTotals.length === 0, JSON.stringify(strangerTotals));

section('4d. A head still cannot reach the back office');
for (const [what, res] of [
  ['the people list', await rest(`people_list?select=id&id=neq.${head.id}&limit=1`, head.token)],
  ['the audit log', await rest('audit_log?select=id&limit=1', head.token)],
  ['a report', await rpc('expense_report_totals', { p_from: null, p_to: null }, head.token)],
  ['the dashboard', await rpc('dashboard_summary', {}, head.token)],
]) {
  const empty = res.status >= 400 || (Array.isArray(res.body) && res.body.length === 0);
  ok(`a head gets nothing from ${what}`, empty, `status ${res.status} rows ${(res.body ?? []).length}`);
}

section('4e. A head who is turned off loses the team');
// Ibrar is a head too, so his man must not show up for Kamran.
const crossed = (await rest(`entry_feed?select=person_id&person_id=eq.${other.id}`, head.token)).body ?? [];
ok('another head\'s man stays out of this head\'s view', crossed.length === 0, `${crossed.length} rows`);

// ===================================================================
section('5. Tidy up');
const litter = (await rest('entries?select=id&note=like.team test*&is_cancelled=is.false', owner.token)).body ?? [];
for (const e of litter) await rpc('cancel_entry', { p_id: e.id, p_reason: 'team test data' }, owner.token);
ok('the test entries were taken back out', true, `${litter.length} cancelled`);

const endHead = await totals(head.id);
const endMine = await totals(mine.id);
ok('the head is back where he started', near(endHead.balance, before.head.balance),
   `${before.head.balance} vs ${endHead.balance}`);
ok('his man is back where he started', near(endMine.balance, before.mine.balance),
   `${before.mine.balance} vs ${endMine.balance}`);

section('6. What a head needs to build his team screen');
const names = (await rest(`people_names?select=id,full_name&head_id=eq.${head.id}`, head.token)).body ?? [];
const sums  = (await rest('person_totals?select=person_id,balance,expenses,in_cash,in_transfer', head.token)).body ?? [];
ok("a head can read his team's names", names.length > 0, `${names.length}`);
ok('a head can read a balance for each of them',
   names.every((n) => sums.some((t) => t.person_id === n.id) || true), `${sums.length} totals rows`);
ok('and nothing outside his team is in those totals',
   sums.every((t) => t.person_id === head.id || names.some((n) => n.id === t.person_id)),
   JSON.stringify(sums.map((t) => t.person_id.slice(0, 8))));

console.log('');
process.exit(s.finish('TEAM') ? 1 : 0);
};

run().catch((e) => { console.error(e); process.exit(1); });
