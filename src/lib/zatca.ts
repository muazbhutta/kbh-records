/**
 * Reading the QR code a Saudi VAT invoice must carry.
 *
 * ZATCA puts five fields in the QR as base64 TLV: a tag byte, a length
 * byte, then that many bytes of UTF-8.
 *
 *   1 seller name      2 seller VAT number   3 invoice date and time
 *   4 total with VAT   5 VAT amount
 *
 * A QR that is not shaped like this — a website link, a payment code —
 * is not a ZATCA invoice QR and must not turn an expense into an Invoice.
 */

export type ZatcaInvoice = {
  seller_name: string;
  vat_number: string;
  issued_at: string | null;
  total: number | null;
  vat_amount: number | null;
  raw: string;
};

/** A Saudi VAT number is 15 digits, starts with 3 and ends with 3. */
export function isSaudiVatNumber(value: string | null | undefined): boolean {
  if (!value) return false;
  const digits = toWesternDigits(value).replace(/\D/g, '');
  return /^3\d{13}3$/.test(digits);
}

/** Arabic-Indic digits (٠١٢…) written the way the rest of the app reads them. */
export function toWesternDigits(input: string): string {
  return input.replace(/[٠-٩۰-۹]/g, (d) => {
    const code = d.charCodeAt(0);
    const base = code >= 0x06f0 ? 0x06f0 : 0x0660;
    return String(code - base);
  });
}

function base64ToBytes(value: string): Uint8Array | null {
  try {
    const clean = value.replace(/\s/g, '');
    if (!/^[A-Za-z0-9+/]+={0,2}$/.test(clean) || clean.length % 4 !== 0) return null;

    if (typeof atob === 'function') {
      const binary = atob(clean);
      const out = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
      return out;
    }

    const table = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
    const bytes: number[] = [];
    let buffer = 0;
    let bits = 0;
    for (const ch of clean) {
      if (ch === '=') break;
      const index = table.indexOf(ch);
      if (index < 0) return null;
      buffer = (buffer << 6) | index;
      bits += 6;
      if (bits >= 8) {
        bits -= 8;
        bytes.push((buffer >> bits) & 0xff);
      }
    }
    return new Uint8Array(bytes);
  } catch {
    return null;
  }
}

function utf8(bytes: Uint8Array): string {
  if (typeof TextDecoder !== 'undefined') {
    return new TextDecoder('utf-8').decode(bytes);
  }
  let out = '';
  for (let i = 0; i < bytes.length; i++) out += String.fromCharCode(bytes[i]);
  return out;
}

function parseAmount(value: string | undefined): number | null {
  if (!value) return null;
  const n = Number(toWesternDigits(value).replace(/[^\d.-]/g, ''));
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : null;
}

function parseDate(value: string | undefined): string | null {
  if (!value) return null;
  const d = new Date(toWesternDigits(value).trim());
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

/**
 * Turns the text inside a QR into an invoice, or returns null when it is
 * anything else. Both the seller's name and a real Saudi VAT number have
 * to be there before we call it a ZATCA invoice.
 */
export function parseZatcaQr(text: string): ZatcaInvoice | null {
  const bytes = base64ToBytes(text);
  if (!bytes || bytes.length < 6) return null;

  const fields = new Map<number, string>();
  let i = 0;
  while (i + 1 < bytes.length) {
    const tag = bytes[i];
    const length = bytes[i + 1];
    const start = i + 2;
    const end = start + length;
    if (length === 0 || end > bytes.length) break;
    fields.set(tag, utf8(bytes.subarray(start, end)));
    i = end;
  }

  const sellerName = (fields.get(1) ?? '').trim();
  const vatNumber = toWesternDigits((fields.get(2) ?? '').trim()).replace(/\D/g, '');

  if (!sellerName || !isSaudiVatNumber(vatNumber)) return null;

  return {
    seller_name: sellerName,
    vat_number: vatNumber,
    issued_at: parseDate(fields.get(3)),
    total: parseAmount(fields.get(4)),
    vat_amount: parseAmount(fields.get(5)),
    raw: text,
  };
}

// ------------------------------------------------------- VAT in text
const VAT_WORDS = [
  'vat',
  'tax invoice',
  'vat no',
  'vat number',
  'ضريبة القيمة المضافة',
  'الرقم الضريبي',
  'فاتورة ضريبية',
  'ضريبه القيمه المضافه',
];

/**
 * Does the text read off a bill say it is a VAT invoice? Used when there
 * is no QR. Returns the VAT number when one is printed.
 */
export function findVatInText(text: string): { found: boolean; vatNumber: string | null } {
  if (!text) return { found: false, vatNumber: null };

  const western = toWesternDigits(text);
  const lower = western.toLowerCase();

  const numberMatch = western.match(/\b3\d{13}3\b/);
  if (numberMatch) return { found: true, vatNumber: numberMatch[0] };

  if (/\b(vat|ضريبة|ضريبه)\b[^\n]{0,12}\b15\s*%/i.test(lower)) {
    return { found: true, vatNumber: null };
  }

  const hit = VAT_WORDS.some((word) => lower.includes(word));
  return { found: hit, vatNumber: null };
}
