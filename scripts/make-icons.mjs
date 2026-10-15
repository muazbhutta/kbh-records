// Builds the icons a phone needs to put KBH Records on its home screen.
//
//   node scripts/make-icons.mjs
//
// Takes assets/icon.png and writes the sizes into public/icons/. The
// maskable and Apple icons sit on a solid background with a margin, so
// a round or squircle mask never cuts into the mark.
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

const SRC = 'assets/icon.png';
const OUT = 'public/icons';
const BG = [255, 255, 255]; // the mark is navy and blue on white

// ----------------------------------------------------------- tiny PNG
/** Reads a non-interlaced, 8-bit RGB or RGBA PNG into {w, h, px}. */
function readPng(file) {
  const buf = fs.readFileSync(file);
  if (buf.readUInt32BE(0) !== 0x89504e47) throw new Error('not a PNG');

  let pos = 8;
  let w = 0, h = 0, channels = 0;
  const idat = [];

  while (pos < buf.length) {
    const len = buf.readUInt32BE(pos);
    const type = buf.toString('ascii', pos + 4, pos + 8);
    const data = buf.subarray(pos + 8, pos + 8 + len);

    if (type === 'IHDR') {
      w = data.readUInt32BE(0);
      h = data.readUInt32BE(4);
      const depth = data[8];
      const colour = data[9];
      if (depth !== 8) throw new Error(`need 8-bit, got ${depth}`);
      if (data[12] !== 0) throw new Error('interlaced PNGs are not handled');
      channels = colour === 2 ? 3 : colour === 6 ? 4 : 0;
      if (!channels) throw new Error(`need RGB or RGBA, got colour type ${colour}`);
    } else if (type === 'IDAT') {
      idat.push(data);
    } else if (type === 'IEND') {
      break;
    }
    pos += 12 + len;
  }

  const raw = zlib.inflateSync(Buffer.concat(idat));
  const stride = w * channels;
  const px = Buffer.alloc(w * h * 4);
  let prev = Buffer.alloc(stride);

  for (let y = 0; y < h; y++) {
    const filter = raw[y * (stride + 1)];
    const line = Buffer.from(raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1)));

    for (let i = 0; i < stride; i++) {
      const a = i >= channels ? line[i - channels] : 0;
      const b = prev[i];
      const c = i >= channels ? prev[i - channels] : 0;
      if (filter === 1) line[i] = (line[i] + a) & 0xff;
      else if (filter === 2) line[i] = (line[i] + b) & 0xff;
      else if (filter === 3) line[i] = (line[i] + ((a + b) >> 1)) & 0xff;
      else if (filter === 4) {
        const p = a + b - c;
        const pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
        line[i] = (line[i] + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c)) & 0xff;
      }
    }

    for (let x = 0; x < w; x++) {
      const s = x * channels;
      const d = (y * w + x) * 4;
      px[d] = line[s];
      px[d + 1] = line[s + 1];
      px[d + 2] = line[s + 2];
      px[d + 3] = channels === 4 ? line[s + 3] : 255;
    }
    prev = line;
  }
  return { w, h, px };
}

function writePng(file, w, h, px) {
  const stride = w * 4;
  const raw = Buffer.alloc((stride + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (stride + 1)] = 0; // no filter; the images are small
    px.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }

  const chunk = (type, data) => {
    const out = Buffer.alloc(12 + data.length);
    out.writeUInt32BE(data.length, 0);
    out.write(type, 4, 'ascii');
    data.copy(out, 8);
    out.writeInt32BE(crc(Buffer.concat([Buffer.from(type, 'ascii'), data])), 8 + data.length);
    return out;
  };

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;   // 8 bits
  ihdr[9] = 6;   // RGBA
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]));
}

let TABLE = null;
function crc(buf) {
  if (!TABLE) {
    TABLE = new Int32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      TABLE[n] = c;
    }
  }
  let c = -1;
  for (const b of buf) c = TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return c ^ -1;
}

