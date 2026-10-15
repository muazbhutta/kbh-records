import { scanFromURLAsync } from 'expo-camera';
import jsQR from 'jsqr';
import { Platform } from 'react-native';

import { parseZatcaQr, type ZatcaInvoice } from '@/lib/zatca';
import type { LocalPhoto } from '@/lib/photos';

/**
 * Looking for a ZATCA invoice QR in the photos the person just took.
 * This runs on the device, before saving, so the type is usually decided
 * by the time the entry lands. Nothing here costs money or needs a key.
 */

/** Reads every QR in one photo. Never throws: a bad photo just finds nothing. */
async function readQrCodes(photo: LocalPhoto): Promise<string[]> {
  try {
    if (Platform.OS === 'web') {
      return await readQrOnWeb(photo.preview, photo.fullBase64);
    }
    if (!photo.uri) return [];
    const results = await scanFromURLAsync(photo.uri, ['qr']);
    return results.map((r) => r.data).filter(Boolean);
  } catch (err) {
    console.warn('could not scan the photo for a QR', err);
    return [];
  }
}

/** The browser has no scanner, so the pixels go through jsQR. */
async function readQrOnWeb(previewUri: string, fullBase64: string): Promise<string[]> {
  if (typeof document === 'undefined') return [];

  // The small version first, because it decodes fastest; the full one is
  // the fallback when the QR is too small to read in the thumbnail.
  for (const source of [`data:image/jpeg;base64,${fullBase64}`, previewUri]) {
    const data = await imageDataFrom(source);
    if (!data) continue;
    const hit = jsQR(data.data, data.width, data.height, { inversionAttempts: 'attemptBoth' });
    if (hit?.data) return [hit.data];
  }
  return [];
}

function imageDataFrom(source: string): Promise<ImageData | null> {
  return new Promise((resolve) => {
    const image = new window.Image();
    image.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        // A huge canvas is slow and a QR survives being scaled down.
        const scale = Math.min(1, 1400 / Math.max(image.width, image.height));
        canvas.width = Math.round(image.width * scale);
        canvas.height = Math.round(image.height * scale);
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        if (!ctx) return resolve(null);
        ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
        resolve(ctx.getImageData(0, 0, canvas.width, canvas.height));
      } catch {
        resolve(null);
      }
    };
    image.onerror = () => resolve(null);
    image.src = source;
  });
}

/**
 * Goes through the photos of one expense and returns the first real
 * ZATCA invoice it finds. A QR holding a website link is ignored.
 */
export async function findZatcaInvoice(photos: LocalPhoto[]): Promise<ZatcaInvoice | null> {
  for (const photo of photos) {
    const codes = await readQrCodes(photo);
    for (const code of codes) {
      const invoice = parseZatcaQr(code);
      if (invoice) return invoice;
    }
  }
  return null;
}
