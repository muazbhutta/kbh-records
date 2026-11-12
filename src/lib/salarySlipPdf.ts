import { amountOnly, formatDateTime, money, monthName } from '@/lib/format';
import { KBH_LOGO_DATA_URI } from '@/lib/reportLogo';
import type { AttendanceSheetRow, SalaryLine, SalaryPayment } from '@/types';

/**
 * One man, one month, one sheet.
 *
 * The office hands this to a man on payday and it has to answer every
 * question he could ask without him asking it: which days he came in,
 * which of those were Fridays and so carried a bonus, what he drew in
 * advance and on which day and why, what he has been handed, and what
 * is still owed. Everything on one page, in the order he would ask.
 *
 * The register is the whole month, not just the days somebody marked -
 * a gap in a numbered list of days is a question answered ("nobody
 * said"), where a short list is a question asked ("where is the 14th?").
 *
 * An advance sits on the line of the day it was taken, with its reason
 * beside it, because that is how it is argued about: not "you took 500
 * this month" but "you took 500 on the Tuesday, for your brother".
 *
 * A4 portrait, one page per man, each starting on a new sheet so the
 * office can tear them apart and hand them out.
 */

export type SalarySlipMeta = {
  /** The first of the month, as the whole app names a month. */
  month: string;
  generatedBy: string;
  logoDataUri?: string | null;
};

/** One man's month, gathered from the three things the database knows. */
export type SalarySlip = {
  line: SalaryLine;
  /** His own marked days, in date order. */
  days: AttendanceSheetRow[];
  /** His own advances and salary payments, in date order. */
  payments: SalaryPayment[];
};

const escape = (value: unknown): string =>
  String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

const DAY_NAMES = ['Itwar', 'Peer', 'Mangal', 'Budh', 'Jumerat', 'JUMA', 'Hafta'];

/**
 * The days of a month, as plain 'YYYY-MM-DD' strings.
 *
 * Built in UTC on purpose. `new Date('2026-11-01')` is midnight UTC, and
 * reading its local day in Jeddah or anywhere east of London would give
 * the 1st, while west of it gives the 31st of October. UTC in and UTC
 * out keeps the register honest wherever the phone happens to be.
 */
function daysOfMonth(month: string): { date: string; dow: number }[] {
  const [y, m] = month.split('-').map(Number);
  const out: { date: string; dow: number }[] = [];
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  for (let d = 1; d <= last; d++) {
    const at = new Date(Date.UTC(y, m - 1, d));
    out.push({ date: `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`, dow: at.getUTCDay() });
  }
  return out;
}

/** How the man is paid, in the words he is told it in. */
function terms(line: SalaryLine): string {
  if (line.pay_kind === 'daily') {
    return `${money(Number(line.daily_rate))} roz ka`;
  }
  const wage = Number(line.monthly_amount) > 0
    ? `${money(Number(line.monthly_amount))} mahana`
    : 'Mahana tankhwah abhi tay nahi';
  return Number(line.friday_bonus) > 0
    ? `${wage} · har Juma kaam kiya to ${money(Number(line.friday_bonus))}`
    : wage;
}

/**
 * The sum at the foot: how the last figure on the page was arrived at.
 *
 * Read down, in order, the way a man would ask it: what was left over
 * from last month, what this month came to, what he has taken against
 * it, and what that leaves. The words are the ones he is paid in.
 */
