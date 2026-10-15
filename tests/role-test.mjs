// What each kind of person may and may not do, checked against the live
// database the same way the app talks to it.
import crypto from 'node:crypto';
import fs from 'node:fs';
import { BASE, KEY, fn, login, rest, rpc, scoreboard, today } from './lib.mjs';

const s = scoreboard();
const { ok, section } = s;

const bad = (r) => r.status >= 400 || (Array.isArray(r.body) && r.body.length === 0);
const refused = (r) => r.status >= 400;

const run = async () => {

section('0. Everyone signs in');
const owner  = await login('0501234567', '7391'); // Saleem  - Owner + Admin
const admin  = await login('0505556677', '8264'); // Nadeem  - Admin, not owner
const sub    = await login('0503334455', '5163'); // Ibrar   - Sub-admin + head
const head   = await login('0506667788', '3947'); // Kamran  - Employee who is a head
const emp    = await login('0507778899', '5728'); // Waqas   - Employee under Kamran
const emp2   = await login('0502223344', '4821'); // Rana    - Employee under Ibrar

for (const p of [owner, admin, sub, head, emp, emp2]) {
  ok(`${p.name} (${p.role}) signed in`, !!p.token);
}
ok('the owner is an admin', owner.role === 'admin');
ok('a head who is an employee stays an employee', head.role === 'employee');

const people = [
  ['Owner', owner], ['Admin', admin], ['Sub-admin', sub],
  ['Head', head], ['Employee', emp],
];
const managers = [['Owner', owner], ['Admin', admin], ['Sub-admin', sub]];
const workers = [['Head', head], ['Employee', emp]];

// ===================================================================
section('1. A wrong PIN is refused, and five wrong PINs lock the door');
let r = await fn('pin-auth', { action: 'login', mobile: '0507778899', pin: '0000' });
ok('a wrong PIN does not let you in', refused(r) || !r.body?.session, JSON.stringify(r.body));
r = await fn('pin-auth', { action: 'login', mobile: '0509999999', pin: '1234' });
ok('an unknown number does not let you in', refused(r) || !r.body?.session);
r = await fn('pin-auth', { action: 'login', mobile: '0508887766', pin: '1111' });
ok('a turned-off account cannot sign in', refused(r) || !r.body?.session, JSON.stringify(r.body));

// ===================================================================
section('2. Who can see the list of people');
for (const [label, p] of managers) {
  const res = await rest('people_list?select=id,full_name,balance', p.token);
  ok(`${label} sees every person`, (res.body ?? []).length >= 7, `${(res.body ?? []).length}`);
}
for (const [label, p] of workers) {
  const res = await rest('people_list?select=id,full_name,balance', p.token);
  const rows = res.body ?? [];
  ok(`${label} does not get the whole people list`, rows.length <= 1,
     `got ${rows.length}: ${rows.map((x) => x.full_name).join(', ')}`);
}

section('2b. Everyone can see plain names (needed to pick who received money)');
for (const [label, p] of people) {
  const res = await rest('people_names?select=id,full_name', p.token);
  ok(`${label} can read the name list`, (res.body ?? []).length >= 7, `${(res.body ?? []).length}`);
}

section('2c. Nobody can read PINs or login attempts');
for (const [label, p] of people) {
  const a = await rest('user_secrets?select=*', p.token);
  const b = await rest('login_attempts?select=*', p.token);
  const isManager = ['Owner', 'Admin', 'Sub-admin'].includes(label);
  ok(`${label} cannot read the PIN table`, bad(a), JSON.stringify(a.body).slice(0, 90));
  ok(isManager ? `${label} may read the login record` : `${label} cannot read login attempts`,
     isManager ? !bad(b) : bad(b), JSON.stringify(b.body).slice(0, 90));
  if (!bad(b)) {
    const cols = Object.keys(b.body[0] ?? {});
    ok(`${label}'s login record holds no PIN`, !cols.some((c) => /pin|hash|secret|password/i.test(c)), cols.join(','));
  }
}

// ===================================================================
section('3. The owner is protected at the database, not just on screen');
r = await fn('manage-users', { action: 'set-active', userId: owner.id, isActive: false }, admin.token);
ok('an Admin cannot turn the owner off', refused(r), JSON.stringify(r.body));
r = await fn('manage-users', { action: 'update', userId: owner.id, role: 'employee' }, admin.token);
ok('an Admin cannot demote the owner', refused(r), JSON.stringify(r.body));
r = await fn('manage-users', { action: 'update', userId: owner.id, role: 'employee' }, sub.token);
ok('a Sub-admin cannot demote the owner', refused(r), JSON.stringify(r.body));
r = await rest(`app_users?id=eq.${owner.id}`, admin.token, {
  method: 'PATCH', body: JSON.stringify({ role: 'employee' }),
});
ok('going straight at the table cannot demote the owner', refused(r), `status ${r.status}`);
await rest(`app_users?id=eq.${owner.id}`, admin.token, { method: 'DELETE' });
const stillThere = (await rest(`people_names?select=id&id=eq.${owner.id}`, owner.token)).body ?? [];
ok('the owner is still there after a delete attempt', stillThere.length === 1, JSON.stringify(stillThere));
r = await rest(`app_users?id=eq.${owner.id}`, owner.token, {
  method: 'PATCH', body: JSON.stringify({ is_active: false }),
});
ok('the owner cannot even turn himself off', refused(r), `status ${r.status}`);

// Changing the Owner's mobile number would lock him out just as surely as
// turning the account off, so it is barred the same way.
for (const [label, p] of [['an Admin', admin], ['a Sub-admin', sub]]) {
  for (const [what, body] of [
    ["the owner's mobile number", { action: 'update', userId: owner.id, mobile: '0591119999' }],
    ["the owner's name", { action: 'update', userId: owner.id, fullName: 'Hijacked' }],
    ["the owner's job title", { action: 'update', userId: owner.id, jobTitle: 'Nobody' }],
    ["the owner's PIN", { action: 'reset-pin', userId: owner.id, pin: '1379' }],
  ]) {
    const res = await fn('manage-users', body, p.token);
    ok(`${label} cannot change ${what}`, refused(res), `status ${res.status}`);
  }
}
const ownerCard = (await rest(`people_list?select=full_name,mobile,job_title&id=eq.${owner.id}`, owner.token)).body?.[0];
ok('the owner is still Saleem on his own number',
   ownerCard?.full_name === 'Saleem' && ownerCard?.mobile === '966501234567',
   JSON.stringify(ownerCard));
const selfEdit = await fn('manage-users', { action: 'update', userId: owner.id, jobTitle: 'Owner' }, owner.token);
ok('the owner can still edit his own card', selfEdit.status < 400, `status ${selfEdit.status}`);

const ownerNow = (await rest(`people_list?select=role,is_active,is_owner&id=eq.${owner.id}`, owner.token)).body?.[0];
ok('the owner is still an active admin owner',
   ownerNow?.role === 'admin' && ownerNow?.is_active === true && ownerNow?.is_owner === true,
   JSON.stringify(ownerNow));

section('3b. Only a manager can add or change people');
for (const [label, p] of workers) {
  const c = await fn('manage-users', {
    action: 'create', fullName: 'Hacker', mobile: '0591112233', pin: '4826', role: 'admin',
  }, p.token);
  ok(`${label} cannot create a person`, refused(c), JSON.stringify(c.body));
  const u = await fn('manage-users', { action: 'update', userId: emp2.id, role: 'admin' }, p.token);
  ok(`${label} cannot change somebody's role`, refused(u), JSON.stringify(u.body));
  const pin = await fn('manage-users', { action: 'reset-pin', userId: emp2.id, pin: '9182' }, p.token);
  ok(`${label} cannot reset somebody's PIN`, refused(pin), JSON.stringify(pin.body));
}
await rest(`app_users?id=eq.${emp.id}`, emp.token, {
  method: 'PATCH', body: JSON.stringify({ role: 'admin' }),
});
const empRole = (await rest(`app_users?select=role&id=eq.${emp.id}`, owner.token)).body?.[0]?.role;
ok('an Employee is still an employee after trying to promote himself', empRole === 'employee', String(empRole));

// ===================================================================
section('4. A Sub-admin can do what an Admin can');
const subChecks = [
  ['read the audit log', await rest('audit_log?select=id&limit=1', sub.token)],
  ['read a report', await rpc('expense_report_totals', { p_from: null, p_to: null }, sub.token)],
  ['read the people list', await rest('people_list?select=id&limit=1', sub.token)],
  ['read the dashboard', await rpc('dashboard_summary', {}, sub.token)],
];
for (const [what, res] of subChecks) {
  ok(`a Sub-admin can ${what}`, res.status < 400, `status ${res.status} ${JSON.stringify(res.body).slice(0, 80)}`);
}
const throwaway = '05' + String(Math.floor(10000000 + Math.random() * 89999999));
r = await fn('manage-users', {
  action: 'create', fullName: 'Made By Sub', mobile: throwaway, pin: '7351', role: 'employee',
}, sub.token);
ok('a Sub-admin can add a person', r.status < 400, JSON.stringify(r.body).slice(0, 120));
const madeBySub = r.body?.person?.id ?? null;
if (madeBySub) {
  const off = await fn('manage-users', { action: 'set-active', userId: madeBySub, isActive: false }, sub.token);
  ok('a Sub-admin can turn that person off again', off.status < 400, JSON.stringify(off.body).slice(0, 90));
}

// ===================================================================
section('5. An Employee only sees his own money');
const empFeed = (await rest('entry_feed?select=id,person_id,counterparty_id,entered_by&limit=200', emp.token)).body ?? [];
const empStrangers = empFeed.filter(
  (e) => e.person_id !== emp.id && e.counterparty_id !== emp.id && e.entered_by !== emp.id,
);
ok('an Employee sees only rows that touch him', empStrangers.length === 0,
   `${empFeed.length} rows, strangers: ${empStrangers.length}`);

const ranaFeed = (await rest('entry_feed?select=id,person_id,entered_by,counterparty_id&limit=200', emp2.token)).body ?? [];
const strangers = ranaFeed.filter(
  (e) => e.person_id !== emp2.id && e.entered_by !== emp2.id && e.counterparty_id !== emp2.id,
);
ok('another Employee sees only what he is part of', strangers.length === 0,
   `${ranaFeed.length} rows, ${strangers.length} nothing to do with him`);

const headFeed = (await rest('entry_feed?select=id,person_id&limit=200', head.token)).body ?? [];
const headTeam = (await rest(`people_names?select=id&head_id=eq.${head.id}`, head.token)).body ?? [];
const allowedToHead = new Set([head.id, ...headTeam.map((t) => t.id)]);
ok('a head sees his own money and his own team, and nothing else',
   headFeed.every((e) => allowedToHead.has(e.person_id)),
   `${headFeed.length} rows, ${headFeed.filter((e) => !allowedToHead.has(e.person_id)).length} outside his team`);

const empTotals = (await rest('person_totals?select=person_id,balance', emp.token)).body ?? [];
ok('an Employee cannot read everyone\'s totals',
   empTotals.every((t) => t.person_id === emp.id),
   `${empTotals.length} rows`);

section('5b. An Employee cannot reach the back-office screens');
const closedDoors = [
  ['the audit log', await rest('audit_log?select=id&limit=1', emp.token)],
  ['the download log', await rest('report_download_log?select=id&limit=1', emp.token)],
  ['bills to check', await rest('expenses_to_check?select=id&limit=1&person_id=neq.' + emp.id, emp.token)],
  ['suspected duplicates', await rest('suspected_duplicates?select=id&limit=1', emp.token)],
  ['cancelled entries', await rest(`cancelled_entries?select=id&limit=1&entered_by=neq.${emp.id}&person_id=neq.${emp.id}&counterparty_id=neq.${emp.id}`, emp.token)],
  ['the teams summary', await rest('team_summary?select=head_id&limit=1', emp.token)],
];
for (const [what, res] of closedDoors) {
  ok(`an Employee gets nothing from ${what}`, bad(res), `status ${res.status} rows ${(res.body ?? []).length}`);
}
const closedRpcs = ['dashboard_summary', 'dashboard_months', 'dashboard_categories', 'dashboard_top_holders', 'dashboard_stale_checks'];
for (const name of closedRpcs) {
  const res = await rpc(name, {}, emp.token);
  ok(`an Employee is refused ${name}`, refused(res), `status ${res.status}`);
}

// ===================================================================
section('6. An Employee cannot put an expense on somebody else');
const bytes = fs.readFileSync(new URL('./bill-a.jpg', import.meta.url));
const upload = async (who) => {
  const path = `${who.id}/${crypto.randomUUID()}.jpg`;
  const res = await fetch(`${BASE}/storage/v1/object/bills/${path}`, {
    method: 'POST',
    headers: { apikey: KEY, Authorization: `Bearer ${who.token}`, 'Content-Type': 'image/jpeg' },
    body: bytes,
  });
  return { status: res.status, path, sha256: crypto.createHash('sha256').update(bytes).digest('hex') };
};
const cat = (await rest('expense_categories?select=id&limit=1', owner.token)).body?.[0]?.id;

const up1 = await upload(emp);
ok('an Employee can upload his own bill photo', up1.status < 400, `status ${up1.status}`);

const foreign = await rpc('create_entry', {
  p_type: 'expense', p_amount: 5000, p_person_id: emp2.id, p_bill_date: today(),
  p_category_id: cat, p_note: 'SECURITY TEST - should be refused',
  p_photos: [{ storage_path: up1.path, sha256: up1.sha256, bytes: bytes.length }],
}, emp.token);
ok('an Employee cannot charge an expense to another person', refused(foreign),
   `status ${foreign.status} id ${JSON.stringify(foreign.body).slice(0, 60)}`);

const up2 = await upload(emp);
const own = await rpc('create_entry', {
  p_type: 'expense', p_amount: 12.5, p_person_id: emp.id, p_bill_date: today(),
  p_category_id: cat, p_note: 'role test - own expense',
  p_photos: [{ storage_path: up2.path, sha256: up2.sha256, bytes: bytes.length }],
}, emp.token);
ok('an Employee can record his own expense', own.status < 400 && typeof own.body === 'string',
   JSON.stringify(own.body).slice(0, 120));
const ownEntryId = typeof own.body === 'string' ? own.body : null;

const giveSelf = await rpc('create_entry', {
  p_type: 'money_given', p_amount: 9999, p_person_id: emp.id, p_bill_date: today(),
  p_note: 'SECURITY TEST - employee hands himself cash',
}, emp.token);
ok('an Employee cannot hand himself cash', refused(giveSelf), `status ${giveSelf.status}`);

const returnSelf = await rpc('create_entry', {
  p_type: 'returned', p_amount: 50, p_person_id: emp.id, p_bill_date: today(),
  p_note: 'SECURITY TEST - employee marks money returned',
}, emp.token);
ok('an Employee cannot mark money as returned', refused(returnSelf), `status ${returnSelf.status}`);

section('6b. An Employee cannot edit, delete or cancel anything');
if (ownEntryId) {
  await rest(`entries?id=eq.${ownEntryId}`, emp.token, {
    method: 'PATCH', body: JSON.stringify({ amount: 1 }),
  });
  let after = (await rest(`entries?select=amount,is_deleted&id=eq.${ownEntryId}`, owner.token)).body?.[0];
  ok('an Employee cannot change his own entry afterwards', Number(after?.amount) === 12.5, JSON.stringify(after));
  await rest(`entries?id=eq.${ownEntryId}`, emp.token, { method: 'DELETE' });
  after = (await rest(`entries?select=amount&id=eq.${ownEntryId}`, owner.token)).body?.[0];
  ok('an Employee cannot delete an entry', !!after, 'the row is gone');
  const can = await rpc('cancel_entry', { p_id: ownEntryId, p_reason: 'test' }, emp.token);
  ok('an Employee cannot cancel an entry', refused(can), `status ${can.status}`);
  const setType = await rpc('set_expense_type', { p_id: ownEntryId, p_type: 'invoice' }, emp.token);
  ok('an Employee cannot change Petty to Invoice', refused(setType), `status ${setType.status}`);
}
const check = await rpc('record_cash_check', { p_person_id: emp2.id, p_counted: 10 }, emp.token);
ok('an Employee cannot record a cash check', refused(check), `status ${check.status}`);
const catEdit = await rest('expense_categories', emp.token, {
  method: 'POST', body: JSON.stringify({ name: 'Hack', icon: 'bug', sort_order: 99 }),
});
ok('an Employee cannot add a category', refused(catEdit), `status ${catEdit.status}`);

// ===================================================================
section('7. Bill photos stay private');
const someonesPhoto = (await rest('entry_photos?select=storage_path&limit=1', owner.token)).body?.[0]?.storage_path;
if (someonesPhoto) {
  const pub = await fetch(`${BASE}/storage/v1/object/public/bills/${someonesPhoto}`);
  ok('a bill photo has no public link', pub.status >= 400, `status ${pub.status}`);
  const noAuth = await fetch(`${BASE}/storage/v1/object/bills/${someonesPhoto}`, { headers: { apikey: KEY } });
  ok('a bill photo cannot be read without signing in', noAuth.status >= 400, `status ${noAuth.status}`);
}
const empPhotos = (await rest('entry_photos?select=entry_id&limit=200', emp.token)).body ?? [];
const empEntries = (await rest(`entries?select=id&limit=400`, emp.token)).body ?? [];
const visible = new Set(empEntries.map((e) => e.id));
ok('an Employee sees no photo of an entry he cannot see',
   empPhotos.every((p) => visible.has(p.entry_id)),
   `${empPhotos.length} photos, strangers ${empPhotos.filter((p) => !visible.has(p.entry_id)).length}`);
// and the entries he can see must all be his
const mineOnly = (await rest('entries?select=id,person_id,entered_by,counterparty_id&limit=400', emp.token)).body ?? [];
const notHis = mineOnly.filter((e) => e.person_id !== emp.id && e.entered_by !== emp.id && e.counterparty_id !== emp.id);
ok('an Employee can read no entry that has nothing to do with him', notHis.length === 0,
   `${mineOnly.length} rows, ${notHis.length} strangers`);

// ===================================================================
section('8. Reports are for managers only');
for (const [label, p] of managers) {
  const t = await rpc('expense_report_totals', { p_from: null, p_to: null }, p.token);
  ok(`${label} can read report totals`, t.status < 400, `status ${t.status}`);
}
for (const [label, p] of workers) {
  for (const name of ['expense_report', 'expense_report_totals', 'report_photos', 'log_report_download']) {
    const res = await rpc(name, { p_kind: null, p_from: null, p_to: null, p_rows: 1, p_total: 1 }, p.token);
    ok(`${label} is refused ${name}`, refused(res), `status ${res.status}`);
  }
}

// ===================================================================
section('9. The audit log and the download log cannot be rubbed out');
const anAudit = (await rest('audit_log?select=id&limit=1&order=id.desc', owner.token)).body?.[0]?.id;
if (anAudit) {
  const d = await rest(`audit_log?id=eq.${anAudit}`, owner.token, { method: 'DELETE' });
  ok('even the owner cannot delete an audit line', refused(d) || (Array.isArray(d.body) && d.body.length === 0), `status ${d.status}`);
  const u = await rest(`audit_log?id=eq.${anAudit}`, owner.token, {
    method: 'PATCH', body: JSON.stringify({ summary: 'changed' }),
  });
  ok('even the owner cannot edit an audit line', refused(u) || (Array.isArray(u.body) && u.body.length === 0), `status ${u.status}`);
}

section('10. Tidy up after ourselves');
// The run adds a real expense and a throwaway account; neither should be
// left lying in the books.
const litter = (await rest('entries?select=id,system_id&note=like.role test*&is_cancelled=is.false', owner.token)).body ?? [];
for (const e of litter) await rpc('cancel_entry', { p_id: e.id, p_reason: 'role test data' }, owner.token);
ok('the test expense was taken back out', litter.length <= 1, `${litter.length} left`);

console.log('');
process.exit(s.finish('ROLES') ? 1 : 0);
};

run().catch((e) => { console.error(e); process.exit(1); });