// ------------------------------------------------------------- resize
/** Box-average down to the wanted size, onto a solid background. */
function render(src, size, { margin = 0, flat = false } = {}) {
  const out = Buffer.alloc(size * size * 4);
  const inner = Math.round(size * (1 - margin * 2));
  const offset = Math.round((size - inner) / 2);

  for (let i = 0; i < size * size; i++) {
    const d = i * 4;
    if (flat) {
      out[d] = BG[0]; out[d + 1] = BG[1]; out[d + 2] = BG[2]; out[d + 3] = 255;
    } else {
      out[d + 3] = 0;
    }
  }

  for (let y = 0; y < inner; y++) {
    const y0 = Math.floor((y * src.h) / inner);
    const y1 = Math.max(y0 + 1, Math.floor(((y + 1) * src.h) / inner));
    for (let x = 0; x < inner; x++) {
      const x0 = Math.floor((x * src.w) / inner);
      const x1 = Math.max(x0 + 1, Math.floor(((x + 1) * src.w) / inner));

      let r = 0, g = 0, b = 0, a = 0, n = 0;
      for (let sy = y0; sy < y1; sy++) {
        for (let sx = x0; sx < x1; sx++) {
          const s = (sy * src.w + sx) * 4;
          const sa = src.px[s + 3] / 255;
          r += src.px[s] * sa; g += src.px[s + 1] * sa; b += src.px[s + 2] * sa;
          a += src.px[s + 3];
          n++;
        }
      }
      r /= n; g /= n; b /= n; a /= n;

      const d = ((y + offset) * size + (x + offset)) * 4;
      const al = a / 255;
      // Lay the mark over whatever is already there.
      const base = flat ? BG : [out[d], out[d + 1], out[d + 2]];
      out[d] = Math.round(r + base[0] * (1 - al));
      out[d + 1] = Math.round(g + base[1] * (1 - al));
      out[d + 2] = Math.round(b + base[2] * (1 - al));
      out[d + 3] = flat ? 255 : Math.round(Math.max(a, out[d + 3]));
    }
  }
  return out;
}

/**
 * The source has a wide empty border. Cut it back to the mark itself,
 * squared off, so the icon fills the tile instead of floating in it.
 */
function trim(img) {
  const isInk = (i) => {
    const d = i * 4;
    if (img.px[d + 3] < 24) return false;            // transparent
    return img.px[d] < 240 || img.px[d + 1] < 240 || img.px[d + 2] < 240; // not white
  };
  let top = img.h, left = img.w, right = -1, bottom = -1;
  for (let y = 0; y < img.h; y++) {
    for (let x = 0; x < img.w; x++) {
      if (!isInk(y * img.w + x)) continue;
      if (y < top) top = y;
      if (y > bottom) bottom = y;
      if (x < left) left = x;
      if (x > right) right = x;
    }
  }
  if (right < 0) return img;

  // Square it around the middle of the mark, with a little air.
  const cx = (left + right) / 2, cy = (top + bottom) / 2;
  const half = Math.max(right - left, bottom - top) / 2 * 1.08;
  const x0 = Math.max(0, Math.round(cx - half));
  const y0 = Math.max(0, Math.round(cy - half));
  const size = Math.min(Math.round(half * 2), img.w - x0, img.h - y0);

  const px = Buffer.alloc(size * size * 4);
  for (let y = 0; y < size; y++) {
    img.px.copy(px, y * size * 4, ((y + y0) * img.w + x0) * 4, ((y + y0) * img.w + x0 + size) * 4);
  }
  return { w: size, h: size, px };
}

const raw0 = readPng(SRC);
const src = trim(raw0);
console.log(`source ${SRC} ${raw0.w}x${raw0.h} -> trimmed ${src.w}x${src.h}`);

const jobs = [
  ['icon-192.png', 192, {}],
  ['icon-512.png', 512, {}],
  // A maskable icon is cropped to a circle or squircle, so the mark sits
  // inside the safe zone with the background filling the rest.
  ['icon-maskable-192.png', 192, { margin: 0.12, flat: true }],
  ['icon-maskable-512.png', 512, { margin: 0.12, flat: true }],
  // iOS does not do transparency on a home-screen icon.
  ['apple-touch-icon.png', 180, { margin: 0.05, flat: true }],
];

for (const [name, size, opts] of jobs) {
  writePng(path.join(OUT, name), size, size, render(src, size, opts));
  const kb = Math.round(fs.statSync(path.join(OUT, name)).size / 1024);
  console.log(`  ${name.padEnd(26)} ${size}x${size}  ${kb}KB`);
}
console.log('done');