function statement(slip: SalarySlip, month: string): string {
  const { line } = slip;
  const daily = line.pay_kind === 'daily';
  const earned = Number(line.earned);
  const advance = Number(line.advance_paid);
  const paid = Number(line.salary_paid);
  const carried = Number(line.carried_in);
  const left = Number(line.remaining);

  const rows: { label: string; note: string; value: number; tone?: string }[] = [];

  /*
   * Last month, before anything of this one.
   *
   * It is first because it is the thing a man argues about, and
   * burying it under the month's own figures is how an office ends up
   * explaining the same 200 riyals every payday.
   */
  if (Math.abs(carried) >= 0.005) {
    rows.push(
      carried > 0
        ? {
            label: 'Pichhle mahine ka baqi',
            note: 'Company ne pichhle mahine ka itna dena tha',
            value: carried,
            tone: 'carry',
          }
        : {
            label: 'Pichhle mahine zyada liya',
            note: 'Us mahine kamai se itna zyada liya tha - is mahine kat raha hai',
            value: carried,
            tone: 'owes',
          },
    );
  }

  if (daily) {
    rows.push({
      label: 'Dehaari',
      note: `${line.days_present} din kaam kiya, har din ${money(Number(line.daily_rate))}`,
      value: earned,
    });
  } else {
    rows.push({
      label: 'Mahane ki tankhwah',
      note: monthName(month),
      value: Number(line.monthly_amount),
    });
    if (Number(line.friday_bonus) > 0) {
      rows.push({
        label: 'Juma bonus',
        note: `${line.bonus_days} Juma kaam kiya, har Juma ${money(Number(line.friday_bonus))}`,
        value: Number(line.bonus_total),
        tone: 'bonus',
      });
    }
  }

  const lines = rows
    .map(
      (r) => `<tr class="${r.tone ?? ''}">
        <td class="s-l">${escape(r.label)}${
          r.tone === 'bonus' ? '<span class="star">&#9733;</span>' : ''
        }<span class="s-n">${escape(r.note)}</span></td>
        <td class="num">${r.value < 0 ? '&minus;&thinsp;' : ''}${escape(
          amountOnly(Math.abs(r.value)),
        )}</td>
      </tr>`,
    )
    .join('');

  const owesBack = left < -0.005;
  const settled = Math.abs(left) < 0.005;

  return `
  <table class="state">
    <colgroup><col style="width:66%" /><col style="width:34%" /></colgroup>
    <tbody>
      ${lines}
      <tr class="rule">
        <td class="s-l">Kul bana<span class="s-n">${
          Math.abs(carried) >= 0.005
            ? 'Pichhle mahine ka milakar'
            : 'Is mahine ki kul kamai'
        }</span></td>
        <td class="num strong">${escape(amountOnly(carried + earned))}</td>
      </tr>
      <tr class="less">
        <td class="s-l">Advance liya<span class="s-n">${
          advance > 0 ? 'Tankhwah se pehle liya - upar har din ke samne likha hai' : 'Kuch nahi liya'
        }</span></td>
        <td class="num">&minus;&thinsp;${escape(amountOnly(advance))}</td>
      </tr>
      <tr class="less">
        <td class="s-l">Tankhwah mili<span class="s-n">${
          paid > 0 ? 'Company ne di' : 'Abhi nahi mili'
        }</span></td>
        <td class="num">&minus;&thinsp;${escape(amountOnly(paid))}</td>
      </tr>
    </tbody>
  </table>
  <div class="owed ${owesBack ? 'owes' : settled ? 'settled' : ''}">
    <div class="owed-l">${
      owesBack ? 'Aap ne zyada liya hai' : settled ? 'Hisaab poora ho gaya' : 'Baqi - company aap ko degi'
    }</div>
    <div class="owed-v">${escape(money(Math.abs(left)))}</div>
    <div class="owed-n">${
      owesBack
        ? 'Itna agle mahine ki tankhwah se kaat liya jayega'
        : `Company ab tak de chuki: ${money(advance + paid)}`
    }</div>
  </div>`;
}

