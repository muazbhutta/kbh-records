import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { Platform } from 'react-native';

import { paperInImage } from '@/lib/autoCrop';
import { BILLS_BUCKET } from '@/lib/photos';
import { makeAndSharePdf } from '@/lib/reportPdf';
import { KBH_LOGO_DATA_URI } from '@/lib/reportLogo';
import { formatDate, formatDateTime, money, stampInRiyadh } from '@/lib/format';
import { supabase } from '@/lib/supabase';
import type { ReportPhoto } from '@/types';

/**
 * Every bill photograph in one PDF, a page each.
 *
 * The spreadsheet report says what was spent; this says what it was
 * spent on, in the shopkeeper's own handwriting. An auditor wants both,
 * and wants them to agree, so both are made from the same filter - the
 * month, the year, the dates you picked, the person, the category, petty
 * or invoice. Whatever narrows one narrows the other.
 *
 * Every page carries the same facts underneath the picture: the date,
 * whose khata it sits in, what it was for, what it cost, and the expense
 * number, so a page torn out of a printed copy still says where it came
 * from.
 */

/** Bills per file. A hundred pages of photographs is already a big file. */
export const BILLS_PER_PART = 100;

/** How many photographs to pull down at a time. */
const AT_ONCE = 5;

/** The long side each photograph is cut down to before it goes in. */
const PAGE_IMAGE_SIDE = 1100;
const PAGE_IMAGE_QUALITY = 0.72;

export type BillsPdfProgress = { done: number; total: number; part: number; parts: number };

export type BillsPdfMeta = {
  from?: string;
  to?: string;
  /** "This month", "Last year", a category name - whatever narrowed it. */
  heading: string;
  lines: string[];
  total: number;
};

export function billsPdfFileName(
  from: string | undefined,
  to: string | undefined,
  part: number,
  parts: number,
  label?: string | null,
): string {
  const when = from && to ? `${from}_to_${to}` : from ? `from_${from}` : to ? `to_${to}` : 'all_time';
  const slice = label
    ? `_${label.replace(/[^\p{L}\p{N}]+/gu, '_').replace(/^_|_$/g, '')}`
    : '';
  const piece = parts > 1 ? `_part_${part}_of_${parts}` : '';
  return `KBH_Bill_Photos${slice}_${when}${piece}__${stampInRiyadh()}.pdf`;
}

/**
 * Builds the PDF, or several when there are a great many bills, and
 * hands each to the person as it is finished.
 */
export async function buildBillsPdf(
  photos: ReportPhoto[],
  meta: BillsPdfMeta,
  options: {
    label?: string | null;
    onProgress?: (p: BillsPdfProgress) => void;
  } = {},
): Promise<string[]> {
  const parts = Math.max(1, Math.ceil(photos.length / BILLS_PER_PART));
  const names: string[] = [];
  let done = 0;

  for (let part = 1; part <= parts; part++) {
    const slice = photos.slice((part - 1) * BILLS_PER_PART, part * BILLS_PER_PART);
    const images: (string | null)[] = new Array(slice.length).fill(null);
    const foot = footLine(meta);

    let next = 0;
    const worker = async () => {
      for (;;) {
        const i = next++;
        if (i >= slice.length) return;
        images[i] = await fetchShrunk(slice[i].storage_path);
        done += 1;
        options.onProgress?.({ done, total: photos.length, part, parts });
      }
    };
    await Promise.all(
      Array.from({ length: Math.min(AT_ONCE, slice.length) }, () => worker()),
    );

    // Put back in order, so the pages read by date as the list does.
    const pages: string[] = [];
    slice.forEach((photo, i) => {
      const image = images[i];
      if (image) pages.push(billPage(photo, image, foot));
    });

    const fileName = billsPdfFileName(meta.from, meta.to, part, parts, options.label);
    const html = pdfHtml(meta, pages, part, parts, photos.length);
    await makeAndSharePdf(html, fileName);
    names.push(fileName);
  }

  return names;
}

/**
 * The line along the foot of every page: what the report covers, and
 * when it was taken. Two different questions, and a page torn out of a
 * printed copy has to answer both on its own.
 */
function footLine(meta: BillsPdfMeta): string {
  const covers =
    meta.from && meta.to
      ? `${formatDate(meta.from)} to ${formatDate(meta.to)}`
      : meta.from
        ? `from ${formatDate(meta.from)}`
        : meta.to
          ? `up to ${formatDate(meta.to)}`
          : 'all time';
  return `KBH Construction, Jeddah · Bills for ${covers} · Taken ${formatDateTime(new Date())}`;
}

