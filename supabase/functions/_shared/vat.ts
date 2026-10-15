/**
 * Deciding whether the text read off a bill makes it a VAT invoice.
 * The same rules as src/lib/zatca.ts on the app side, kept here because
 * an Edge Function cannot import from the app's source.
 */

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

/** Arabic-Indic digits (٠١٢…) written as 012… */
export function toWesternDigits(input: string): string {
  return input.replace(/[٠-٩۰-۹]/g, (d) => {
    const code = d.charCodeAt(0);
    const base = code >= 0x06f0 ? 0x06f0 : 0x0660;
    return String(code - base);
  });
}

/** A Saudi VAT number is 15 digits, starts with 3 and ends with 3. */
export function isSaudiVatNumber(value: string | null): boolean {
  if (!value) return false;
  return /^3\d{13}3$/.test(toWesternDigits(value).replace(/\D/g, ''));
}

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