/** One man's page. */
function slipPage(slip: SalarySlip, meta: SalarySlipMeta): string {
  const { line } = slip;
  const daily = line.pay_kind === 'daily';

  // Nothing left to pay, on a month that was worth something. Said the
  // same way on the tile and on the block at the foot, so the top of the
  // page and the bottom of it cannot seem to disagree.
  const settled = Math.abs(Number(line.remaining)) < 0.005;
  // He has drawn more than he has earned. Not an error, and not his
  // fault - but the one thing on the page that must not read like good
  // news, because it comes off next month.
  const owesBack = Number(line.remaining) < -0.005;

  const marked = new Map(slip.days.map((d) => [d.on_date, d]));
  const drawn = new Map<string, SalaryPayment[]>();
  for (const p of slip.payments) {
    const had = drawn.get(p.paid_on);
    if (had) had.push(p);
    else drawn.set(p.paid_on, [p]);
  }

  /*
   * The register, in two columns.
   *
   * A full month down one column ran a man's page onto a second sheet,
   * which put his wages on one page and the sum of them on another -
   * the two things nobody should have to hold side by side. Two columns
   * of sixteen days fit the month, the statement and the signatures on
   * one sheet, which is what the office hands over.
   *
   * The reason sits under the amount in the same cell rather than in a
   * column of its own. On a register, twenty-eight of thirty days have
   * no reason to give, and a column kept empty for two of them is the
   * width that pushed the month onto a second sheet in the first place.
   */
  const dayCells = daysOfMonth(meta.month).map(({ date, dow }) => {
    const a = marked.get(date);
    const here = drawn.get(date) ?? [];
    /*
     * What the day was worth is what was written down on the day, not
     * what the man is on now. The database stores it that way - a daily
     * man's wage and a monthly man's Friday bonus both land in the same
     * column when the day is marked - and the statement at the foot of
     * this page is summed from those same stored figures.
     *
     * Reading anything else here, such as today's bonus, would let the
     * register and the statement disagree the first time the office
     * changed a man's terms mid-month.
     */
    const worth = a?.present ? Number(a.rate ?? (daily ? line.daily_rate : 0)) : 0;
    const bonus = !daily && dow === 5 && worth > 0;

    const mark = !a
      ? '<span class="m none">Likha nahi</span>'
      : a.present
        ? '<span class="m in">Hazir</span>'
        : '<span class="m out">Chhutti</span>';

    const took = here
      .map(
        (pay) => `<div class="took-l"><span class="took ${pay.kind}">${
          pay.kind === 'advance' ? 'Advance' : 'Tankhwah'
        } ${escape(amountOnly(Number(pay.amount)))}</span><span class="why bidi">${escape(
          pay.note || (pay.kind === 'advance' ? 'Wajah nahi likhi' : 'Mahine ki tankhwah'),
        )}${pay.entered_by_name ? ` &middot; likha: ${escape(pay.entered_by_name)}` : ''}</span></div>`,
      )
      .join('');

    return `<tr class="${bonus ? 'fri' : ''}${a ? '' : ' quiet'}">
      <td class="dt"><b>${Number(date.slice(8))}</b> <span class="dw">${DAY_NAMES[dow]}</span></td>
      <td>${mark}${bonus ? '<span class="fri-tag">&#9733; Juma bonus</span>' : ''}</td>
      <td class="num small">${worth > 0 ? escape(amountOnly(worth)) : ''}</td>
      <td class="took-c">${took}</td>
    </tr>`;
  });

  const half = Math.ceil(dayCells.length / 2);
  const column = (cells: string[]) => `<table class="reg">
    <colgroup>
      <col style="width:21%" /><col style="width:27%" /><col style="width:20%" /><col style="width:32%" />
    </colgroup>
    <thead>
      <tr>
        <th>Tareekh</th><th>Hazri</th><th class="num">Us din ka</th><th>Us din liya</th>
      </tr>
    </thead>
    <tbody>${cells.join('')}</tbody>
  </table>`;
  const register = `<div class="reg-two">
    <div class="reg-col">${column(dayCells.slice(0, half))}</div>
    <div class="reg-col">${column(dayCells.slice(half))}</div>
  </div>`;

  return `
<section class="person">
  <div class="band">
    <span class="mark"><img src="${meta.logoDataUri ?? KBH_LOGO_DATA_URI}" alt="KBH Construction" /></span>
    <div class="brand">
      <div class="name">KBH CONSTRUCTION</div>
      <div class="place">Jeddah, Saudi Arabia</div>
    </div>
    <div class="right">
      <div class="title">Tankhwah aur Hazri</div>
      <div class="period">${escape(monthName(meta.month))}${
        line.slip_no > 0 ? ` &middot; Parchi #${String(line.slip_no).padStart(2, '0')}` : ''
      }</div>
    </div>
  </div>

  <div class="who">
    <div class="who-l">
      <div class="who-n bidi">${escape(line.full_name)}</div>
      <div class="who-j bidi">${escape(line.job_title ?? 'Kaam likha nahi')}</div>
    </div>
    <div class="who-r">
      <span class="kind ${daily ? 'daily' : 'monthly'}">${daily ? 'Dehaari mazdoor' : 'Mahana mulazim'}</span>
      <div class="who-t">${escape(terms(line))}</div>
    </div>
  </div>

  <div class="tiles">
    <div class="tile">
      <div class="tile-v">${line.days_present}</div>
      <div class="tile-l">Kaam ke din</div>
    </div>
    <div class="tile">
      <div class="tile-v">${Math.max(0, Number(line.days_marked) - Number(line.days_present))}</div>
      <div class="tile-l">Chhutti</div>
    </div>
    ${
      daily
        ? `<div class="tile">
            <div class="tile-v">${escape(amountOnly(Number(line.daily_rate)))}</div>
            <div class="tile-l">Roz ka</div>
          </div>`
        : `<div class="tile bonus">
            <div class="tile-v">${line.bonus_days}</div>
            <div class="tile-l">Juma kaam kiya</div>
          </div>`
    }
    <div class="tile">
      <div class="tile-v">${escape(amountOnly(Number(line.earned)))}</div>
      <div class="tile-l">Is mahine bana</div>
    </div>
    <div class="tile owed-tile${settled ? ' settled' : ''}${owesBack ? ' owes' : ''}">
      <div class="tile-v">${escape(amountOnly(Math.abs(Number(line.remaining))))}</div>
      <div class="tile-l">${
        owesBack ? 'Zyada liya' : settled ? 'Hisaab poora' : 'Baqi'
      }</div>
    </div>
  </div>

  <h2>Mahine ka hisaab, din ba din</h2>
  ${
    slip.days.length === 0 && slip.payments.length === 0
      ? '<div class="empty">Is mahine na hazri lagi, na kuch diya gaya.</div>'
      : register
  }

  <div class="close">
    <div class="close-l">
      <h2>Dastkhat</h2>
      <div class="sign">
        <div>Lene wala &nbsp;________________________</div>
        <div>Dene wala &nbsp;________________________</div>
      </div>
      <div class="says">
        Har advance aur har tankhwah upar usi din ke samne likhi hai jis
        din li gayi, wajah ke saath.
      </div>
    </div>
    <div class="close-r">
      <h2>Hisaab</h2>
      ${statement(slip, meta.month)}
    </div>
  </div>

  <!-- The company signs off the page, and the particulars sit under it. -->
  <div class="foot">
    <div class="foot-name">KBH CONSTRUCTION &middot; Jeddah, Saudi Arabia</div>
    <div class="foot-line bidi">${escape(line.full_name)} &middot; ${escape(
      monthName(meta.month),
    )}${
      line.slip_no > 0 ? ` &middot; Parchi #${String(line.slip_no).padStart(2, '0')}` : ''
    } &middot; Banayi: ${escape(meta.generatedBy)} &middot; ${escape(
      formatDateTime(new Date()),
    )}</div>
  </div>
