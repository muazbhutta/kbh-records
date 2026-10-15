// Creating a person touches three places at once: auth.users, app_users
// and user_secrets. This module keeps that in one place so pin-auth and
// manage-users behave identically.

import { hash } from 'npm:bcryptjs@3.0.3';
import {
  adminClient,
  fail,
  mobileEmail,
  randomAuthPassword,
  type Role,
} from './lib.ts';

export const BCRYPT_ROUNDS = 10;

export function hashPin(pin: string): Promise<string> {
  return hash(pin, BCRYPT_ROUNDS);
}

export type CreatePersonInput = {
  fullName: string;
  mobile: string;
  pin: string;
  role: Role;
  isOwner: boolean;
  jobTitle: string | null;
  createdBy: string | null;
  isHead?: boolean;
  headId?: string | null;
};

export type CreatePersonResult =
  | { ok: true; person: Record<string, unknown>; authPassword: string }
  | { ok: false; response: Response };

export async function createPerson(
  db: ReturnType<typeof adminClient>,
  input: CreatePersonInput,
): Promise<CreatePersonResult> {
  const { data: existing } = await db
    .from('app_users')
    .select('id, full_name')
    .eq('mobile', input.mobile)
    .maybeSingle();

  if (existing) {
    return {
      ok: false,
      response: fail('mobile_taken', 'Someone already uses this mobile number.', 409),
    };
  }

  const authPassword = randomAuthPassword();
  const email = mobileEmail(input.mobile);

  const attributes = {
    email,
    password: authPassword,
    email_confirm: true,
    user_metadata: { full_name: input.fullName, mobile: input.mobile },
  };

  let { data: created, error: createError } = await db.auth.admin.createUser(attributes);

  if (createError) {
    // An earlier attempt may have made the login account and then failed
    // before the person row existed. Clear that leftover and try once more,
    // so a mobile number can never get stuck.
    const removed = await removeOrphanAuthUser(db, email);
    if (removed) {
      ({ data: created, error: createError } = await db.auth.admin.createUser(attributes));
    }
  }

  if (createError || !created?.user) {
    console.error('createUser failed', createError);
    return { ok: false, response: fail('create_failed', 'Could not create the account.', 500) };
  }

  const pinHash = await hashPin(input.pin);

  const { data: person, error: rpcError } = await db.rpc('create_person', {
    p_id: created.user.id,
    p_full_name: input.fullName,
    p_mobile: input.mobile,
    p_role: input.role,
    p_is_owner: input.isOwner,
    p_pin_hash: pinHash,
    p_auth_password: authPassword,
    p_job_title: input.jobTitle,
    p_created_by: input.createdBy,
  });

  if (rpcError) {
    // Roll the half-made account back so the mobile number stays free.
    await db.auth.admin.deleteUser(created.user.id);
    console.error('create_person failed', rpcError);
    return { ok: false, response: fail('create_failed', 'Could not save the new person.', 500) };
  }

  // The team placement is a plain follow-up write, guarded by its own
  // trigger, so a bad head cannot stop the person being created.
  if (input.isHead || input.headId) {
    const { error: teamError } = await db
      .from('app_users')
      .update({
        ...(input.isHead !== undefined ? { is_head: !!input.isHead } : {}),
        ...(input.headId !== undefined ? { head_id: input.headId ?? null } : {}),
      })
      .eq('id', created.user.id);
    if (teamError) console.error('could not set the team', teamError);
  }

  return { ok: true, person: person as Record<string, unknown>, authPassword };
}

/**
 * Deletes a login account that has no person row behind it. Returns true
 * when something was actually cleaned up.
 */
async function removeOrphanAuthUser(
  db: ReturnType<typeof adminClient>,
  email: string,
): Promise<boolean> {
  const { data, error } = await db.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (error || !data?.users) return false;

  const match = data.users.find((u) => u.email?.toLowerCase() === email.toLowerCase());
  if (!match) return false;

  const { data: owner } = await db
    .from('app_users')
    .select('id')
    .eq('id', match.id)
    .maybeSingle();
  if (owner) return false; // a real person - leave it alone

  const { error: deleteError } = await db.auth.admin.deleteUser(match.id);
  return !deleteError;
}
