import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { Platform } from 'react-native';

import { amountOnly, formatDate, formatDateTime, formatTime, money, stampInRiyadh } from '@/lib/format';
import { KBH_LOGO_DATA_URI } from '@/lib/reportLogo';
import type { ReportRow } from '@/types';

/**
 * The three PDFs: Petty, Invoice, All Expenses.
 *
 * A4 portrait, so the same sheet reads well held in the hand on a phone
 * and sits straight in a file. No photos go in a PDF - they come in the
 * ZIP instead, so a report stays small enough to send on WhatsApp.
 *
 * Names can be Arabic or Urdu. The page asks for a Noto Arabic font and
 * marks the name and note cells `unicode-bidi: plaintext`, so a
 * right-to-left name sits correctly inside a left-to-right table.
 */

export type ReportKind = 'petty' | 'invoice' | 'all';

export const REPORT_TITLE: Record<ReportKind, string> = {
  petty: 'Petty Expenses Report',
  invoice: 'Invoice Expenses Report',
  all: 'All Expenses Report',
};

export type ReportMeta = {
  kind: ReportKind;
  from?: string;
  to?: string;
  personName: string | null;
  /** Which category the report was narrowed to, or null for all. */
  categoryName?: string | null;
  generatedBy: string;
  logoDataUri?: string | null;
};

const escape = (value: unknown): string =>
  String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

/**
 * "01 - 31 Oct 2026" when it is one month, "01 Oct - 30 Nov 2026" inside
 * one year, and the long form only when it has to be.
 */
function periodText(from?: string, to?: string): string {
  if (!from && !to) return 'All time';
  if (!to) return `From ${formatDate(from)}`;
  if (!from) return `Up to ${formatDate(to)}`;

  const a = formatDate(from).split(' '); // ["01","Oct","2026"]
  const b = formatDate(to).split(' ');
  if (a.length === 3 && b.length === 3) {
    if (a[1] === b[1] && a[2] === b[2]) return `${a[0]} &ndash; ${b[0]} ${b[1]} ${b[2]}`;
    if (a[2] === b[2]) return `${a[0]} ${a[1]} &ndash; ${b[0]} ${b[1]} ${b[2]}`;
  }
  return `${formatDate(from)} &ndash; ${formatDate(to)}`;
}

/** The three or four figures that sit across the top of the sheet. */
function summaryTiles(rows: ReportRow[], kind: ReportKind, total: number): string {
  const photos = rows.reduce((s, r) => s + Number(r.photo_count ?? 0), 0);
  const petty = rows
    .filter((r) => r.expense_type !== 'invoice')
    .reduce((s, r) => s + Number(r.amount), 0);
  const invoice = total - petty;

  const tiles =
    kind === 'all'
      ? [
          { label: 'Expenses', value: String(rows.length), tone: '' },
          { label: 'Petty', value: amountOnly(petty), tone: 'petty' },
          { label: 'Invoice', value: amountOnly(invoice), tone: 'invoice' },
          { label: 'Total (SAR)', value: amountOnly(total), tone: 'total' },
        ]
      : [
          { label: 'Expenses', value: String(rows.length), tone: '' },
          { label: 'Bill photos', value: String(photos), tone: '' },
          { label: 'Total (SAR)', value: amountOnly(total), tone: 'total' },
        ];

  return tiles
    .map(
      (t) => `<div class="tile ${t.tone}">
        <div class="tile-v">${escape(t.value)}</div>
        <div class="tile-l">${escape(t.label)}</div>
      </div>`,
    )
    .join('');
}