</section>`;
}

export function buildSalarySlipsHtml(slips: SalarySlip[], meta: SalarySlipMeta): string {
  const pages = slips.map((s) => slipPage(s, meta)).join('');

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Tankhwah aur Hazri &mdash; ${escape(monthName(meta.month))}</title>
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Noto+Naskh+Arabic:wght@400;600;700&display=swap" rel="stylesheet" />
<style>
  /*
     A4 portrait with no page margin, because a browser prints its own
     address and page number into that margin and nobody wants a
     github.io link down the side of the company's wages. Keeping the
     paper's edges clear is then the page's own job, which is what the
     padding on .person is for.
  */
  @page { size: 210mm 297mm; margin: 0; }
  @media print { @page { size: 210mm 297mm; margin: 0; } }
  * { box-sizing: border-box; }
  html { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  body {
    font-family: 'Inter', 'Noto Naskh Arabic', 'Segoe UI', Tahoma, sans-serif;
    color: #0E2340;
    font-size: 10.5px;
    line-height: 1.4;
    margin: 0;
    background: #fff;
  }

  /* One man, one sheet. Each starts a new page so they can be torn apart. */
  .person { padding: 10mm 10mm 7mm; break-after: page; page-break-after: always; }
  .person:last-child { break-after: auto; page-break-after: auto; }

  /* ----------------------------------------------------- the head band */
  .band {
    background: #0E2340; color: #fff; border-radius: 10px;
    padding: 12px 15px; display: flex; align-items: center; gap: 12px;
  }
  .band .mark {
    width: 38px; height: 38px; border-radius: 9px; background: #fff;
    display: flex; align-items: center; justify-content: center; flex: none;
  }
  .band .mark img { width: 28px; height: 28px; object-fit: contain; }
  .brand .name { font-size: 14px; font-weight: 700; letter-spacing: 0.2px; }
  .brand .place { font-size: 9.5px; color: #A9BBD0; }
  .band .right { margin-left: auto; text-align: right; }
  .band .right .title { font-size: 14.5px; font-weight: 700; letter-spacing: -0.2px; }
  .band .right .period { font-size: 10px; color: #A9BBD0; margin-top: 1px; }

  /* --------------------------------------------------------- the man */
  .who {
    display: flex; align-items: flex-end; gap: 14px;
    padding: 11px 2px 10px; border-bottom: 1.5px solid #EEF1F6; margin-bottom: 10px;
  }
  .who-l { flex: 1; min-width: 0; }
  .who-n { font-size: 20px; font-weight: 700; letter-spacing: -0.5px; unicode-bidi: plaintext; }
  .who-j { font-size: 10.5px; color: #5B6B7F; margin-top: 1px; }
  .who-r { text-align: right; flex: none; }
  .who-t { font-size: 10.5px; color: #0E2340; font-weight: 600; margin-top: 4px; }
  .kind {
    display: inline-block; font-size: 8.5px; font-weight: 700; letter-spacing: 0.6px;
    text-transform: uppercase; padding: 3px 9px; border-radius: 999px;
  }
  .kind.monthly { background: #E6F1F7; color: #0B6493; }
  .kind.daily { background: #FFF5DF; color: #A8730B; }

  /* -------------------------------------------------------- the tiles */
  .tiles { display: flex; gap: 6px; }
  .tile {
    flex: 1; border: 1px solid #E3E8EF; border-radius: 9px;
    padding: 8px 9px; background: #fff; min-width: 0;
  }
  .tile-v { font-size: 16px; font-weight: 700; letter-spacing: -0.3px; font-variant-numeric: tabular-nums; }
  .tile-l {
    font-size: 7.8px; text-transform: uppercase; letter-spacing: 0.6px;
    color: #8A99AB; margin-top: 1px;
  }
  .tile.bonus { background: #FFF9EC; border-color: #F6DFA6; }
  .tile.bonus .tile-v { color: #A8730B; }
  .tile.bonus .tile-l { color: #A8730B; }
  .tile.owed-tile { background: #0E2340; border-color: #0E2340; }
  .tile.owed-tile.settled { background: #126E45; border-color: #126E45; }
  .tile.owed-tile.settled .tile-l { color: #BFE3CF; }
  .tile.owed-tile.owes { background: #B3261E; border-color: #B3261E; }
  .tile.owed-tile.owes .tile-l { color: #F6CFCC; }
  .tile.owed-tile .tile-v { color: #fff; }
  .tile.owed-tile .tile-l { color: #A9BBD0; }

  /* -------------------------------------------------------- the table */
  h2 {
    font-size: 8.5px; text-transform: uppercase; letter-spacing: 0.9px;
    color: #8A99AB; margin: 13px 0 5px; font-weight: 700;
  }
  table { width: 100%; border-collapse: collapse; table-layout: fixed; }
  th {
    text-align: left; font-size: 8px; letter-spacing: 0.6px; text-transform: uppercase;
    color: #5B6B7F; font-weight: 700;
    background: #F5F7FA; padding: 5px 6px; border-bottom: 1px solid #CBD5E1;
  }
  th:first-child { border-radius: 6px 0 0 0; }
  th:last-child { border-radius: 0 6px 0 0; }
  td { padding: 3.2px 6px; border-bottom: 1px solid #F2F5F9; vertical-align: middle; }
  thead { display: table-header-group; }
  tr { break-inside: avoid; page-break-inside: avoid; }
  td, th { overflow-wrap: anywhere; }
  .num { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; font-weight: 600; }
  .num.small { font-weight: 500; color: #5B6B7F; }
  .small { font-size: 9px; color: #5B6B7F; }
  /* An Arabic or Urdu name or reason reads right-to-left in this left-to-right table. */
  .bidi { unicode-bidi: plaintext; }

  /* Two columns of days, so a whole month fits the sheet it belongs on. */
  .reg-two { display: flex; gap: 9px; align-items: flex-start; }
  .reg-col { flex: 1; min-width: 0; }
  .reg td { padding: 1.7px 5px; font-size: 10px; line-height: 1.28; }
  .reg th { padding: 4px 5px; font-size: 7.6px; }
  /* A day nobody answered for is there, but it does not shout. */
  .reg .quiet td { color: #AAB6C4; background: #FDFDFE; }
  .reg .dt { white-space: nowrap; font-variant-numeric: tabular-nums; }
  .reg .dt b { font-size: 10.5px; }
  .reg .dw { color: #8A99AB; font-size: 8.6px; }
  /* The reason sits under the amount, on the day's own line. */
  .took-c { padding-right: 4px; }
  .took-l + .took-l { margin-top: 2px; }
  .reg .why { display: block; color: #5B6B7F; font-size: 8.7px; line-height: 1.3; margin-top: 0.5px; }

  .m { font-size: 9px; font-weight: 700; letter-spacing: 0.2px; }
  .m.in { color: #157347; }
  .m.out { color: #B3261E; }
  .m.none { color: #C4CCD6; }

  /* A worked Friday is the one line on the sheet that has to catch the
     eye, because it is the only thing that moves a monthly man's figure
     off his wage - so it gets the whole row, not just a mark. */
  .reg tr.fri td {
    background: #FFF6E0;
    border-bottom-color: #F3E3BC;
  }
  .reg tr.fri .dt b { color: #A8730B; }
  .fri-tag {
    display: block; font-size: 7.2px; font-weight: 700; letter-spacing: 0.3px;
    color: #A8730B; text-transform: uppercase; margin-top: 0;
  }

  .took {
    display: inline-block; font-size: 8.2px; font-weight: 700; letter-spacing: 0.2px;
    padding: 1px 5px; border-radius: 999px; white-space: nowrap;
    font-variant-numeric: tabular-nums;
  }
  .took.advance { background: #FFF5DF; color: #A8730B; }
  .took.salary { background: #E7F6EE; color: #157347; }

  .empty {
    padding: 20px; text-align: center; color: #8A99AB;
    border: 1px dashed #CBD5E1; border-radius: 9px;
  }

  /* -------------------------------------------------------- the close */
  .close { display: flex; gap: 14px; margin-top: 2px; align-items: flex-start; }
  .close-l { flex: 1; min-width: 0; }
  .close-r { flex: 1.12; min-width: 0; }
  .close h2 { margin-top: 13px; }
  .close, .sign, .state, .owed { break-inside: avoid; page-break-inside: avoid; }

  .state { border: 1px solid #E3E8EF; border-radius: 9px 9px 0 0; overflow: hidden; }
  .state td { border-bottom: 1px solid #EEF1F6; padding: 4px 10px; }
  .state tr:last-child td { border-bottom: 0; }
  .state .s-l { font-weight: 600; font-size: 10px; }
  .state .s-n { display: block; font-weight: 400; font-size: 8.6px; color: #8A99AB; }
  .state tr.bonus td { background: #FFF9EC; }
  .state tr.bonus .s-l, .state tr.bonus .num { color: #A8730B; }
  /* What last month left behind, in its own colour either way. */
  .state tr.carry td { background: #EFF6FB; }
  .state tr.carry .s-l, .state tr.carry .num { color: #0B6493; }
  .state tr.owes td { background: #FDEEEC; }
  .state tr.owes .s-l, .state tr.owes .num { color: #B3261E; }
  .state .star { color: #E0A80D; margin-left: 4px; }
  .state tr.rule td { border-top: 1.5px solid #CBD5E1; background: #F8FAFC; }
  .state tr.rule .num.strong { font-size: 13px; font-weight: 700; }
  .state tr.less .num { color: #B3261E; }

  .owed {
    background: #0E2340; color: #fff; border-radius: 0 0 9px 9px;
    padding: 9px 12px 10px;
  }
  .owed.settled { background: #126E45; }
  .owed.owes { background: #B3261E; }
  .owed.owes .owed-l, .owed.owes .owed-n { color: #F6CFCC; }
  .owed-l {
    font-size: 8px; text-transform: uppercase; letter-spacing: 0.8px; color: #A9BBD0;
    font-weight: 700;
  }
  .owed-v {
    font-size: 24px; font-weight: 700; letter-spacing: -0.8px; margin-top: 1px;
    font-variant-numeric: tabular-nums;
  }
  .owed-n { font-size: 8.8px; color: #A9BBD0; margin-top: 2px; }
  .owed.settled .owed-l, .owed.settled .owed-n { color: #BFE3CF; }

  .sign { display: flex; flex-direction: column; gap: 15px; margin-top: 8px; }
  .sign div { border-top: 1px solid #CBD5E1; padding-top: 5px; color: #8A99AB; font-size: 9px; }
  .says {
    margin-top: 15px; color: #8A99AB; font-size: 8.6px; line-height: 1.4;
    padding-left: 8px; border-left: 2px solid #EEF1F6;
  }
  .foot {
    margin-top: 10px; padding-top: 7px; border-top: 1px solid #EEF1F6;
    text-align: center;
  }
  .foot-name {
    font-size: 9.6px; font-weight: 700; letter-spacing: 1.1px; color: #0E2340;
  }
  .foot-line { font-size: 8px; color: #A3B0C0; margin-top: 2px; }

  /* On a phone the sheet stops pretending to be paper and just fits. */
  @media screen and (max-width: 640px) {
    .person { padding: 14px 12px 20px; }
    .band { flex-wrap: wrap; }
    .band .right { margin-left: 0; text-align: left; width: 100%; }
    .who { flex-direction: column; align-items: flex-start; gap: 7px; }
    .who-r { text-align: left; }
    /* Two columns of days is a shape for paper. On a phone the month
       runs down the screen, where there is room for the figures. */
    .reg-two { flex-direction: column; gap: 0; }
    .reg-col + .reg-col table thead { display: none; }
    .reg td { font-size: 11px; padding: 5px 7px; }
    .reg .why { font-size: 9.5px; }
    .tiles { flex-wrap: wrap; }
    .tile { min-width: 29%; }
    .close { flex-direction: column; }
    .sign { gap: 18px; }
  }
</style>
</head>
<body>
${
  slips.length === 0
    ? `<section class="person"><div class="empty">${escape(
        monthName(meta.month),
      )} mein koi tankhwah par nahi tha.</div></section>`
    : pages
}
</body>
</html>`;
}