/**
 * Pulls one photograph down and cuts it to a size a PDF can carry. A
 * hundred full-size pictures would make a file nobody can send.
 *
 * On the web the canvas does it in one decode. Going through the image
 * library instead meant decoding each photograph twice - once to ask how
 * big it was, once to shrink it - and a dozen bills took two minutes.
 */
async function fetchShrunk(path: string): Promise<string | null> {
  try {
    const { data, error } = await supabase.storage.from(BILLS_BUCKET).download(path);
    if (error || !data) return null;

    if (Platform.OS === 'web' && typeof document !== 'undefined') {
      return shrinkWithCanvas(data);
    }

    const asDataUri = await blobToDataUri(data);
    const probe = await ImageManipulator.manipulate(asDataUri).renderAsync();
    const ctx = ImageManipulator.manipulate(asDataUri);
    ctx.resize(
      probe.width >= probe.height
        ? { width: Math.min(PAGE_IMAGE_SIDE, probe.width) }
        : { height: Math.min(PAGE_IMAGE_SIDE, probe.height) },
    );
    const rendered = await ctx.renderAsync();
    const saved = await rendered.saveAsync({
      format: SaveFormat.JPEG,
      compress: PAGE_IMAGE_QUALITY,
      base64: true,
    });
    return saved.base64 ? `data:image/jpeg;base64,${saved.base64}` : null;
  } catch {
    // One unreadable photograph must not cost the whole report.
    return null;
  }
}

/**
 * One decode, one draw, one JPEG out - and the bill cut out of the
 * photograph on the way.
 *
 * The cutting matters most here. A bill photographed in a car is a
 * narrow strip of paper in a wide picture of a dashboard, and on a
 * portrait page it is the picture's width that runs out first, so the
 * bill ends up a third of the size it could be. Cutting to the paper
 * turns a wide picture into a tall one and the bill fills the page.
 *
 * Photographs taken from now on are cut when they are taken. This is for
 * the ones already in the books, which were not.
 */
function shrinkWithCanvas(blob: Blob): Promise<string | null> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(blob);
    const image = new Image();
    image.onload = () => {
      try {
        const box = paperInImage(image);
        const sx = box ? box.originX : 0;
        const sy = box ? box.originY : 0;
        const sw = box ? box.width : image.naturalWidth;
        const sh = box ? box.height : image.naturalHeight;

        const long = Math.max(sw, sh);
        const scale = long > PAGE_IMAGE_SIDE ? PAGE_IMAGE_SIDE / long : 1;
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(sw * scale));
        canvas.height = Math.max(1, Math.round(sh * scale));
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(null);
          return;
        }
        ctx.drawImage(image, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL('image/jpeg', PAGE_IMAGE_QUALITY));
      } catch {
        resolve(null);
      } finally {
        URL.revokeObjectURL(url);
      }
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(null);
    };
    image.src = url;
  });
}

function blobToDataUri(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error('could not read the photo'));
    reader.readAsDataURL(blob);
  });
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function billPage(photo: ReportPhoto, image: string, foot: string): string {
  const of =
    photo.photo_total > 1 ? ` · bill ${photo.photo_index + 1} of ${photo.photo_total}` : '';
  const kind = photo.expense_type === 'invoice' ? 'Invoice' : 'Petty';

  return `
    <section class="sheet">
      <div class="shot"><img src="${image}" alt="" /></div>
      <div class="facts">
        <div class="line">
          <span class="amount">${escapeHtml(money(Number(photo.amount)))}</span>
          <span class="kind ${photo.expense_type === 'invoice' ? 'inv' : 'pet'}">${kind}</span>
        </div>
        <div class="grid">
          <div><b>Date</b>${escapeHtml(formatDate(photo.bill_date))}</div>
          <div><b>Whose khata</b>${escapeHtml(photo.person_name ?? '-')}</div>
          <div><b>What for</b>${escapeHtml(photo.category_name ?? '-')}</div>
          <div><b>Expense ID</b>${escapeHtml(photo.system_id ?? '-')}${of}</div>
        </div>
      </div>
      <div class="foot">${escapeHtml(foot)}</div>
    </section>`;
}

