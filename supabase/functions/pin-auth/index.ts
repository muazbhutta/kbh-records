// =====================================================================
//  pin-auth  -  public Edge Function (deploy with --no-verify-jwt)
// ---------------------------------------------------------------------
//  Actions
//    status          -> is the database empty, i.e. do we need an Owner?
//    bootstrap-owner -> one-time creation of the Owner account
//    login           -> mobile + 4-digit PIN  ->  a real Supabase session
//
//  The PIN is never stored or compared on the phone. It is bcrypt-hashed
//  in public.user_secrets, which no API key except service_role can read.
// =====================================================================

import { compare } from 'npm:bcryptjs@3.0.3';
import {
  adminClient,
  anonClient,
  cleanName,
  fail,
  isValidPin,
  isWeakPin,
  json,
  mobileEmail,
  normalizeMobile,
  PERSON_COLUMNS,
  preflight,
  readJson,
} from '../_shared/lib.ts';
import { createPerson } from '../_shared/person.ts';

const MAX_ATTEMPTS = 5;
const LOCK_MINUTES = 15;

type Db = ReturnType<typeof adminClient>;

Deno.serve(async (req) => {
  const pre = preflight(req);
  if (pre) return pre;
  if (req.method !== 'POST') return fail('method', 'Use POST.', 405);

  const body = await readJson(req);
  const action = String(body.action ?? '');

  try {
    switch (action) {
      case 'status':
        return await handleStatus();
      case 'bootstrap-owner':
        return await handleBootstrapOwner(body);
      case 'login':
        return await handleLogin(body);
      default:
        return fail('unknown_action', 'Unknown action.', 400);
    }
  } catch (err) {
    console.error('pin-auth failed', action, err);
    return fail('server', 'Something went wrong. Please try again.', 500);
  }
});

// -------------------------------------------------------------- status
async function handleStatus() {
  const db = adminClient();
  const { count, error } = await db
    .from('app_users')
    .select('id', { count: 'exact', head: true });
  if (error) throw error;
  return json({ needsOwner: (count ?? 0) === 0 });
}

// ------------------------------------------------------ bootstrap owner
async function handleBootstrapOwner(body: Record<string, unknown>) {
  const db = adminClient();

  const { count, error: countError } = await db
    .from('app_users')
    .select('id', { count: 'exact', head: true });
  if (countError) throw countError;
  if ((count ?? 0) > 0) {
    return fail('already_setup', 'This company is already set up. Please log in.', 409);
  }

  const fullName = cleanName(body.fullName);
  const mobile = normalizeMobile(body.mobile);
  const pin = body.pin;
  const jobTitle = typeof body.jobTitle === 'string' ? body.jobTitle.trim() || null : null;

  if (!fullName) return fail('bad_name', 'Please enter the full name.');
  if (!mobile) return fail('bad_mobile', 'Enter a Saudi mobile number like 0501234567.');
  if (!isValidPin(pin)) return fail('bad_pin', 'The PIN must be exactly 4 digits.');
  if (isWeakPin(pin)) return fail('weak_pin', 'That PIN is too easy to guess. Choose another one.');

  const created = await createPerson(db, {
    fullName,
    mobile,
    pin,
    role: 'admin',
    isOwner: true,
    jobTitle,
    createdBy: null,
  });
  if (!created.ok) return created.response;

  return await issueSession(db, mobile, created.authPassword, String(created.person.id));
}

// --------------------------------------------------------------- login
async function handleLogin(body: Record<string, unknown>) {
  const db = adminClient();

  const mobile = normalizeMobile(body.mobile);
  const pin = body.pin;

  if (!mobile) return fail('bad_mobile', 'Enter a Saudi mobile number like 0501234567.');
  if (!isValidPin(pin)) return fail('bad_pin', 'The PIN must be exactly 4 digits.');

  const { data: person, error } = await db
    .from('app_users')
    .select(PERSON_COLUMNS)
    .eq('mobile', mobile)
    .maybeSingle();
  if (error) throw error;

  if (!person) {
    await logAttempt(db, mobile, null, false, 'no_such_user');
    return fail('no_such_user', 'This mobile number is not registered.', 401);
  }

  if (!person.is_active) {
    await logAttempt(db, mobile, person.id, false, 'disabled');
    return fail('disabled', 'This account is turned off. Ask the owner to turn it back on.', 403);
  }

  const { data: secret, error: secretError } = await db
    .from('user_secrets')
    .select('pin_hash, failed_attempts, locked_until')
    .eq('user_id', person.id)
    .maybeSingle();
  if (secretError) throw secretError;

  if (!secret) {
    await logAttempt(db, mobile, person.id, false, 'no_pin');
    return fail('no_pin', 'No PIN is set for this account. Ask the owner to set one.', 403);
  }

  const lockedUntil = secret.locked_until ? new Date(secret.locked_until) : null;
  if (lockedUntil && lockedUntil.getTime() > Date.now()) {
    const minutes = Math.max(1, Math.ceil((lockedUntil.getTime() - Date.now()) / 60_000));
    await logAttempt(db, mobile, person.id, false, 'locked');
    return fail(
      'locked',
      `Too many wrong PINs. Try again in ${minutes} minute${minutes === 1 ? '' : 's'}.`,
      423,
      { lockedUntil: secret.locked_until, minutesLeft: minutes },
    );
  }

  const ok = await compare(pin, secret.pin_hash);

  if (!ok) {
    const attempts = (secret.failed_attempts ?? 0) + 1;
    const lock = attempts >= MAX_ATTEMPTS;
    const until = lock ? new Date(Date.now() + LOCK_MINUTES * 60_000).toISOString() : null;

    await db
      .from('user_secrets')
      .update({ failed_attempts: lock ? 0 : attempts, locked_until: until })
      .eq('user_id', person.id);

    await logAttempt(db, mobile, person.id, false, lock ? 'locked_out' : 'wrong_pin');

    if (lock) {
      return fail(
        'locked',
        `Too many wrong PINs. This account is locked for ${LOCK_MINUTES} minutes.`,
        423,
        { lockedUntil: until, minutesLeft: LOCK_MINUTES },
      );
    }

    const left = MAX_ATTEMPTS - attempts;
    return fail(
      'wrong_pin',
      `Wrong PIN. ${left} ${left === 1 ? 'try' : 'tries'} left before the account locks.`,
      401,
      { triesLeft: left },
    );
  }

  const { data: authRow, error: authError } = await db
    .from('user_secrets')
    .update({ failed_attempts: 0, locked_until: null })
    .eq('user_id', person.id)
    .select('auth_password')
    .single();
  if (authError) throw authError;

  await logAttempt(db, mobile, person.id, true, null);
  return await issueSession(db, mobile, authRow.auth_password, person.id);
}

// ------------------------------------------------------------- helpers

async function issueSession(db: Db, mobile: string, authPassword: string, userId: string) {
  const { data, error } = await anonClient().auth.signInWithPassword({
    email: mobileEmail(mobile),
    password: authPassword,
  });

  if (error || !data.session) {
    console.error('session mint failed', error);
    return fail('session', 'Could not start your session. Please try again.', 500);
  }

  const { data: person } = await db
    .from('app_users')
    .select(PERSON_COLUMNS)
    .eq('id', userId)
    .single();

  return json({ session: data.session, person });
}

async function logAttempt(
  db: Db,
  mobile: string,
  userId: string | null,
  success: boolean,
  reason: string | null,
) {
  const { error } = await db
    .from('login_attempts')
    .insert({ mobile, user_id: userId, success, reason });
  if (error) console.error('could not record login attempt', error);
}
