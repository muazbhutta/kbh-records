import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { Platform } from 'react-native';

import { BILLS_BUCKET } from '@/lib/photos';
import { makeAndSharePdf } from '@/lib/reportPdf';
import { KBH_LOGO_DATA_URI } from '@/lib/reportLogo';
import { formatDate, money, stampInRiyadh } from '@/lib/format';
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
      if (image) pages.push(billPage(photo, image));
    });

    const fileName = billsPdfFileName(meta.from, meta.to, part, parts, options.label);
    const html = pdfHtml(meta, pages, part, parts, photos.length);
    await makeAndSharePdf(html, fileName);
    names.push(fileName);
  }

  return names;
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

/** One decode, one draw, one JPEG out. */
function shrinkWithCanvas(blob: Blob): Promise<string | null> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(blob);
    const image = new Image();
    image.onload = () => {
      try {
        const long = Math.max(image.naturalWidth, image.naturalHeight);
        const scale = long > PAGE_IMAGE_SIDE ? PAGE_IMAGE_SIDE / long : 1;
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
        canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(null);
          return;
        }
        ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
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

function billPage(photo: ReportPhoto, image: string): string {
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
  @page { size: 210mm 297mm; margin: 10mm; }
  * { box-sizing: border-box; }
  body {
    margin: 0;
    font-family: -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    color: #0E2340;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }

  .cover { page-break-after: always; }
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

  /* One bill to a page, the picture given as much room as it can have. */
  .sheet {
    page-break-after: always;
    height: 271mm;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .sheet:last-child { page-break-after: auto; }
  .shot {
    flex: 1;
    min-height: 0;
    border: 1px solid #DCE4EE;
    border-radius: 8px;
    padding: 6px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: #F7F9FC;
  }
  .shot img { max-width: 100%; max-height: 100%; object-fit: contain; }

  .facts { border: 1px solid #DCE4EE; border-radius: 8px; padding: 10px 12px; }
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
