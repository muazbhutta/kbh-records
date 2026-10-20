import { Platform } from 'react-native';

import {
  largestBlob,
  paperMask,
  MAX_AREA,
  MIN_AREA,
  MIN_SOLIDITY,
} from '@/lib/paperFinder';

/**
 * Finding the bill in the photograph.
 *
 * A man on a site holds the phone over a receipt lying on a bench and
 * takes the picture. Half of what he sends is bench. This finds the
 * paper and hands back the rectangle it sits in, so the photograph that
 * is kept is the bill and not the bench.
 *
 * It is deliberately timid. A crop that cuts the total off a receipt is
 * far worse than no crop at all, so every check below has to pass, and
 * when any of them does not it gives back nothing and the whole picture
 * is kept. Expect it to leave a fair number of photographs alone.
 *
 * It squares the paper up but does not straighten it: a receipt held at
 * an angle is cropped to the box around it, not flattened into a
 * rectangle. That needs the four corners and a perspective transform,
 * which is a bigger piece of work than this.
 *
 * On a phone app built from this code there is no way to read the
 * pixels, so nothing is cropped there and the photograph is kept whole.
 * The web app - which is what the company uses - does the work in a
 * canvas.
 */

export type Box = { originX: number; originY: number; width: number; height: number };

/** The long side of the copy used for looking. Big enough to see, small enough to be quick. */
const PROBE_SIDE = 480;

/** A little air around the edge, so nothing is shaved off the bill. */
const MARGIN = 0.015;

export const canAutoCrop = Platform.OS === 'web' && typeof document !== 'undefined';

/**
 * Looks for the sheet of paper. Gives back the rectangle it occupies in
 * the full-size image, or null when it is not sure enough to say.
 */
export async function findPaper(uri: string): Promise<Box | null> {
  if (!canAutoCrop) return null;

  try {
    const image = await loadImage(uri);
    const full = { width: image.naturalWidth, height: image.naturalHeight };
    if (!full.width || !full.height) return null;

    const scale = PROBE_SIDE / Math.max(full.width, full.height);
    const w = Math.max(1, Math.round(full.width * Math.min(scale, 1)));
    const h = Math.max(1, Math.round(full.height * Math.min(scale, 1)));

    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return null;
    ctx.drawImage(image, 0, 0, w, h);
    const { data } = ctx.getImageData(0, 0, w, h);

    const mask = paperMask(data, w, h);
    if (!mask) return null;

    const blob = largestBlob(mask, w, h);
    if (!blob) return null;

    const area = ((blob.x1 - blob.x0 + 1) * (blob.y1 - blob.y0 + 1)) / (w * h);
    if (area < MIN_AREA || area > MAX_AREA) return null;

    const boxArea = (blob.x1 - blob.x0 + 1) * (blob.y1 - blob.y0 + 1);
    if (blob.count / boxArea < MIN_SOLIDITY) return null;

    // Back to the full-size picture, with a margin, kept inside the frame.
    const back = full.width / w;
    const padX = full.width * MARGIN;
    const padY = full.height * MARGIN;

    const originX = clamp(blob.x0 * back - padX, 0, full.width - 1);
    const originY = clamp(blob.y0 * back - padY, 0, full.height - 1);
    const right = clamp((blob.x1 + 1) * back + padX, originX + 1, full.width);
    const bottom = clamp((blob.y1 + 1) * back + padY, originY + 1, full.height);

    return {
      originX: Math.round(originX),
      originY: Math.round(originY),
      width: Math.round(right - originX),
      height: Math.round(bottom - originY),
    };
  } catch {
    // A picture that cannot be read is a picture kept whole.
    return null;
  }
}

function loadImage(uri: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    // A photograph just taken arrives as a blob: or data: address, and
    // asking those for cross-origin permission taints the canvas and the
    // pixels come back unreadable. Only a real http address needs it.
    if (/^https?:/i.test(uri)) image.crossOrigin = 'anonymous';
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('could not read the photo'));
    image.src = uri;
  });
}

function clamp(value: number, low: number, high: number): number {
  return Math.min(Math.max(value, low), high);
}
