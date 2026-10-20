import JSZip from 'jszip';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { Platform } from 'react-native';

import { supabase } from '@/lib/supabase';
import { BILLS_BUCKET } from '@/lib/photos';
import { stampInRiyadh } from '@/lib/format';
import type { ReportPhoto } from '@/types';

/**
 * All the bill photos for a period, in one ZIP, filed the way a person
 * would file paper:
 *
 *   Invoice_Expenses/2026-10_October/2026-10-14/0915_Ali_Material_1800_EXP-2026-000123.jpg
 *   Petty_Expenses/2026-10_October/2026-10-14/1105_Rana_Food_45_EXP-2026-000124.jpg
 *
 * Photos are pulled and added one at a time, never all held in memory,
 * and a big export is cut into parts so it always finishes.
 */

export const PHOTOS_PER_PART = 500;

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

/**
 * Strips what a file system will not take, and squeezes runs of spaces,
 * while leaving Arabic and Urdu letters alone.
 */
export function cleanFilePart(value: string | null | undefined, fallback = 'Unknown'): string {
  const cleaned = (value ?? '')
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f<>:"/\\|?*]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/ /g, '_')
    .replace(/\.+$/, '');
  return cleaned || fallback;
}

/** 0915 in Saudi time. */
function hhmm(iso: string): string {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Riyadh',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(new Date(iso));
  const hour = parts.find((p) => p.type === 'hour')?.value ?? '00';
  const minute = parts.find((p) => p.type === 'minute')?.value ?? '00';
  return `${hour}${minute}`;
}

function amountPart(amount: number): string {
  const n = Number(amount);
  return Number.isInteger(n) ? String(n) : n.toFixed(2).replace('.', '-');
}

/** Where one photo sits inside the ZIP, and what it is called. */
export function zipPathFor(photo: ReportPhoto): string {
  const [year, month, day] = photo.bill_date.split('-');
  const monthName = MONTHS[Number(month) - 1] ?? '';
  const folder = photo.expense_type === 'invoice' ? 'Invoice_Expenses' : 'Petty_Expenses';

  const suffix = Number(photo.photo_total) > 1 ? `_${Number(photo.photo_index) + 1}` : '';
  const id = photo.system_id ?? 'NO-ID';

  let name = [
    hhmm(photo.entered_at),
    cleanFilePart(photo.person_name, 'Unknown'),
    cleanFilePart(photo.category_name, 'Other'),
    amountPart(Number(photo.amount)),
    id,
  ].join('_');

  // Keep the whole name sensible, but never cut the System ID off the end.
  const maxBase = 120 - suffix.length - 4;
  if (name.length > maxBase) {
    const keep = `_${id}`;
    name = name.slice(0, Math.max(1, maxBase - keep.length)) + keep;
  }

  return `${folder}/${year}-${month}_${monthName}/${year}-${month}-${day}/${name}${suffix}.jpg`;
}

export type ZipProgress = {
  done: number;
  total: number;
  part: number;
  parts: number;
};

export type ZipResult = {
  fileName: string;
  /** Where it was saved on the device, or the blob url in a browser. */
  uri: string;
  photoCount: number;
};

export function zipFileName(
  from?: string,
  to?: string,
  part?: number,
  parts?: number,
  label?: string | null,
): string {
  const range = `${from ?? 'start'}_to_${to ?? 'today'}`;
  const suffix = parts && parts > 1 ? `_Part${part}` : '';
  const slice = label ? `_${cleanFilePart(label, '')}` : '';
  return `Bills_Images${slice}_${range}${suffix}__${stampInRiyadh()}.zip`;
}

/**
 * Builds the ZIP (or several, if there are a lot of photos) and hands
 * each one over as it is finished.
 */
export async function buildBillsZip(
  photos: ReportPhoto[],
  options: {
    from?: string;
    to?: string;
    /** A category name, when the download was narrowed to one. */
    label?: string | null;
    onProgress?: (p: ZipProgress) => void;
    onPart?: (result: ZipResult) => Promise<void> | void;
  },
): Promise<ZipResult[]> {
  const parts = Math.max(1, Math.ceil(photos.length / PHOTOS_PER_PART));
  const results: ZipResult[] = [];
  let done = 0;

  for (let part = 1; part <= parts; part++) {
    const slice = photos.slice((part - 1) * PHOTOS_PER_PART, part * PHOTOS_PER_PART);
    const zip = new JSZip();
    let added = 0;

    for (const photo of slice) {
      // One photo at a time: downloaded, put in the zip, then released.
      const { data, error } = await supabase.storage
        .from(BILLS_BUCKET)
        .download(photo.storage_path);

      if (error || !data) {
        console.warn('could not fetch a bill photo', photo.storage_path, error?.message);
      } else {
        zip.file(zipPathFor(photo), await data.arrayBuffer(), { binary: true });
        added += 1;
      }

      done += 1;
      options.onProgress?.({ done, total: photos.length, part, parts });
    }

    const fileName = zipFileName(options.from, options.to, part, parts, options.label);
    const result = await writeZip(zip, fileName, added);
    results.push(result);
    await options.onPart?.(result);
  }

  return results;
}

async function writeZip(zip: JSZip, fileName: string, photoCount: number): Promise<ZipResult> {
  if (Platform.OS === 'web') {
    const blob = await zip.generateAsync({ type: 'blob', compression: 'STORE' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    link.remove();
    // Give the browser a moment to start the download before letting go.
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
    return { fileName, uri: url, photoCount };
  }

  // JPEGs are already compressed, so STORE keeps it fast and small enough.
  const bytes = await zip.generateAsync({ type: 'uint8array', compression: 'STORE' });

  const file = new File(Paths.cache, fileName);
  if (file.exists) file.delete();
  file.create();
  file.write(bytes);

  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(file.uri, {
      mimeType: 'application/zip',
      dialogTitle: fileName,
    });
  }
  return { fileName, uri: file.uri, photoCount };
}
