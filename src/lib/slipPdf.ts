/**
 * The slip made into a PDF here, instead of by the phone.
 *
 * Printing is the browser's, and the browser signs its work: an iPhone
 * writes the address of the site, the date and "Page 9 of 10" into the
 * margins of every sheet, and no stylesheet inside the page can stop
 * it - the margins it draws in are outside the page altogether. A wage
 * slip handed to a man should carry the company's name and nothing
 * else, so the sheet is drawn and bound into a PDF here, and the phone
 * is only asked to save it.
 *
 * Each sheet is drawn to a canvas, so what comes out is a picture
 * rather than text that can be selected. That is the price, and it is
 * the right way round: the drawing is the browser's own, which is the
 * only thing that shapes Arabic and Urdu names properly, and a wage
 * slip is read, signed and filed rather than searched.
 *
 * The PDF itself is written out below. It holds nothing but one JPEG
 * per page, which is a small enough thing to say in full and saves
 * carrying a PDF library to say it.
 */
import { Platform } from 'react-native';

/** A4 portrait, in points, which is what a PDF is measured in. */
const A4_W = 595.28;
const A4_H = 841.89;

/** One drawn sheet, and the size it was drawn at. */
type Sheet = { jpeg: Uint8Array; w: number; h: number };

// ------------------------------------------------------------ the writing
/**
 * A PDF of nothing but pages of pictures.
 *
 * The table at the end has to say where every object begins, counted
 * in bytes, so the pieces are gathered in order and measured as they
 * go rather than joined up at the end.
 */
