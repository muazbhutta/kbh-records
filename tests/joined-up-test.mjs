// Does every screen tell the same story? The dashboard, the People list,
// one person's khata, the reports and the teams all count the same money
// from different directions, so they have to land on the same figures.
import { login, rest, rpc, scoreboard } from './lib.mjs';

const s = scoreboard();
const { ok, section } = s;
const near = (a, b) => Math.abs(Number(a) - Number(b)) < 0.005;

const run = async () => {
const me = await login('0501234567', '7391');
const t = me.token;

section('1. The People list and each person\'s own totals agree');
const people = (await rest('people_list?select=id,full_name,head_id,money_given,transfers_in,transfers_out,expenses,returned,balance,entry_count', t)).body ?? [];
const totals = (await rest('person_totals?select=person_id,money_given,transfers_in,transfers_out,expenses,returned,balance,entry_count', t)).body ?? [];
const byId = new Map(totals.map((x) => [x.person_id, x]));

for (const p of people) {
  const pt = byId.get(p.id);
  if (!pt) {
    ok(`${p.full_name} has no entries and no totals row`, Number(p.balance) === 0, JSON.stringify(p));
    continue;
  }
  ok(`${p.full_name}: the list and the totals match`,
     near(p.balance, pt.balance) && near(p.expenses, pt.expenses) && near(p.money_given, pt.money_given),
     `list ${p.balance}/${p.expenses} vs totals ${pt.balance}/${pt.expenses}`);
}

section('2. Every balance is the sum of its own parts');
for (const p of people) {
  const worked = Number(p.money_given) + Number(p.transfers_in)
               - Number(p.transfers_out) - Number(p.expenses) - Number(p.returned);
  ok(`${p.full_name}: given + in - out - spent - returned = balance`,
     near(worked, p.balance), `${worked} vs ${p.balance}`);
}

section('3. The books balance');
const held = people.reduce((a, p) => a + Number(p.balance), 0);
const given = people.reduce((a, p) => a + Number(p.money_given), 0);
const spent = people.reduce((a, p) => a + Number(p.expenses), 0);
const back = people.reduce((a, p) => a + Number(p.returned), 0);
ok('every balance added up = given out, less spent, less returned',
   near(held, given - spent - back),
   `${held.toFixed(2)} vs ${(given - spent - back).toFixed(2)}`);
const sent = people.reduce((a, p) => a + Number(p.transfers_out), 0);
const got = people.reduce((a, p) => a + Number(p.transfers_in), 0);
ok('every riyal handed between staff was received by someone', near(sent, got),
   `sent ${sent} vs received ${got}`);

section('4. The dashboard agrees with the people it is summing');
const dash = (await rpc('dashboard_summary', { p_from: null, p_to: null }, t)).body;
const positive = people.filter((p) => Number(p.balance) > 0);
const owed = people.filter((p) => Number(p.balance) < 0);
ok('cash with people = every positive balance',
   near(dash.cash_with_people, positive.reduce((a, p) => a + Number(p.balance), 0)),
   `${dash.cash_with_people} vs ${positive.reduce((a, p) => a + Number(p.balance), 0)}`);
ok('owed back = every negative balance',
   near(dash.owed_back, Math.abs(owed.reduce((a, p) => a + Number(p.balance), 0))),
   `${dash.owed_back} vs ${Math.abs(owed.reduce((a, p) => a + Number(p.balance), 0))}`);
ok('the number of holders is right', Number(dash.holder_count) === positive.length,
   `${dash.holder_count} vs ${positive.length}`);
ok('all-time expenses = the sum of everyone\'s spending',
   near(dash.expenses, people.reduce((a, p) => a + Number(p.expenses), 0)),
   `${dash.expenses} vs ${people.reduce((a, p) => a + Number(p.expenses), 0)}`);

section('5. The report agrees with the dashboard');
const rt = (await rpc('expense_report_totals', { p_from: null, p_to: null }, t)).body;
ok('the all-time report total = the dashboard expenses', near(rt.all_total, dash.expenses),
   `report ${rt.all_total} vs dashboard ${dash.expenses}`);
ok('petty + invoice = the whole report',
   near(Number(rt.petty_total) + Number(rt.invoice_total), rt.all_total), JSON.stringify(rt));

const rows = (await rpc('expense_report', { p_from: null, p_to: null }, t)).body ?? [];
ok('the printed rows add up to the report total',
   near(rows.reduce((a, r) => a + Number(r.amount), 0), rt.all_total),
   `${rows.reduce((a, r) => a + Number(r.amount), 0)} vs ${rt.all_total}`);
ok('the row count matches', rows.length === Number(rt.entry_count),
   `${rows.length} vs ${rt.entry_count}`);

section('6. One person\'s report is their own spending');
for (const p of people.filter((x) => Number(x.expenses) > 0)) {
  const mine = (await rpc('expense_report_totals', { p_from: null, p_to: null, p_person_id: p.id }, t)).body;
  ok(`${p.full_name}: the report matches the People list`, near(mine.all_total, p.expenses),
     `report ${mine.all_total} vs list ${p.expenses}`);
}

section('7. Teams add up to their members');
const teams = (await rest('team_summary?select=head_id,head_name,people_count,team_cash,head_cash', t)).body ?? [];
for (const team of teams) {
  const members = people.filter((p) => p.head_id === team.head_id);
  const worked = members.reduce((a, p) => a + Math.max(Number(p.balance), 0), 0);
  ok(`${team.head_name}: team cash = their people's cash in hand`,
     near(team.team_cash, worked), `${team.team_cash} vs ${worked}`);
}

section('8. The ZIP will carry exactly the photos the report counted');
const photos = (await rpc('report_photos', { p_from: null, p_to: null }, t)).body ?? [];
ok('the photo list matches the photo count', photos.length === Number(rt.photo_count),
   `${photos.length} vs ${rt.photo_count}`);
const ids = new Set(rows.map((r) => r.id));
ok('every photo belongs to a row in the report',
   photos.every((p) => ids.has(p.entry_id)),
   `${photos.filter((p) => !ids.has(p.entry_id)).length} do not`);

section('9. Nothing cancelled or deleted leaks into the money');
const live = (await rest('entries?select=id&type=eq.expense&is_deleted=is.false&is_cancelled=is.false', t)).body ?? [];
ok('the report holds every live expense and no other', rows.length === live.length,
   `report ${rows.length} vs live ${live.length}`);

console.log('');
process.exit(s.finish('JOINED UP') ? 1 : 0);
};

run().catch((e) => { console.error(e); process.exit(1); });
