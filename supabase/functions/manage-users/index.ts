// =====================================================================
//  manage-users  -  Admin / Sub-admin only Edge Function
// ---------------------------------------------------------------------
//  Actions
//    create      -> add a person (name, mobile, role, 4-digit PIN)
//    update      -> change name, job title, mobile or role
//    reset-pin   -> give a person a new 4-digit PIN
//    set-active  -> turn an account off (or back on)
//
//  The caller's own session token is checked here, not trusted from the
//  request body. The Owner account is protected again at database level
//  by the app_users_guard trigger.
// =====================================================================

import {
  adminClient,
  cleanName,
  fail,
  isRole,
  isValidPin,
  isWeakPin,
  json,
  mobileEmail,
  normalizeMobile,
  PERSON_COLUMNS,
  preflight,
  readJson,
  userClient,
  type Role,
} from '../_shared/lib.ts';
import { createPerson, hashPin } from '../_shared/person.ts';

type Db = ReturnType<typeof adminClient>;

type Caller = {
  id: string;
  full_name: string;
  role: Role;
  is_owner: boolean;
  /** The caller's own token, so their edits are recorded under their name. */
  token: string;
};

Deno.serve(async (req) => {
  const pre = preflight(req);
  if (pre) return pre;
  if (req.method !== 'POST') return fail('method', 'Use POST.', 405);

  const db = adminClient();
  const caller = await resolveCaller(db, req);
  if ('response' in caller) return caller.response;

  const body = await readJson(req);
  const action = String(body.action ?? '');

  try {
    switch (action) {
      case 'create':
        return await handleCreate(db, caller.user, body);
      case 'update':
        return await handleUpdate(db, caller.user, body);
      case 'reset-pin':
        return await handleResetPin(db, caller.user, body);
      case 'set-active':
        return await handleSetActive(db, caller.user, body);
      default:
        return fail('unknown_action', 'Unknown action.', 400);
    }
  } catch (err) {
    console.error('manage-users failed', action, err);
    return fail('server', 'Something went wrong. Please try again.', 500);
  }
});

// ---------------------------------------------------------- who is it?
async function resolveCaller(
  db: Db,
  req: Request,
): Promise<{ user: Caller } | { response: Response }> {
  const header = req.headers.get('Authorization') ?? '';
  const token = header.toLowerCase().startsWith('bearer ') ? header.slice(7).trim() : '';
  if (!token) return { response: fail('no_session', 'Please log in again.', 401) };

  const { data, error } = await db.auth.getUser(token);
  if (error || !data.user) return { response: fail('no_session', 'Please log in again.', 401) };

  const { data: me } = await db
    .from('app_users')
    .select('id, full_name, role, is_owner, is_active')
    .eq('id', data.user.id)
    .maybeSingle();

  if (!me) return { response: fail('no_session', 'Please log in again.', 401) };
  if (!me.is_active) return { response: fail('disabled', 'This account is turned off.', 403) };
  if (me.role !== 'admin' && me.role !== 'sub_admin') {
    return { response: fail('not_allowed', 'Only an Admin can do this.', 403) };
  }

  return { user: { ...(me as Caller), token } };
}

async function loadTarget(db: Db, userId: unknown) {
  if (typeof userId !== 'string' || userId.length < 10) return null;
  const { data } = await db
    .from('app_users')
    .select('id, full_name, mobile, role, is_owner, is_active')
    .eq('id', userId)
    .maybeSingle();
  return data;
}

// -------------------------------------------------------------- create
async function handleCreate(db: Db, me: Caller, body: Record<string, unknown>) {
  const fullName = cleanName(body.fullName);
  const mobile = normalizeMobile(body.mobile);
  const pin = body.pin;
  const role = body.role;
  const jobTitle = typeof body.jobTitle === 'string' ? body.jobTitle.trim() || null : null;

  if (!fullName) return fail('bad_name', 'Please enter the full name.');
  if (!mobile) return fail('bad_mobile', 'Enter a Saudi mobile number like 0501234567.');
  if (!isRole(role)) return fail('bad_role', 'Choose Admin, Sub-admin or Employee.');
  if (!isValidPin(pin)) return fail('bad_pin', 'The PIN must be exactly 4 digits.');
  if (isWeakPin(pin)) return fail('weak_pin', 'That PIN is too easy to guess. Choose another one.');

  const created = await createPerson(db, {
    fullName,
    mobile,
    pin,
    role,
    isOwner: false,
    jobTitle,
    createdBy: me.id,
    isHead: body.isHead === true,
    headId: typeof body.headId === 'string' && body.headId.length > 10 ? body.headId : null,
  });
  if (!created.ok) return created.response;

  return json({ person: created.person });
}

