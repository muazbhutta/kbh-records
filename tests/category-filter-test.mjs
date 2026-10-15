// Narrowing a report to one category, and to Petty or Invoice within it.
import { login, rest, rpc, scoreboard } from './lib.mjs';

const s = scoreboard();
const { ok, section } = s;
const near = (a, b) => Math.abs(Number(a) - Number(b)) < 0.005;
const sum = (rows) => rows.reduce((a, r) => a + Number(r.amount), 0);

const run = async () => {

section('0. Sign in');
const owner = await login('0501234567', '7391');
const emp = await login('0507778899', '5728');
ok('an Admin and an Employee are signed in', !!owner.token && !!emp.token);

const cats = (await rest('expense_categories?select=id,name&order=sort_order', owner.token)).body ?? [];
ok('there are categories to filter by', cats.length > 0, `${cats.length}`);

const ALL = { p_from: null, p_to: null };
const everything = (await rpc('expense_report', ALL, owner.token)).body ?? [];
const allTotals = (await rpc('expense_report_totals', ALL, owner.token)).body;
ok('the unfiltered report is the whole thing',
   near(sum(everything), allTotals.all_total), `${sum(everything)} vs ${allTotals.all_total}`);

section('1. One category at a time');
let addedUp = 0;
let counted = 0;
for (const c of cats) {
  const rows = (await rpc('expense_report', { ...ALL, p_category_id: c.id }, owner.token)).body ?? [];
  const totals = (await rpc('expense_report_totals', { ...ALL, p_category_id: c.id }, owner.token)).body;

  ok(`${c.name}: every row really is ${c.name}`,
     rows.every((r) => r.category_id === c.id),
     `${rows.filter((r) => r.category_id !== c.id).length} are not`);
  ok(`${c.name}: the rows add up to its total`,
     near(sum(rows), totals.all_total), `${sum(rows)} vs ${totals.all_total}`);
  ok(`${c.name}: petty + invoice = the category total`,
     near(Number(totals.petty_total) + Number(totals.invoice_total), totals.all_total),
     JSON.stringify(totals));

  addedUp += Number(totals.all_total);
  counted += Number(totals.entry_count);
}
ok('every category added together = the whole report',
   near(addedUp, allTotals.all_total), `${addedUp} vs ${allTotals.all_total}`);
ok('and so do the counts', counted === Number(allTotals.entry_count),
   `${counted} vs ${allTotals.entry_count}`);

section('2. A category and a kind of bill together');
const busiest = cats
  .map((c) => ({ c, n: everything.filter((r) => r.category_id === c.id).length }))
  .sort((a, b) => b.n - a.n)[0]?.c;
ok('there is a category with something in it', !!busiest, JSON.stringify(busiest));

if (busiest) {
  const petty = (await rpc('expense_report', { ...ALL, p_category_id: busiest.id, p_kind: 'petty' }, owner.token)).body ?? [];
  const invoice = (await rpc('expense_report', { ...ALL, p_category_id: busiest.id, p_kind: 'invoice' }, owner.token)).body ?? [];
  const both = (await rpc('expense_report', { ...ALL, p_category_id: busiest.id }, owner.token)).body ?? [];
  const totals = (await rpc('expense_report_totals', { ...ALL, p_category_id: busiest.id }, owner.token)).body;

  ok(`${busiest.name} + Petty holds only petty bills of that category`,
     petty.every((r) => r.expense_type === 'petty' && r.category_id === busiest.id),
     `${petty.length} rows`);
  ok(`${busiest.name} + Invoice holds only invoice bills of that category`,
     invoice.every((r) => r.expense_type === 'invoice' && r.category_id === busiest.id),
     `${invoice.length} rows`);
  ok('the two halves make the whole category', petty.length + invoice.length === both.length,
     `${petty.length} + ${invoice.length} vs ${both.length}`);
  ok('and their money agrees with the totals call',
     near(sum(petty), totals.petty_total) && near(sum(invoice), totals.invoice_total),
     `petty ${sum(petty)}/${totals.petty_total}, invoice ${sum(invoice)}/${totals.invoice_total}`);

  section('3. The photo ZIP is cut the same way');
  const photos = (await rpc('report_photos', { ...ALL, p_category_id: busiest.id }, owner.token)).body ?? [];
  const ids = new Set(both.map((r) => r.id));
  ok('every photo belongs to a row of that category',
     photos.every((p) => ids.has(p.entry_id)),
     `${photos.filter((p) => !ids.has(p.entry_id)).length} do not`);
  ok('and the count matches what the totals promised',
     photos.length === Number(totals.photo_count), `${photos.length} vs ${totals.photo_count}`);

  const pettyPhotos = (await rpc('report_photos', { ...ALL, p_category_id: busiest.id, p_kind: 'petty' }, owner.token)).body ?? [];
  ok('narrowing the ZIP to Petty takes fewer or the same photos',
     pettyPhotos.length <= photos.length, `${pettyPhotos.length} vs ${photos.length}`);
}

section('4. One person AND one category');
const people = (await rest('people_names?select=id,full_name', owner.token)).body ?? [];
const spender = people.find((p) => everything.some((r) => r.person_id === p.id));
if (spender && busiest) {
  const rows = (await rpc('expense_report', { ...ALL, p_person_id: spender.id, p_category_id: busiest.id }, owner.token)).body ?? [];
  ok(`${spender.full_name} + ${busiest.name}: both filters held`,
     rows.every((r) => r.person_id === spender.id && r.category_id === busiest.id),
     `${rows.length} rows`);
  const wider = everything.filter((r) => r.person_id === spender.id && r.category_id === busiest.id);
  ok('and it is exactly the slice the full report holds',
     rows.length === wider.length && near(sum(rows), sum(wider)),
     `${rows.length}/${sum(rows)} vs ${wider.length}/${sum(wider)}`);
}

section('5. A nonsense category gives nothing, not everything');
const nothing = (await rpc('expense_report', { ...ALL, p_category_id: '00000000-0000-0000-0000-000000000000' }, owner.token)).body ?? [];
ok('an unknown category returns no rows at all', nothing.length === 0, `${nothing.length} rows`);
const nothingTotals = (await rpc('expense_report_totals', { ...ALL, p_category_id: '00000000-0000-0000-0000-000000000000' }, owner.token)).body;
ok('and no money', near(nothingTotals.all_total, 0), JSON.stringify(nothingTotals));

section('6. Still Admin only');
for (const name of ['expense_report', 'expense_report_totals', 'report_photos']) {
  const r = await rpc(name, { ...ALL, p_category_id: cats[0]?.id }, emp.token);
  ok(`an Employee is still refused ${name}`, r.status >= 400, `status ${r.status}`);
}

section('7. There is only one log_report_download to call');
// 0024 added an argument with "create or replace", which makes a second
// function rather than replacing the first. Both shapes in the database
// means PostgREST refuses to choose, so a plain call must still work.
const plain = await rpc('log_report_download', {
  p_kind: 'pdf_all', p_rows: 1, p_total: 1, p_note: 'overload check',
}, owner.token);
ok('a call without the category still goes through', plain.status < 400, `status ${plain.status}`);

section('8. The download log remembers which slice was taken');
await rpc('log_report_download', {
  p_kind: 'pdf_all', ...ALL, p_rows: 1, p_total: 1,
  p_note: 'category filter test', p_category_id: busiest?.id,
}, owner.token);
const logged = (await rest('report_download_log?select=kind,category_name,note&order=id.desc&limit=1', owner.token)).body?.[0];
ok('the log names the category', logged?.category_name === busiest?.name, JSON.stringify(logged));

console.log('');
process.exit(s.finish('CATEGORY FILTER') ? 1 : 0);
};

run().catch((e) => { console.error(e); process.exit(1); });
