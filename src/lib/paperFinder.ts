/**
 * The arithmetic behind finding a bill in a photograph.
 *
 * Kept apart from the browser work next door so it can be run against
 * made-up pictures and checked: a pale sheet on a dark bench, a dark
 * one, a photograph that is all paper, a photograph with no paper in it
 * at all. See tests/paper-test.mjs.
 *
 * Nothing in here touches a canvas, a file or a screen. It takes the
 * pixels and gives back a rectangle.
 */

/** The paper has to be at least this much of the frame, and no more than this. */
export const MIN_AREA = 0.08;
export const MAX_AREA = 0.97;

/** How much of its own bounding box the blob must fill to count as a sheet of paper. */
export const MIN_SOLIDITY = 0.55;

export type Blob = { x0: number; y0: number; x1: number; y1: number; count: number };

/**
 * Which pixels look like paper: brighter than what surrounds them, and
 * without much colour in them. A receipt is pale and grey; a bench, a
 * hand or a floor usually is not.
 *
 * The brightness line is drawn by Otsu's method, which splits the
 * picture into dark and light wherever that split is cleanest, rather
 * than at a number picked in advance that would be wrong indoors.
 */
export function paperMask(data: Uint8ClampedArray, w: number, h: number): Uint8Array | null {
  const n = w * h;
  const lum = new Uint8Array(n);
  const sat = new Uint8Array(n);
  const histogram = new Uint32Array(256);

  for (let i = 0; i < n; i++) {
    const r = data[i * 4];
    const g = data[i * 4 + 1];
    const b = data[i * 4 + 2];
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const l = Math.round(0.299 * r + 0.587 * g + 0.114 * b);
    lum[i] = l;
    sat[i] = max === 0 ? 0 : Math.round(((max - min) / max) * 255);
    histogram[l] += 1;
  }

  const threshold = otsu(histogram, n);
  // A picture with no real light and dark to it - a close-up of a wall,
  // say - has nothing to find.
  if (threshold < 30 || threshold > 225) return null;

  const mask = new Uint8Array(n);
  let paper = 0;
  for (let i = 0; i < n; i++) {
    if (lum[i] > threshold && sat[i] < 70) {
      mask[i] = 1;
      paper += 1;
    }
  }

  if (paper / n < MIN_AREA) return null;
  return mask;
}

/** The split that leaves the two sides of the picture as alike as they can be. */
export function otsu(histogram: Uint32Array, total: number): number {
  let sum = 0;
  for (let i = 0; i < 256; i++) sum += i * histogram[i];

  let sumB = 0;
  let countB = 0;
  let best = 0;
  let bestVariance = -1;

  for (let t = 0; t < 256; t++) {
    countB += histogram[t];
    if (countB === 0) continue;
    const countF = total - countB;
    if (countF === 0) break;

    sumB += t * histogram[t];
    const meanB = sumB / countB;
    const meanF = (sum - sumB) / countF;
    const variance = countB * countF * (meanB - meanF) ** 2;

    if (variance > bestVariance) {
      bestVariance = variance;
      best = t;
    }
  }

  return best;
}

/**
 * The biggest single run of paper-coloured pixels, found by walking out
 * from each unvisited one. A stack rather than recursion, because a
 * sheet of paper at this size is tens of thousands of pixels and the
 * call stack would not survive it.
 */
export function largestBlob(mask: Uint8Array, w: number, h: number): Blob | null {
  const seen = new Uint8Array(mask.length);
  const stack = new Int32Array(mask.length);
  let best: Blob | null = null;

  for (let start = 0; start < mask.length; start++) {
    if (mask[start] === 0 || seen[start] === 1) continue;

    let top = 0;
    stack[top++] = start;
    seen[start] = 1;

    let x0 = w;
    let y0 = h;
    let x1 = 0;
    let y1 = 0;
    let count = 0;

    while (top > 0) {
      const p = stack[--top];
      const x = p % w;
      const y = (p - x) / w;

      count += 1;
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;

      if (x > 0 && mask[p - 1] && !seen[p - 1]) {
        seen[p - 1] = 1;
        stack[top++] = p - 1;
      }
      if (x < w - 1 && mask[p + 1] && !seen[p + 1]) {
        seen[p + 1] = 1;
        stack[top++] = p + 1;
      }
      if (y > 0 && mask[p - w] && !seen[p - w]) {
        seen[p - w] = 1;
        stack[top++] = p - w;
      }
      if (y < h - 1 && mask[p + w] && !seen[p + w]) {
        seen[p + w] = 1;
        stack[top++] = p + w;
      }
    }

    if (!best || count > best.count) best = { x0, y0, x1, y1, count };
  }

  return best;
}