// -------------------------------------------------------------- update
async function handleUpdate(db: Db, me: Caller, body: Record<string, unknown>) {
  const target = await loadTarget(db, body.userId);
  if (!target) return fail('not_found', 'That person was not found.', 404);

  // The Owner's own card is his alone. Another Admin changing the Owner's
  // mobile number would lock the Owner out of the company's books just as
  // surely as turning the account off, which is not allowed either.
  if (target.is_owner && target.id !== me.id) {
    return fail(
      'owner_protected',
      'Only the Owner can change the Owner account.',
      403,
    );
  }

  const patch: Record<string, unknown> = {};

  if (body.fullName !== undefined) {
    const fullName = cleanName(body.fullName);
    if (!fullName) return fail('bad_name', 'Please enter the full name.');
    patch.full_name = fullName;
  }

  if (body.jobTitle !== undefined) {
    patch.job_title =
      typeof body.jobTitle === 'string' ? body.jobTitle.trim() || null : null;
  }

  if (body.isHead !== undefined) {
    patch.is_head = body.isHead === true;
  }

  if (body.headId !== undefined) {
    const headId = typeof body.headId === 'string' && body.headId.length > 10 ? body.headId : null;
    if (headId === target.id) {
      return fail('bad_head', 'A person cannot work under themselves.');
    }
    patch.head_id = headId;
  }

  if (body.role !== undefined && body.role !== target.role) {
    if (!isRole(body.role)) return fail('bad_role', 'Choose Admin, Sub-admin or Employee.');
    if (target.is_owner) {
      return fail('owner_protected', 'The Owner must stay an Admin.', 403);
    }
    if (target.id === me.id) {
      return fail('self_role', 'You cannot change your own role. Ask another Admin.', 403);
    }
    patch.role = body.role;
  }

  let newMobile: string | null = null;
  if (body.mobile !== undefined) {
    const mobile = normalizeMobile(body.mobile);
    if (!mobile) return fail('bad_mobile', 'Enter a Saudi mobile number like 0501234567.');
    if (mobile !== target.mobile) {
      const { data: clash } = await db
        .from('app_users')
        .select('id')
        .eq('mobile', mobile)
        .maybeSingle();
      if (clash) return fail('mobile_taken', 'Someone already uses this mobile number.', 409);
      patch.mobile = mobile;
      newMobile = mobile;
    }
  }

  if (Object.keys(patch).length === 0) {
    return json({ person: target, changed: false });
  }

  // The login email follows the mobile number.
  if (newMobile) {
    const { error: emailError } = await db.auth.admin.updateUserById(target.id, {
      email: mobileEmail(newMobile),
      email_confirm: true,
    });
    if (emailError) {
      console.error('email update failed', emailError);
      return fail('update_failed', 'Could not change the mobile number.', 500);
    }
  }

  const { data: person, error } = await userClient(me.token)
    .from('app_users')
    .update(patch)
    .eq('id', target.id)
    .select(PERSON_COLUMNS)
    .single();

  if (error) return guardError(error, 'Could not save the changes.');

  return json({ person, changed: true });
}

// ----------------------------------------------------------- reset PIN
async function handleResetPin(db: Db, me: Caller, body: Record<string, unknown>) {
  const target = await loadTarget(db, body.userId);
  if (!target) return fail('not_found', 'That person was not found.', 404);

  const pin = body.pin;
  if (!isValidPin(pin)) return fail('bad_pin', 'The PIN must be exactly 4 digits.');
  if (isWeakPin(pin)) return fail('weak_pin', 'That PIN is too easy to guess. Choose another one.');

  // Nobody but the Owner can take over the Owner account.
  if (target.is_owner && target.id !== me.id) {
    return fail('owner_protected', 'Only the Owner can change the Owner PIN.', 403);
  }

  const { error } = await db.rpc('set_person_pin', {
    p_user_id: target.id,
    p_pin_hash: await hashPin(pin),
    p_set_by: me.id,
  });
  if (error) return guardError(error, 'Could not set the new PIN.');

  return json({ ok: true });
}

// ---------------------------------------------------------- set active
async function handleSetActive(db: Db, me: Caller, body: Record<string, unknown>) {
  const target = await loadTarget(db, body.userId);
  if (!target) return fail('not_found', 'That person was not found.', 404);

  const isActive = body.isActive === true;

  if (target.is_owner && !isActive) {
    return fail('owner_protected', 'The Owner account can never be turned off.', 403);
  }
  if (target.id === me.id && !isActive) {
    return fail('self_disable', 'You cannot turn off your own account.', 403);
  }

  const { data: person, error } = await userClient(me.token)
    .from('app_users')
    .update({ is_active: isActive })
    .eq('id', target.id)
    .select(PERSON_COLUMNS)
    .single();

  if (error) return guardError(error, 'Could not change the account.');

  if (!isActive) {
    // Row Level Security already stops a turned-off account from reading
    // anything, so any session still on their phone goes dead at once.
    // Clear the lockout counters so turning the account back on is clean.
    await db
      .from('user_secrets')
      .update({ failed_attempts: 0, locked_until: null })
      .eq('user_id', target.id);
  }

  return json({ person });
}

/**
 * Turn a database guard-trigger error into a message a person can read.
 * Those triggers already phrase their reasons in plain English, so they
 * are passed straight through rather than hidden behind a generic one.
 */
function guardError(error: { message?: string; code?: string }, fallback: string) {
  const message = error.message ?? '';
  if (message.includes('Owner')) return fail('owner_protected', message, 403);
  if (message.includes('never deleted')) return fail('no_delete', message, 403);
  if (message.includes('under themselves') || message.includes('in a circle')) {
    return fail('bad_head', message, 400);
  }
  if (message.includes('under this head')) return fail('head_has_team', message, 400);
  if (message.includes('not a head')) return fail('bad_head', message, 400);
  console.error('database refused the change', error);
  return fail('update_failed', fallback, 500);
}
