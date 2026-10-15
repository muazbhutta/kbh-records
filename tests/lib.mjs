// Shared helpers for the role-by-role tests.
import fs from 'node:fs';

const env = Object.fromEntries(
  fs.readFileSync(new URL('../.env', import.meta.url), 'utf8')
    .split(/\r?\n/).filter((l) => l.trim() && !l.trim().startsWith('#'))
    .map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()]),
);
export const BASE = env.EXPO_PUBLIC_SUPABASE_URL;
export const KEY = env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

export const rest = async (path, token, init = {}) => {
  const res = await fetch(`${BASE}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: KEY, Authorization: `Bearer ${token ?? KEY}`,
      'Content-Type': 'application/json', ...(init.headers ?? {}),
    },
  });
  return { status: res.status, body: await res.json().catch(() => null) };
};

export const rpc = (name, args, token) =>
  rest(`rpc/${name}`, token, { method: 'POST', body: JSON.stringify(args ?? {}) });

export const fn = async (name, body, token) => {
  const res = await fetch(`${BASE}/functions/v1/${name}`, {
    method: 'POST',
    headers: {
      apikey: KEY, Authorization: `Bearer ${token ?? KEY}`, 'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  return { status: res.status, body: await res.json().catch(() => null) };
};

export const login = async (mobile, pin) => {
  const r = await fn('pin-auth', { action: 'login', mobile, pin });
  if (!r.body?.session?.access_token) throw new Error(`login ${mobile}: ${JSON.stringify(r.body)}`);
  return {
    token: r.body.session.access_token,
    id: r.body.person.id,
    name: r.body.person.full_name,
    role: r.body.person.role,
  };
};

export const today = () =>
  new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Riyadh', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date());

/**
 * NOTE: the books were wiped on 15 Oct 2026 for the company's real
 * start. These suites expect the practice accounts, which are gone, so
 * they will not pass until a test set of people is created again. The
 * The Owner's number changed too.
 */

/** A tiny counter so each run's output reads like a checklist. */
export function scoreboard() {
  const fails = [];
  let pass = 0;
  return {
    ok(name, cond, detail = '') {
      if (cond) { pass++; console.log(`  PASS  ${name}`); }
      else { fails.push(`${name} :: ${detail}`); console.log(`  FAIL  ${name}  ${detail}`); }
    },
    section: (t) => console.log(`\n--- ${t} ---`),
    finish(label) {
      console.log(`\n${label}: ${pass} passed, ${fails.length} failed`);
      if (fails.length) { console.log('FAILURES:'); fails.forEach((f) => console.log('  * ' + f)); }
      return fails.length;
    },
  };
}
