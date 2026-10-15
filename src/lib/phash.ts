import { decode as decodeJpeg } from 'jpeg-js';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';

/**
 * A fingerprint of what a photo LOOKS like, not of its bytes.
 *
 * The exact hash (sha256) only catches the very same file. Photograph
 * the same bill a second time, or resize it, and the bytes change
 * completely — but the picture does not. This hash survives that.
 *
 * How: shrink to 9x8 grey pixels, then write down, for each row, whether
 * each pixel is brighter than the one to its right. That is 64 yes/no
 * answers, kept as 16 hex characters. Two photos of the same bill differ
 * in only a handful of those answers.
 */

const WIDTH = 9;
const HEIGHT = 8;

/** How many of the 64 answers may differ and still count as the same bill. */
export const PHASH_MATCH_DISTANCE = 6;

export async function computePhash(uri: string): Promise<string | null> {
  try {
    const image = await ImageManipulator.manipulate(uri)
      .resize({ width: WIDTH, height: HEIGHT })
      .renderAsync();
    const small = await image.saveAsync({
      format: SaveFormat.JPEG,
      compress: 1,
      base64: true,
    });
    if (!small.base64) return null;
    return hashFromJpegBase64(small.base64);
  } catch (err) {
    console.warn('could not fingerprint the photo', err);
    return null;
  }
}

function base64ToBytes(base64: string): Uint8Array {
  if (typeof atob === 'function') {
    const binary = atob(base64);
    const out = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
    return out;
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const B = (globalThis as any).Buffer;
  return B ? new Uint8Array(B.from(base64, 'base64')) : new Uint8Array();
}

export function hashFromJpegBase64(base64: string): string | null {
  const bytes = base64ToBytes(base64);
  if (bytes.length === 0) return null;

  const raw = decodeJpeg(bytes, { useTArray: true });
  if (!raw?.data || raw.width < 2 || raw.height < 1) return null;

  // Whatever size came back, sample it down to our little grid.
  const grey: number[] = [];
  for (let y = 0; y < HEIGHT; y++) {
    for (let x = 0; x < WIDTH; x++) {
      const sx = Math.min(raw.width - 1, Math.floor((x * raw.width) / WIDTH));
      const sy = Math.min(raw.height - 1, Math.floor((y * raw.height) / HEIGHT));
      const i = (sy * raw.width + sx) * 4;
      grey.push(0.299 * raw.data[i] + 0.587 * raw.data[i + 1] + 0.114 * raw.data[i + 2]);
    }
  }

  let bits = '';
  for (let y = 0; y < HEIGHT; y++) {
    for (let x = 0; x < WIDTH - 1; x++) {
      const left = grey[y * WIDTH + x];
      const right = grey[y * WIDTH + x + 1];
      bits += left > right ? '1' : '0';
    }
  }

  let hex = '';
  for (let i = 0; i < bits.length; i += 4) {
    hex += parseInt(bits.slice(i, i + 4), 2).toString(16);
  }
  return hex.length === 16 ? hex : null;
}

/** How many of the 64 answers differ. 0 means the pictures look identical. */
export function phashDistance(a: string, b: string): number {
  if (a.length !== 16 || b.length !== 16) return 64;
  let diff = 0;
  for (let i = 0; i < 16; i++) {
    let x = parseInt(a[i], 16) ^ parseInt(b[i], 16);
    while (x) {
      diff += x & 1;
      x >>= 1;
    }
  }
  return diff;
}
