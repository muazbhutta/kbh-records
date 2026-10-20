/**
 * Does it find the bill?
 *
 *   node tests/paper-test.mjs
 *
 * The pictures are made up rather than photographed, so this proves the
 * arithmetic and not the camera: a pale sheet on a dark bench, one at an
 * angle, a frame that is all paper, a frame with no paper in it, and a
 * bill with a bright lamp in the corner trying to pull the box open.
 *
 * It needs no database and no network. Run it after touching
 * src/lib/paperFinder.ts.
 */
import { strict as assert } from 'node:assert';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

// The finder is TypeScript; compile the one file to plain JS to run it.
const OUT_ROOT = process.cwd();
const OUT = path.join(OUT_ROOT, 'node_modules', '.paper-test');
fs.mkdirSync(OUT, { recursive: true });
const tsc = path.join(
  process.cwd(), 'node_modules', 'typescript', 'bin', 'tsc',
);
execFileSync(
  process.execPath,
  [tsc, 'src/lib/paperFinder.ts', '--outDir', OUT, '--module', 'esnext',
   '--target', 'es2020', '--moduleResolution', 'bundler', '--skipLibCheck', '--ignoreConfig'],
  { stdio: ['ignore', 'pipe', 'pipe'], cwd: OUT_ROOT },
);
const { paperMask, largestBlob, MIN_AREA, MAX_AREA, MIN_SOLIDITY } =
  await import(pathToFileURL(path.join(OUT, 'paperFinder.js')).href);

const W = 240;
const H = 320;

/** A blank frame of one colour. */
function frame(r, g, b) {
  const data = new Uint8ClampedArray(W * H * 4);
  for (let i = 0; i < W * H; i++) {
    data[i * 4] = r;
    data[i * 4 + 1] = g;
    data[i * 4 + 2] = b;
    data[i * 4 + 3] = 255;
  }
  return data;
}

/** Paints a rectangle onto a frame. */
function rect(data, x0, y0, x1, y1, r, g, b) {
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const i = (y * W + x) * 4;
      data[i] = r;
      data[i + 1] = g;
      data[i + 2] = b;
    }
  }
}

/** What the real thing does, minus the canvas. */
function find(data) {
  const mask = paperMask(data, W, H);
  if (!mask) return null;
  const blob = largestBlob(mask, W, H);
  if (!blob) return null;

  const area = ((blob.x1 - blob.x0 + 1) * (blob.y1 - blob.y0 + 1)) / (W * H);
  if (area < MIN_AREA || area > MAX_AREA) return null;

  const boxArea = (blob.x1 - blob.x0 + 1) * (blob.y1 - blob.y0 + 1);
  if (blob.count / boxArea < MIN_SOLIDITY) return null;

  return blob;
}

let passed = 0;
function check(name, fn) {
  try {
    fn();
    console.log(`  ok    ${name}`);
    passed += 1;
  } catch (err) {
    console.log(`  FAIL  ${name}`);
    console.log(`        ${err.message}`);
    process.exitCode = 1;
  }
}

/** The found box should sit within a few pixels of where the paper was put. */
function near(blob, x0, y0, x1, y1, slack = 4) {
  assert.ok(blob, 'nothing was found');
  const off = [
    Math.abs(blob.x0 - x0),
    Math.abs(blob.y0 - y0),
    Math.abs(blob.x1 - (x1 - 1)),
    Math.abs(blob.y1 - (y1 - 1)),
  ];
  assert.ok(
    off.every((d) => d <= slack),
    `box was [${blob.x0},${blob.y0},${blob.x1},${blob.y1}], wanted about [${x0},${y0},${x1 - 1},${y1 - 1}]`,
  );
}

console.log('\nFinding the bill\n');

check('a pale receipt on a dark bench', () => {
  const img = frame(48, 42, 38);
  rect(img, 60, 70, 180, 250, 238, 236, 232);
  near(find(img), 60, 70, 180, 250);
});

check('a white page on a wooden desk', () => {
  const img = frame(150, 104, 58);
  rect(img, 30, 40, 210, 300, 250, 250, 248);
  near(find(img), 30, 40, 210, 300);
});

check('a lamp in the corner does not drag the box out', () => {
  const img = frame(40, 40, 44);
  rect(img, 70, 90, 170, 240, 240, 238, 234);
  // A small bright patch far away, not joined to the paper.
  rect(img, 5, 5, 25, 25, 255, 255, 250);
  const blob = find(img);
  near(blob, 70, 90, 170, 240);
});

check('a frame that is all paper is left alone', () => {
  const img = frame(245, 244, 240);
  assert.equal(find(img), null, 'it cropped a picture that was all paper');
});

check('a frame with no paper is left alone', () => {
  const img = frame(52, 48, 44);
  assert.equal(find(img), null, 'it found paper in a dark picture');
});

check('a scrap too small to be a bill is left alone', () => {
  const img = frame(44, 40, 38);
  rect(img, 110, 150, 130, 170, 242, 240, 236);
  assert.equal(find(img), null, 'it cropped to a scrap');
});

check('a bright but strongly coloured sheet is not mistaken for paper', () => {
  const img = frame(38, 36, 34);
  // Bright, but saturated - a yellow bag, not a receipt.
  rect(img, 60, 70, 180, 250, 250, 210, 20);
  assert.equal(find(img), null, 'it took a coloured thing for paper');
});

check('the receipt is found even when the bench is pale too', () => {
  const img = frame(176, 172, 166);
  rect(img, 50, 60, 190, 260, 252, 251, 249);
  near(find(img), 50, 60, 190, 260, 6);
});

console.log(`\n${passed} of 8 checks passed\n`);