function imagePdf(sheets: Sheet[]): Blob {
  const enc = new TextEncoder();
  const parts: Uint8Array[] = [];
  let at = 0;

  const put = (x: string | Uint8Array) => {
    const b = typeof x === 'string' ? enc.encode(x) : x;
    parts.push(b);
    at += b.length;
  };

  /** Where each object starts, by its number. */
  const starts: number[] = [];
  const object = (n: number, dict: string, stream?: Uint8Array) => {
    starts[n] = at;
    put(`${n} 0 obj\n${dict}\n`);
    if (stream) {
      put('stream\n');
      put(stream);
      put('\nendstream\n');
    }
    put('endobj\n');
  };

  const num = (v: number) => v.toFixed(2);

  // A binary comment on the second line is what tells a reader not to
  // treat the rest of the file as text.
  put('%PDF-1.4\n');
  put(new Uint8Array([0x25, 0xe2, 0xe3, 0xcf, 0xd3, 0x0a]));

  // 1 the catalogue, 2 the list of pages, then three objects per sheet.
  const pageNo = (i: number) => 3 + i * 3;
  const imgNo = (i: number) => 4 + i * 3;
  const useNo = (i: number) => 5 + i * 3;

  object(1, '<< /Type /Catalog /Pages 2 0 R >>');
  object(
    2,
    `<< /Type /Pages /Count ${sheets.length} /Kids [${sheets
      .map((_, i) => `${pageNo(i)} 0 R`)
      .join(' ')}] >>`,
  );

  sheets.forEach((s, i) => {
    /*
     * The sheet is drawn 794 wide, which is A4 at the screen's own
     * measure, so it fills the width - unless it has come out taller
     * than the page, and then it is made to fit the height instead and
     * stood in the middle. A sheet that runs over is a sheet cut in
     * half, which is worse than one a little narrower.
     */
    let w = A4_W;
    let h = (A4_W * s.h) / s.w;
    if (h > A4_H) {
      h = A4_H;
      w = (A4_H * s.w) / s.h;
    }
    const x = (A4_W - w) / 2;
    const y = A4_H - h;

    object(
      pageNo(i),
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${num(A4_W)} ${num(A4_H)}] ` +
        `/Resources << /XObject << /Im0 ${imgNo(i)} 0 R >> >> /Contents ${useNo(i)} 0 R >>`,
    );
    object(
      imgNo(i),
      `<< /Type /XObject /Subtype /Image /Width ${s.w} /Height ${s.h} ` +
        `/ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode ` +
        `/Length ${s.jpeg.length} >>`,
      s.jpeg,
    );
    const draw = `q ${num(w)} 0 0 ${num(h)} ${num(x)} ${num(y)} cm /Im0 Do Q`;
    object(useNo(i), `<< /Length ${draw.length} >>`, enc.encode(draw));
  });

  const count = 3 + sheets.length * 3;
  const xref = at;
  let table = `xref\n0 ${count}\n0000000000 65535 f \n`;
  for (let n = 1; n < count; n++) {
    table += `${String(starts[n] ?? 0).padStart(10, '0')} 00000 n \n`;
  }
  put(table);
  put(`trailer\n<< /Size ${count} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`);

  return new Blob(parts as BlobPart[], { type: 'application/pdf' });
}

// ------------------------------------------------------------ the drawing
/** Every sheet in the page, drawn one by one. */
async function drawSheets(html: string): Promise<Sheet[]> {
  const { default: html2canvas } = await import('html2canvas');

  const frame = document.createElement('iframe');
  frame.setAttribute('aria-hidden', 'true');
  // A4 at 96dpi. The width matters: it is what the sheet is laid out
  // to, and what it is then scaled from.
  frame.style.cssText =
    'position:fixed;left:-10000px;top:0;width:794px;height:1123px;border:0;opacity:0;pointer-events:none;';
  document.body.appendChild(frame);

  try {
    const doc = frame.contentDocument;
    const win = frame.contentWindow;
    if (!doc || !win) throw new Error('The slip could not be opened to draw.');

    doc.open();
    doc.write(html);
    doc.close();

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

    // Tall enough to hold all of it, or what is below the fold is laid
    // out but never drawn.
    frame.style.height = `${Math.max(1123, doc.documentElement.scrollHeight)}px`;

    const sheets = [...doc.querySelectorAll<HTMLElement>('section.person')];
    const toDraw = sheets.length > 0 ? sheets : [doc.body];

    const out: Sheet[] = [];
    for (const el of toDraw) {
      const canvas = await html2canvas(el, {
        scale: 2,
        backgroundColor: '#ffffff',
        logging: false,
        useCORS: true,
        width: el.scrollWidth,
        height: el.scrollHeight,
        windowWidth: 794,
      });
      const blob = await new Promise<Blob | null>((r) =>
        canvas.toBlob(r, 'image/jpeg', 0.92),
      );
      if (!blob) throw new Error('The slip could not be drawn.');
      out.push({
        jpeg: new Uint8Array(await blob.arrayBuffer()),
        w: canvas.width,
        h: canvas.height,
      });
    }
    return out;
  } finally {
    frame.remove();
  }
}

// ------------------------------------------------------------- the giving
/**
 * Makes the slip and hands it over, under the name it was given.
 *
 * A phone is offered the share sheet first, because that is where
 * "Save to Files" and WhatsApp both live; a desktop, and a phone that
 * refuses, simply downloads it.
 */
export async function makeAndShareSlipPdf(html: string, fileName: string): Promise<string> {
  if (Platform.OS !== 'web') {
    // On a real app the printing is the system's own and carries no
    // address or page numbers, so there is nothing here to mend.
    const { makeAndSharePdf } = await import('@/lib/reportPdf');
    return makeAndSharePdf(html, fileName);
  }

  const pdf = imagePdf(await drawSheets(html));

  const nav = navigator as Navigator & {
    canShare?: (data: { files: File[] }) => boolean;
    share?: (data: { files: File[]; title?: string }) => Promise<void>;
  };
  if (typeof File !== 'undefined' && nav.share && nav.canShare) {
    const file = new File([pdf], fileName, { type: 'application/pdf' });
    if (nav.canShare({ files: [file] })) {
      try {
        await nav.share({ files: [file], title: fileName });
        return 'shared';
      } catch (e) {
        // The person closed the share sheet; that is an answer, not a
        // fault, and offering a download behind it is rude.
        if ((e as Error)?.name === 'AbortError') return 'cancelled';
      }
    }
  }

  const url = URL.createObjectURL(pdf);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
  return 'saved';
}
