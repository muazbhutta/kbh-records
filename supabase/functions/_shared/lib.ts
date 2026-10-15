// Shared helpers for the KBH Records Edge Functions.
// Runs on Deno inside Supabase Edge Functions.

import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2.117.3';

export const CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, x-kbh-client',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Max-Age': '86400',
};

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  });
}

/** Every failure the app shows the user comes back in this shape. */
export function fail(code: string, message: string, status = 400, extra: Record<string, unknown> = {}) {
  return json({ error: { code, message, ...extra } }, status);
}

export function preflight(req: Request): Response | null {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS_HEADERS });
  return null;
}

/**
 * Supabase is moving from the old anon / service_role JWTs to the newer
 * publishable / secret keys, and which pair a project gets depends on when
 * it was made. Take whichever one is actually there.
 */
function envKey(...names: string[]): string {
  for (const name of names) {
    const value = Deno.env.get(name);
    if (value) return value;
  }
  throw new Error(`None of these are set in this function's environment: ${names.join(', ')}`);
}

const SUPABASE_URL = envKey('SUPABASE_URL');
const SERVICE_ROLE_KEY = envKey('SUPABASE_SERVICE_ROLE_KEY', 'SUPABASE_SECRET_KEY');
const ANON_KEY = envKey('SUPABASE_ANON_KEY', 'SUPABASE_PUBLISHABLE_KEY');

/** Full-power client. Never expose its results blindly. */
export function adminClient(): SupabaseClient {
  return createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/** A client acting AS the signed-in caller, so RLS and auth.uid() apply. */
export function userClient(token: string): SupabaseClient {
  return createClient(SUPABASE_URL, ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
}

/** Anon client, used only to mint a real session with the derived password. */
export function anonClient(): SupabaseClient {
  return createClient(SUPABASE_URL, ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

// ---------------------------------------------------------------- input

/**
 * Accepts 0501234567, 501234567, +966 50 123 4567, 00966501234567 ...
 * and returns the canonical 966501234567, or null when it is not a
 * valid Saudi mobile number.
 */
export function normalizeMobile(input: unknown): string | null {
  if (typeof input !== 'string') return null;
  let d = input.replace(/\D/g, '');
  if (d.startsWith('00966')) d = d.slice(5);
  else if (d.startsWith('966')) d = d.slice(3);
  else if (d.startsWith('0')) d = d.slice(1);
  if (!/^5\d{8}$/.test(d)) return null;
  return `966${d}`;
}

export function prettyMobile(mobile: string): string {
  // 966501234567 -> +966 50 123 4567
  const n = mobile.slice(3);
  return `+966 ${n.slice(0, 2)} ${n.slice(2, 5)} ${n.slice(5)}`;
}

export function isValidPin(pin: unknown): pin is string {
  return typeof pin === 'string' && /^\d{4}$/.test(pin);
}

/** PINs that anyone would guess first. */
const WEAK_PINS = new Set([
  '0000', '1111', '2222', '3333', '4444', '5555', '6666', '7777', '8888', '9999',
  '1234', '4321', '0123', '1212', '2580', '1122',
]);

export function isWeakPin(pin: string): boolean {
  return WEAK_PINS.has(pin);
}

export function cleanName(input: unknown): string | null {
  if (typeof input !== 'string') return null;
  const name = input.replace(/\s+/g, ' ').trim();
  if (name.length < 2 || name.length > 80) return null;
  return name;
}

export type Role = 'admin' | 'sub_admin' | 'employee';
export const ROLES: Role[] = ['admin', 'sub_admin', 'employee'];
export function isRole(v: unknown): v is Role {
  return typeof v === 'string' && (ROLES as string[]).includes(v);
}

// ------------------------------------------------------------- secrets

/** The login email is synthetic. No mail is ever sent to it. */
export function mobileEmail(mobile: string): string {
  return `${mobile}@kbh-rms.local`;
}

/** A long random password that only the server ever sees. */
export function randomAuthPassword(): string {
  const bytes = new Uint8Array(36);
  crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes)).replace(/[^A-Za-z0-9]/g, '') + 'Aa1!';
}

export async function readJson(req: Request): Promise<Record<string, unknown>> {
  try {
    const body = await req.json();
    return body && typeof body === 'object' ? (body as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

export type PersonRow = {
  id: string;
  full_name: string;
  mobile: string;
  role: Role;
  is_owner: boolean;
  is_active: boolean;
  job_title: string | null;
  created_at: string;
};

export const PERSON_COLUMNS =
  'id, full_name, mobile, role, is_owner, is_active, job_title, is_head, head_id, created_at';
