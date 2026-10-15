// Steps 3+4: reports and the bill-photo ZIP - who may take them, and do they add up.
import fs from 'node:fs';
import crypto from 'node:crypto';

const env = Object.fromEntries(
  fs.readFileSync(process.argv[2], 'utf8')
    .split(/\r?\n/).filter((l) => l.trim() && !l.trim().startsWith('#'))
    .map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()]),
);
const BASE = env.EXPO_PUBLIC_SUPABASE_URL;
const KEY = env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

let pass = 0, failed = 0;
const ok = (n, c, d = '') => { if (c) { pass++; console.log(`  PASS  ${n}`); } else { failed++; console.log(`  FAIL  ${n}  ${d}`); } };
const section = (t) => console.log(`\n--- ${t} ---`);

const rest = async (path, token, init = {}) => {
  const res = await fetch(`${BASE}/rest/v1/${path}`, {
    ...init,
    headers: { apikey: KEY, Authorization: `Bearer ${token ?? KEY}`, 'Content-Type': 'application/json', ...(init.headers ?? {}) },
  });
  return { status: res.status, body: await res.json().catch(() => null) };
};
const rpc = (n, a, t) => rest(`rpc/${n}`, t, { method: 'POST', body: JSON.stringify(a) });
const login = async (mobile, pin) => {
  const res = await fetch(`${BASE}/functions/v1/pin-auth`, {
    method: 'POST', headers: { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'login', mobile, pin }),
  });
  const b = await res.json();
  if (!b?.session?.access_token) throw new Error(`login ${mobile}: ${JSON.stringify(b)}`);
  return { token: b.session.access_token, id: b.person.id, name: b.person.full_name };
};

