// =====================================================================
//  scan-bill  -  reads the text off a bill photo and decides the type
// ---------------------------------------------------------------------
//  The phone already looked for a ZATCA QR before saving. This is the
//  second rule: no QR, so read the text and see whether the bill says
//  VAT anywhere. It runs AFTER the entry is saved, so nobody waits for
//  it; the entry shows "Checking bill..." until the answer comes back.
//
//  Actions
//    scan   { entryId }      -> look at one expense
//    sweep  { limit }        -> work through the ones still waiting,
//                               which is how old entries get done
//
//  Needs GOOGLE_VISION_API_KEY in the function's secrets. Without it the
//  expense stays Petty and is flagged for an Admin to look at, which is
//  exactly what the brief asks for when a bill cannot be read.
// =====================================================================

import { adminClient, fail, json, preflight, readJson } from '../_shared/lib.ts';
import { findVatInText, isSaudiVatNumber } from '../_shared/vat.ts';

type Db = ReturnType<typeof adminClient>;

const VISION_KEY = Deno.env.get('GOOGLE_VISION_API_KEY') ?? '';
const VISION_URL = 'https://vision.googleapis.com/v1/images:annotate';

/** How many photos of one expense are worth reading. */
const MAX_PHOTOS_PER_ENTRY = 3;

Deno.serve(async (req) => {
  const pre = preflight(req);
  if (pre) return pre;
  if (req.method !== 'POST') return fail('method', 'Use POST.', 405);

  const body = await readJson(req);
  const action = String(body.action ?? 'scan');
  const db = adminClient();

  try {
    if (action === 'sweep') {
      const limit = Math.min(Math.max(Number(body.limit ?? 10), 1), 50);
      const { data } = await db
        .from('entries')
        .select('id')
        .eq('type', 'expense')
        .eq('bill_scan_state', 'pending')
        .order('entered_at', { ascending: true })
        .limit(limit);

      const ids = (data ?? []).map((r) => r.id as string);
      let done = 0;
      for (const id of ids) {
        await scanOne(db, id);
        done += 1;
      }
      return json({ scanned: done, remaining: ids.length === limit });
    }

    const entryId = String(body.entryId ?? '');
    if (!entryId) return fail('bad_request', 'Which expense?', 400);
    const result = await scanOne(db, entryId);
    return json(result);
  } catch (err) {
    console.error('scan-bill failed', err);
    return fail('server', 'Could not read the bill.', 500);
  }
});

async function scanOne(db: Db, entryId: string) {
  const { data: photos } = await db
    .from('entry_photos')
    .select('storage_path')
    .eq('entry_id', entryId)
    .order('position')
    .limit(MAX_PHOTOS_PER_ENTRY);

  const paths = (photos ?? []).map((p) => p.storage_path as string);

  if (paths.length === 0 || !VISION_KEY) {
    // No bill to read, or no key set up: stay Petty and let an Admin look.
    await db.rpc('apply_bill_scan', {
      p_entry_id: entryId,
      p_found: false,
      p_failed: true,
    });
    return { entryId, state: 'failed', reason: paths.length === 0 ? 'no photos' : 'no key' };
  }

  let text = '';
  for (const path of paths) {
    const page = await readText(db, path);
    if (page) text += `\n${page}`;
  }

  if (!text.trim()) {
    await db.rpc('apply_bill_scan', { p_entry_id: entryId, p_found: false, p_failed: true });
    return { entryId, state: 'failed', reason: 'nothing readable' };
  }

  const { found, vatNumber } = findVatInText(text);

  await db.rpc('apply_bill_scan', {
    p_entry_id: entryId,
    p_found: found,
    p_source: found ? 'auto_vat_text' : 'auto_none',
    p_vat: isSaudiVatNumber(vatNumber) ? vatNumber : null,
  });

  return { entryId, state: 'done', found, vatNumber };
}

/** Pulls one photo out of the private bucket and asks Vision for its text. */
async function readText(db: Db, path: string): Promise<string | null> {
  try {
    const { data, error } = await db.storage.from('bills').download(path);
    if (error || !data) return null;

    const bytes = new Uint8Array(await data.arrayBuffer());
    let binary = '';
    for (let i = 0; i < bytes.length; i += 0x8000) {
      binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    }
    const base64 = btoa(binary);

    const res = await fetch(`${VISION_URL}?key=${VISION_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        requests: [
          {
            image: { content: base64 },
            features: [{ type: 'TEXT_DETECTION' }],
            // Saudi bills are usually Arabic, English, or both.
            imageContext: { languageHints: ['ar', 'en'] },
          },
        ],
      }),
    });

    if (!res.ok) {
      console.error('vision returned', res.status, await res.text());
      return null;
    }

    const body = await res.json();
    return body?.responses?.[0]?.fullTextAnnotation?.text ?? null;
  } catch (err) {
    console.error('could not read a photo', err);
    return null;
  }
}