export function buildReportHtml(rows: ReportRow[], meta: ReportMeta): string {
  const total = rows.reduce((sum, r) => sum + Number(r.amount), 0);

  const byCategory = new Map<string, { total: number; count: number }>();
  for (const row of rows) {
    const key = row.category_name ?? 'Uncategorised';
    const current = byCategory.get(key) ?? { total: 0, count: 0 };
    current.total += Number(row.amount);
    current.count += 1;
    byCategory.set(key, current);
  }
  const categories = [...byCategory.entries()].sort((a, b) => b[1].total - a[1].total);
  const biggest = categories[0]?.[1].total ?? 0;

  const bodyRows = rows
    .map(
      (r) => `
      <tr>
        <td class="id">${escape(r.system_id ?? '')}</td>
        <td class="when">
          <span class="d">${escape(formatDate(r.bill_date))}</span>
          <span class="t">${escape(formatTime(r.entered_at))}</span>
        </td>
        <td class="bidi who">${escape(r.person_name ?? '')}</td>
        <td class="bidi">${escape(r.category_name ?? '')}</td>
        <td class="mid"><span class="tag ${
          r.expense_type === 'invoice' ? 'invoice' : 'petty'
        }">${r.expense_type === 'invoice' ? 'Invoice' : 'Petty'}</span></td>
        <td class="bidi note">${escape(r.note ?? '')}</td>
        <td class="num">${escape(amountOnly(Number(r.amount)))}</td>
      </tr>`,
    )
    .join('');

  const categoryRows = categories
    .map(
      ([name, v]) => `
      <tr>
        <td class="bidi">
          <span class="cat-name">${escape(name)}</span>
          <span class="bar"><i style="width:${
            biggest > 0 ? Math.max(3, Math.round((v.total / biggest) * 100)) : 0
          }%"></i></span>
        </td>
        <td class="num small">${v.count}</td>
        <td class="num">${escape(amountOnly(v.total))}</td>
      </tr>`,
    )
    .join('');

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${escape(REPORT_TITLE[meta.kind])}</title>
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Noto+Naskh+Arabic:wght@400;600;700&display=swap" rel="stylesheet" />
<style>
  /* A4 portrait, said in millimetres so no printer can turn it sideways. */
  /*
     The page keeps its margins here, unlike the bill photos next door
     where each sheet is its own page and can hold its own padding.
     This report is a table that flows over as many pages as it needs,
     and padding on the body would only pad the first page and the last:
     every page in between would print to the edge of the paper, where
     most printers cut it off.

     So a browser may still print its address and page number here if
     the person has that switched on. That is a line in the print
     options, not a hole in the report.
  */
  @page { size: 210mm 297mm; margin: 12mm 11mm 14mm; }
  @media print { @page { size: 210mm 297mm; } }
  * { box-sizing: border-box; }
  html { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  body {
    font-family: 'Inter', 'Noto Naskh Arabic', 'Segoe UI', Tahoma, sans-serif;
    color: #0E2340;
    font-size: 11px;
    line-height: 1.45;
    margin: 0;
    background: #fff;
  }

  /* ----------------------------------------------------- the head band */
  .band {
    background: #0E2340;
    color: #fff;
    border-radius: 10px;
    padding: 13px 16px;
    display: flex;
    align-items: center;
    gap: 13px;
  }
  .band .mark {
    width: 40px; height: 40px; border-radius: 9px; background: #fff;
    display: flex; align-items: center; justify-content: center; flex: none;
  }
  .band .mark img { width: 30px; height: 30px; object-fit: contain; }
  .brand .name { font-size: 14.5px; font-weight: 700; letter-spacing: 0.2px; }
  .brand .place { font-size: 10px; color: #A9BBD0; }
  .band .right { margin-left: auto; text-align: right; }
  .band .right .title { font-size: 15.5px; font-weight: 700; letter-spacing: -0.2px; }
  .band .right .period { font-size: 10.5px; color: #A9BBD0; margin-top: 1px; }

  /* --------------------------------------------------------- the facts */
  .facts {
    display: flex; flex-wrap: wrap; gap: 4px 26px;
    padding: 10px 4px 0; color: #5B6B7F; font-size: 10px;
  }
  .facts b { color: #0E2340; font-weight: 600; }

  /* --------------------------------------------------------- the tiles */
  .tiles { display: flex; gap: 8px; margin-top: 9px; }
  .tile {
    flex: 1; border: 1px solid #E3E8EF; border-radius: 9px;
    padding: 9px 11px; background: #fff;
  }
  .tile-v { font-size: 17px; font-weight: 700; letter-spacing: -0.3px; font-variant-numeric: tabular-nums; }
  .tile-l { font-size: 8.5px; text-transform: uppercase; letter-spacing: 0.7px; color: #8A99AB; margin-top: 1px; }
  .tile.petty   { background: #FFF5DF; border-color: #F6DFA6; }
  .tile.petty   .tile-v { color: #C98B00; }
  .tile.invoice { background: #E6F1F7; border-color: #C3DCEA; }
  .tile.invoice .tile-v { color: #0B6493; }
  .tile.total   { background: #0E2340; border-color: #0E2340; }
  .tile.total   .tile-v { color: #fff; }
  .tile.total   .tile-l { color: #A9BBD0; }

  /* --------------------------------------------------------- the table */
  h2 {
    font-size: 9px; text-transform: uppercase; letter-spacing: 0.9px;
    color: #8A99AB; margin: 16px 0 6px; font-weight: 600;
  }
  table { width: 100%; border-collapse: collapse; table-layout: fixed; }
  th {
    text-align: left; font-size: 8.5px; letter-spacing: 0.7px; text-transform: uppercase;
    color: #5B6B7F; font-weight: 600;
    background: #F5F7FA; padding: 6px 7px; border-bottom: 1px solid #CBD5E1;
  }
  th:first-child { border-radius: 6px 0 0 0; }
  th:last-child  { border-radius: 0 6px 0 0; }
  td { padding: 6px 7px; border-bottom: 1px solid #EEF1F6; vertical-align: top; }
  tbody tr:nth-child(even) td { background: #FAFBFD; }
  /* On paper the headings repeat on every page and no row is cut in half. */
  thead { display: table-header-group; }
  tr { break-inside: avoid; page-break-inside: avoid; }

  .num { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; font-weight: 600; }
  .num.small { font-weight: 400; color: #5B6B7F; }
  .mid { text-align: center; }
  .id { font-variant-numeric: tabular-nums; color: #5B6B7F; font-size: 9.5px; }
  .when { white-space: nowrap; }
  .when .d { display: block; }
  .when .t { display: block; color: #8A99AB; font-size: 9.5px; }
  .who { font-weight: 500; }
  .note { color: #5B6B7F; }
  td, th { overflow-wrap: anywhere; }
  /* An Arabic or Urdu name reads right-to-left inside this left-to-right table. */
  .bidi { unicode-bidi: plaintext; }

  .tag {
    display: inline-block; font-size: 8.5px; font-weight: 600; letter-spacing: 0.3px;
    padding: 2px 7px; border-radius: 999px; white-space: nowrap;
  }
  .tag.invoice { background: #E6F1F7; color: #0B6493; }
  .tag.petty { background: #FFF5DF; color: #C98B00; }

  .empty {
    padding: 34px; text-align: center; color: #8A99AB;
    border: 1px dashed #CBD5E1; border-radius: 9px; margin-top: 8px;
  }

  /* --------------------------------------------------------- the close */
  .close { display: flex; gap: 16px; margin-top: 16px; align-items: flex-start; }
  .close, .sign { break-inside: avoid; page-break-inside: avoid; }
  .close .cats { flex: 1.35; }
  .close .total-col { flex: 1; }
  /* Both headings sit on one line, so the table and the total start level. */
  .close h2 { margin-top: 0; }
  .cat-name { display: block; }
  .bar { display: block; height: 3px; border-radius: 2px; background: #EEF1F6; margin-top: 3px; }
  .bar i { display: block; height: 3px; border-radius: 2px; background: #0B6493; }

  .grand { border: 1px solid #E3E8EF; border-radius: 9px; overflow: hidden; }
  .grand .gb { padding: 13px 14px; }
  .grand .gv { font-size: 26px; font-weight: 700; letter-spacing: -0.8px; font-variant-numeric: tabular-nums; }
  .grand .gn { font-size: 10px; color: #5B6B7F; margin-top: 2px; }

  .sign { margin-top: 24px; display: flex; gap: 42px; }
  .sign div { flex: 1; border-top: 1px solid #CBD5E1; padding-top: 6px; color: #8A99AB; font-size: 9.5px; }
  .foot {
    margin-top: 14px; padding-top: 8px; border-top: 1px solid #EEF1F6;
    color: #A3B0C0; font-size: 8.5px; text-align: center;
  }

  /* On a phone the sheet stops pretending to be paper and just fits. */
  @media screen and (max-width: 640px) {
    body { font-size: 11px; }
    .band { flex-wrap: wrap; }
    .band .right { margin-left: 0; text-align: left; width: 100%; }
    .tiles { flex-wrap: wrap; }
    .tile { min-width: 42%; }
    .close { flex-direction: column; }
    .sign { gap: 20px; }
  }
</style>
</head>
<body>
  <div class="band">
    <span class="mark"><img src="${
      meta.logoDataUri ?? KBH_LOGO_DATA_URI
    }" alt="KBH Construction" /></span>
    <div class="brand">
      <div class="name">KBH CONSTRUCTION</div>
      <div class="place">Jeddah, Saudi Arabia</div>
    </div>
    <div class="right">
      <div class="title">${escape(REPORT_TITLE[meta.kind])}</div>
      <div class="period">${periodText(meta.from, meta.to)}</div>
    </div>
  </div>

  <div class="facts">
    <span>Person: <b class="bidi">${escape(meta.personName ?? 'All people')}</b></span>
    <span>Category: <b class="bidi">${escape(meta.categoryName ?? 'All categories')}</b></span>
    <span>Prepared by: <b class="bidi">${escape(meta.generatedBy)}</b></span>
    <span>Generated: <b>${escape(formatDateTime(new Date()))}</b></span>
  </div>

  <div class="tiles">${summaryTiles(rows, meta.kind, total)}</div>

  ${
    rows.length === 0
      ? '<div class="empty">No expenses in this period.</div>'
      : `<h2>Every expense</h2>
  <table>
    <colgroup>
      <col style="width:16%" /><col style="width:13%" /><col style="width:15%" />
      <col style="width:12%" /><col style="width:9%" /><col style="width:20%" /><col style="width:15%" />
    </colgroup>
    <thead>
      <tr>
        <th>Expense ID</th><th>Date</th><th>Person</th>
        <th>Category</th><th class="mid">Type</th><th>Note</th><th class="num">Amount</th>
      </tr>
    </thead>
    <tbody>${bodyRows}</tbody>
  </table>`
  }

  <div class="close">
    ${
      categories.length > 0
        ? `<div class="cats">
      <h2>By category</h2>
      <table>
        <colgroup><col style="width:52%" /><col style="width:20%" /><col style="width:28%" /></colgroup>
        <thead><tr><th>Category</th><th class="num">Entries</th><th class="num">Total</th></tr></thead>
        <tbody>${categoryRows}</tbody>
      </table>
    </div>`
        : '<div class="cats"></div>'
    }
    <div class="total-col">
      <h2>Grand total</h2>
      <div class="grand">
        <div class="gb">
          <div class="gv">${escape(money(total))}</div>
          <div class="gn">${escape(rows.length)} ${
            rows.length === 1 ? 'expense' : 'expenses'
          } &middot; ${escape(periodText(meta.from, meta.to).replace(/&ndash;/g, '-'))}</div>
        </div>
      </div>
    </div>
  </div>

  <div class="sign">
    <div>Prepared by &nbsp;____________________</div>
    <div>Checked by &nbsp;____________________</div>
  </div>

  <div class="foot">
    Cancelled expenses are never included. Bill photos come separately in the photo ZIP.
  </div>
</body>
</html>`;
}

/**
 * In a browser we print the report ourselves.
 *
 * expo-print on web ignores the html it is given and prints whatever is
 * on screen, which would hand someone a picture of the app instead of
 * the report. So the report goes into a hidden frame of its own and that
 * frame is printed. "Save as PDF" in the print window saves it, and the
 * frame's title becomes the suggested file name.
 */
async function printHtmlInBrowser(html: string, fileName: string): Promise<string> {
  const title = fileName.replace(/\.pdf$/i, '');
  const titled = html.replace(/<title>[\s\S]*?<\/title>/i, `<title>${title}</title>`);

  const frame = document.createElement('iframe');
  frame.setAttribute('aria-hidden', 'true');
  // A4 portrait at 96dpi. A 0x0 frame leaves the browser to guess the
  // shape of the sheet, and it guesses landscape.
  frame.style.cssText =
    'position:fixed;left:-10000px;top:0;width:794px;height:1123px;border:0;opacity:0;pointer-events:none;';
  document.body.appendChild(frame);

  const doc = frame.contentDocument;
  const win = frame.contentWindow;
  if (!doc || !win) {
    frame.remove();
    throw new Error('The report could not be opened for printing.');
  }

  doc.open();
  doc.write(titled);
  doc.close();

  // Give the web fonts a moment, so Arabic and Urdu names come out right,
  // but never wait for ever on a slow connection.
  await new Promise<void>((resolve) => {
    const done = () => resolve();
    if (doc.readyState === 'complete') done();
    else win.addEventListener('load', done, { once: true });
    setTimeout(done, 3000);
  });
  await Promise.race([
    doc.fonts?.ready ?? Promise.resolve(),
    new Promise((r) => setTimeout(r, 2500)),
  ]);

  // The name in the Save dialog comes from the title of the page doing
  // the printing - the one in the address bar, not the hidden frame
  // being printed. Setting only the frame's title left the File name box
  // empty, and every report had to be named by hand.
  //
  // So the app's own title becomes the file name for as long as the
  // dialog is open, and is put back the moment it closes. The person
  // sees "KBH Records" again; in between, the Save box is filled in.
  const previousTitle = document.title;
  const restore = () => {
    document.title = previousTitle;
  };
  document.title = title;
  window.addEventListener('afterprint', restore, { once: true });

  win.focus();
  try {
    win.print();
  } finally {
    // print() blocks while the dialog is up in most browsers, so by here
    // it is usually done. afterprint covers the ones where it is not,
    // and a timer covers a browser that fires neither.
    setTimeout(restore, 1000);
  }

  // The print window is handed the frame's document, so the frame has to
  // stay alive until the person is finished with it.
  setTimeout(() => frame.remove(), 60_000);
  return 'printed';
}

/** Makes the PDF and hands it to the person to save or send. */
export async function makeAndSharePdf(html: string, fileName: string): Promise<string> {
  if (Platform.OS === 'web') {
    return printHtmlInBrowser(html, fileName);
  }

  // expo-print defaults to US Letter (612x792). A4 portrait at 72 PPI.
  const { uri } = await Print.printToFileAsync({
    html,
    base64: false,
    width: 595,
    height: 842,
  });

  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(uri, {
      mimeType: 'application/pdf',
      dialogTitle: fileName,
      UTI: 'com.adobe.pdf',
    });
  }
  return uri;
}

export function reportFileName(
  kind: ReportKind,
  from?: string,
  to?: string,
  categoryName?: string | null,
): string {
  const part = from && to ? `${from}_to_${to}` : from ? `from_${from}` : to ? `to_${to}` : 'all_time';
  const name = { petty: 'Petty', invoice: 'Invoice', all: 'All' }[kind];
  // A file called "Fuel" next to one called "Material" tells its own story.
  const slice = categoryName
    ? `_${categoryName.replace(/[^\p{L}\p{N}]+/gu, '_').replace(/^_|_$/g, '')}`
    : '';
  // The stamp is when it was taken, which is not the same as what it
  // covers - and it is what keeps this morning's copy from landing on
  // top of last night's.
  return `KBH_${name}_Expenses${slice}_${part}__${stampInRiyadh()}.pdf`;
}