const run = async () => {

section('0. Sign in');
const saleem = await login('0501234567', '7391');
const rana = await login('0502223344', '4821');
ok('an Admin and an Employee are signed in', !!saleem.token && !!rana.token);

const range = { p_from: '2026-10-01', p_to: '2026-10-31' };

section('1. Only an Admin can take a report out');
const guarded = [
  ['expense_report', { ...range }],
  ['expense_report_totals', { ...range }],
  ['report_photos', { ...range }],
  ['log_report_download', { p_kind: 'pdf_all', ...range, p_rows: 1, p_total: 1 }],
];
for (const [name, args] of guarded) {
  const r = await rpc(name, args, rana.token);
  ok(`${name} refuses an Employee`, r.status >= 400, `status ${r.status}`);
}
const emp = await rest('report_download_log?select=id&limit=1', rana.token);
ok('an Employee sees no download log', (emp.body ?? []).length === 0, JSON.stringify(emp.body));

section('2. The figures agree');
const tot = (await rpc('expense_report_totals', range, saleem.token)).body;
const rows = (await rpc('expense_report', range, saleem.token)).body ?? [];
const petty = (await rpc('expense_report', { ...range, p_kind: 'petty' }, saleem.token)).body ?? [];
const invoice = (await rpc('expense_report', { ...range, p_kind: 'invoice' }, saleem.token)).body ?? [];
const sum = (a) => a.reduce((s, r) => s + Number(r.amount), 0);

ok('petty + invoice = all', Math.abs(Number(tot.petty_total) + Number(tot.invoice_total) - Number(tot.all_total)) < 0.005, JSON.stringify(tot));
ok('the All rows add up to the All total', Math.abs(sum(rows) - Number(tot.all_total)) < 0.005, `${sum(rows)} vs ${tot.all_total}`);
ok('the Petty rows add up to the Petty total', Math.abs(sum(petty) - Number(tot.petty_total)) < 0.005, `${sum(petty)} vs ${tot.petty_total}`);
ok('the Invoice rows add up to the Invoice total', Math.abs(sum(invoice) - Number(tot.invoice_total)) < 0.005, `${sum(invoice)} vs ${tot.invoice_total}`);
ok('Petty rows + Invoice rows = All rows', petty.length + invoice.length === rows.length, `${petty.length}+${invoice.length} vs ${rows.length}`);
ok('every row carries a System ID', rows.every((r) => !!r.system_id));
ok('a Petty report holds no Invoice row', petty.every((r) => r.expense_type === 'petty'));
ok('an Invoice report holds no Petty row', invoice.every((r) => r.expense_type === 'invoice'));

section('3. A cancelled expense is in no report');
// An expense needs a bill photo, so upload one first.
const bytes = fs.readFileSync(new URL('./bill-a.jpg', import.meta.url));
const path = `${saleem.id}/${crypto.randomUUID()}.jpg`;
const up = await fetch(`${BASE}/storage/v1/object/bills/${path}`, {
  method: 'POST',
  headers: { apikey: KEY, Authorization: `Bearer ${saleem.token}`, 'Content-Type': 'image/jpeg' },
  body: bytes,
});
ok('a bill photo went up', up.status < 400, `status ${up.status}`);
const sha = crypto.createHash('sha256').update(bytes).digest('hex');
const cat = (await rest('expense_categories?select=id&limit=1', saleem.token)).body?.[0]?.id;

const made = await rpc('create_entry', {
  p_type: 'expense', p_amount: 999, p_person_id: rana.id, p_bill_date: '2026-10-13',
  p_note: 'report test - will be cancelled', p_expense_type: 'petty', p_type_source: 'manual',
  p_category_id: cat,
  p_photos: [{ storage_path: path, sha256: sha, bytes: bytes.length }],
}, saleem.token);
const id = made.body;
ok('a test expense was made', typeof id === 'string', JSON.stringify(made.body));

let t2 = (await rpc('expense_report_totals', range, saleem.token)).body;
ok('it counts while it is live', Math.abs(Number(t2.all_total) - Number(tot.all_total) - 999) < 0.005, JSON.stringify(t2));

await rpc('cancel_entry', { p_id: id, p_reason: 'report test' }, saleem.token);
t2 = (await rpc('expense_report_totals', range, saleem.token)).body;
const rows2 = (await rpc('expense_report', range, saleem.token)).body ?? [];
ok('once cancelled it leaves the total', Math.abs(Number(t2.all_total) - Number(tot.all_total)) < 0.005, JSON.stringify(t2));
ok('once cancelled it leaves the rows', !rows2.some((r) => r.id === id));
const ph = (await rpc('report_photos', range, saleem.token)).body ?? [];
ok('its photos leave the ZIP too', !ph.some((p) => p.entry_id === id));

section('4. The photo list matches the photo count');
ok('report_photos returns what the totals promised', ph.length === Number(tot.photo_count), `${ph.length} vs ${tot.photo_count}`);
ok('every photo has a place to go', ph.every((p) => p.storage_path && p.bill_date && p.entered_at));

section('5. The download log is written and cannot be rubbed out');
await rpc('log_report_download', { p_kind: 'pdf_all', ...range, p_rows: rows.length, p_total: Number(tot.all_total), p_note: 'test run' }, saleem.token);
const after = (await rest('report_download_log?select=id,kind,actor_name,row_count,total,note&order=id.desc&limit=1', saleem.token)).body ?? [];
ok('the download was written down', after.length === 1 && after[0].kind === 'pdf_all', JSON.stringify(after));
ok('it names who took it', after[0]?.actor_name === saleem.name, JSON.stringify(after[0]));

const del = await rest(`report_downloads?id=eq.${after[0].id}`, saleem.token, { method: 'DELETE' });
ok('the log cannot be deleted', del.status >= 400, `status ${del.status}`);
const upd = await rest(`report_downloads?id=eq.${after[0].id}`, saleem.token, { method: 'PATCH', body: JSON.stringify({ note: 'changed' }) });
ok('the log cannot be edited', upd.status >= 400, `status ${upd.status}`);

section('6. One person only');
const mine = (await rpc('expense_report', { ...range, p_person_id: rana.id }, saleem.token)).body ?? [];
ok('a one-person report holds only that person', mine.length > 0 && mine.every((r) => r.person_id === rana.id), `${mine.length} rows`);
ok('it is a part of the whole', mine.length < rows.length);

console.log(`\n${pass} passed, ${failed} failed\n`);
process.exit(failed ? 1 : 0);
};

run().catch((e) => { console.error(e); process.exit(1); });