function pdfHtml(
  meta: BillsPdfMeta,
  pages: string[],
  part: number,
  parts: number,
  totalPhotos: number,
): string {
  const partLine = parts > 1 ? `Part ${part} of ${parts}` : '';

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>KBH Bill Photos</title>
<style>
  /*
     No margin on the page itself. The margin is where a browser prints
     its own address and page number, and with none there is nowhere for
     them to go - which is what was wanted, and also gives the whole
     sheet back to us. Each page keeps its own padding instead.
  */
  @page { size: 210mm 297mm; margin: 0; }
  * { box-sizing: border-box; }
  body {
    margin: 0;
    font-family: -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    color: #0E2340;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }

  .cover { page-break-after: always; break-after: page; padding: 12mm; }
  .band {
    background: #0E2340;
    color: #fff;
    border-radius: 10px;
    padding: 18px 20px;
    display: flex;
    align-items: center;
    gap: 14px;
  }
  .band img { width: 46px; height: 34px; object-fit: contain; }
  .band h1 { margin: 0; font-size: 19px; letter-spacing: -0.3px; }
  .band p { margin: 2px 0 0; font-size: 11px; color: #9FB3CC; }

  .what { margin-top: 16px; font-size: 12px; line-height: 1.9; }
  .what b { display: inline-block; min-width: 128px; color: #5A7190; font-weight: 600; }
  .sum {
    margin-top: 16px;
    border: 1px solid #DCE4EE;
    border-radius: 10px;
    padding: 14px 16px;
    display: flex;
    justify-content: space-between;
    align-items: baseline;
  }
  .sum span { font-size: 11px; color: #5A7190; letter-spacing: .08em; text-transform: uppercase; }
  .sum b { font-size: 22px; letter-spacing: -0.5px; }

  /*
     One bill to a page, and the bill and its facts must never come
     apart - a photograph on one page and the amount on the next is
     worse than no page break at all.

     The first try set the page to a fixed 271mm and let a flex column
     fill it. That assumed the whole printable page was ours, and it is
     not: a browser prints its own address and page number at the top
     and bottom unless told otherwise, and that pushed every bill over
     by a few millimetres. Twenty bills came out as forty-nine pages.

     So nothing here is told how tall it is. The picture is given a
     ceiling in millimetres that leaves room for the facts beneath it
     and for the browser's own furniture, and the pair are forbidden to
     be split. Whatever is left over at the bottom is white, which costs
     nothing.
  */
  .sheet {
    page-break-after: always;
    break-after: page;
    page-break-inside: avoid;
    break-inside: avoid;
    padding: 10mm 10mm 8mm;
  }
  .sheet:last-child { page-break-after: auto; break-after: auto; }
  .shot {
    border: 1px solid #DCE4EE;
    border-radius: 8px;
    padding: 5px;
    background: #F7F9FC;
    text-align: center;
    page-break-inside: avoid;
    break-inside: avoid;
  }
  .shot img {
    max-width: 100%;
    /*
       A4 is 297mm. Take off this page's own padding and the facts card
       beneath, and there is room for far more than this - but an iPhone
       lays a page out slightly differently from a desktop, and a bill
       that spills onto a second page is the whole complaint. So the
       ceiling is set low enough that it cannot, and the white left at
       the foot of the page costs nothing.
    */
    max-height: 196mm;
    object-fit: contain;
    vertical-align: middle;
  }

  .facts {
    margin-top: 7px;
    border: 1px solid #DCE4EE;
    border-radius: 8px;
    padding: 10px 12px;
    page-break-inside: avoid;
    break-inside: avoid;
  }
  .line { display: flex; justify-content: space-between; align-items: center; }
  .amount { font-size: 19px; font-weight: 700; letter-spacing: -0.4px; }
  .kind { font-size: 10px; padding: 3px 9px; border-radius: 999px; font-weight: 600; }
  .kind.pet { background: #FFF3D6; color: #8A6100; }
  .kind.inv { background: #E7F0FF; color: #1D4F91; }
  .grid {
    margin-top: 7px;
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 3px 16px;
    font-size: 10.5px;
  }
  .grid b { color: #5A7190; font-weight: 600; margin-right: 6px; }

  /* The line the browser used to print, said properly and by us. */
  .foot {
    margin-top: 6px;
    font-size: 8.5px;
    color: #8599B0;
    text-align: center;
  }
</style>
</head>
<body>
  <div class="cover">
    <div class="band">
      <img src="${KBH_LOGO_DATA_URI}" alt="" />
      <div>
        <h1>Bill photos</h1>
        <p>KBH Construction, Jeddah${partLine ? ` · ${partLine}` : ''}</p>
      </div>
    </div>

    <div class="what">
      <div><b>${escapeHtml(meta.heading)}</b></div>
      ${meta.lines.map((l) => `<div><b></b>${escapeHtml(l)}</div>`).join('')}
    </div>

    <div class="sum">
      <div>
        <span>Bills in this file</span><br />
        <b>${pages.length}</b>
      </div>
      <div style="text-align:right">
        <span>Of ${totalPhotos} in all · total spent</span><br />
        <b>${escapeHtml(money(meta.total))}</b>
      </div>
    </div>
  </div>

  ${pages.join('\n')}
</body>
</html>`;
}