const SHORT_MONTH = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
                     'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "Oct_2026", which reads at a glance where "2026-10" has to be worked out. */
export function monthSlug(month: string): string {
  const [y, m] = month.split('-').map(Number);
  return `${SHORT_MONTH[m - 1] ?? m}_${y}`;
}

/**
 * The file name: whose slip it is, which month, and which of his.
 *
 *   KBH_Salary_Shehriyar_Oct_2026_Slip#01.pdf
 *
 * No time stamp. The month and the number name the slip, and the same
 * slip taken twice should land on itself rather than beside itself.
 */
export function salarySlipFileName(
  month: string,
  who: string | null,
  slipNo?: number,
): string {
  if (!who) return `KBH_Salary_Slips_${monthSlug(month)}.pdf`;
  const name = who.replace(/[^\p{L}\p{N}]+/gu, '_').replace(/^_|_$/g, '');
  const no = slipNo && slipNo > 0 ? `_Slip#${String(slipNo).padStart(2, '0')}` : '';
  return `KBH_Salary_${name}_${monthSlug(month)}${no}.pdf`;
}

/** Cuts the month's register and payments down to one man's own. */
export function slipFor(
  line: SalaryLine,
  days: AttendanceSheetRow[],
  payments: SalaryPayment[],
): SalarySlip {
  return {
    line,
    days: days
      .filter((d) => d.person_id === line.person_id)
      .sort((a, b) => a.on_date.localeCompare(b.on_date)),
    payments: payments
      .filter((p) => p.person_id === line.person_id)
      .sort((a, b) => a.paid_on.localeCompare(b.paid_on) || a.id - b.id),
  };
}
