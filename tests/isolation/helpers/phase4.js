// Phase 4 isolation test helpers
// Provides: signInAsBoard, signInAsMember, seedTestSociety, teardownPhase4,
//           refreshSession (re-exported from phase3), constants for seeded Phase 1 societies.
//
// Builds on phase3.js: imports signInTestPhone for OTP sign-in,
// adminClient for service-role provisioning, refreshSession for JWT app_metadata refresh.
//
// JavaScript only — no TypeScript, no import type. Pure ESM.

import { createClient } from "@supabase/supabase-js";
import {
  SUPABASE_URL,
  SUPABASE_ANON_KEY,
  adminClient,
  signInTestPhone,
  refreshSession,
} from "./phase3.js";

export { SUPABASE_URL, SUPABASE_ANON_KEY, adminClient, signInTestPhone, refreshSession };

// Seeded Phase 1 societies (from supabase/seed.sql) — Phase 4 tests reuse these
// instead of inserting new societies, so RLS/auth-hook behavior matches production.
export const SOCIETY_A_ID = "00000000-0000-0000-0000-00000000000a";
export const SOCIETY_B_ID = "00000000-0000-0000-0000-00000000000b";
export const WING_A_ID = "00000000-0000-0000-0000-00000000a001";
export const WING_B_ID = "00000000-0000-0000-0000-00000000b001";
export const FLAT_A_101 = "00000000-0000-0000-0000-00000000a101";
export const FLAT_A_102 = "00000000-0000-0000-0000-00000000a102";
export const FLAT_B_101 = "00000000-0000-0000-0000-00000000b101";
export const FLAT_B_102 = "00000000-0000-0000-0000-00000000b102";

// Phase 4 test phones — disjoint from Phase 3 only by intent (same 4 numbers).
// signInTestPhone deletes/recreates the auth user before sign-in so reuse is safe.
export const BOARD_A_PHONE = "+919000000001";    // Society A board member
export const MEMBER_A_PHONE = "+919000000002";   // Society A regular member
export const BOARD_A2_PHONE = "+919000000003";   // Society A second board (for race test)
export const MEMBER_B_PHONE = "+919000000004";   // Society B member (cross-society)

/**
 * Build an authenticated supabase-js client from a session access_token + refresh_token.
 * For Realtime postgres_changes, the websocket must carry the user JWT (not the anon key)
 * so RLS evaluates per-event with the correct role/society_id from app_metadata. Call
 * setSession() after construction to bind the JWT to both REST and Realtime layers.
 *
 * @param {string} accessToken
 * @param {string} refreshToken
 */
export async function clientForSession(accessToken, refreshToken) {
  const client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { error } = await client.auth.setSession({
    access_token: accessToken,
    refresh_token: refreshToken,
  });
  if (error) throw new Error(`clientForSession setSession: ${error.message}`);
  // Belt-and-braces: also bind the JWT to the Realtime layer.
  client.realtime.setAuth(accessToken);
  return client;
}

/**
 * Sign in a test phone, ensure they have a society_memberships row with the requested role,
 * then refresh the session so the inject_society_claims auth hook lands society_id + role
 * into JWT app_metadata.
 *
 * @param {string} phone     E.164 phone number (e.g. '+919000000001')
 * @param {string} societyId Society UUID
 * @param {string} flatId    Flat UUID (must belong to societyId)
 * @param {'member'|'board_member'|'co_secretary'|'secretary'} role
 * @returns {Promise<{ userId: string, accessToken: string, refreshToken: string, client: import('@supabase/supabase-js').SupabaseClient }>}
 */
async function signInWithRole(phone, societyId, flatId, role) {
  const intent = role === "secretary" || role === "co_secretary" ? "secretary" : "member";
  const session = await signInTestPhone(phone, intent);
  const admin = adminClient();

  // Upsert the membership with the requested role for this society + flat.
  // ON CONFLICT (society_id, user_id, flat_id) — keep this row active.
  const { error: membershipError } = await admin.from("society_memberships").upsert(
    {
      society_id: societyId,
      user_id: session.userId,
      flat_id: flatId,
      role,
      residency: "owner",
      household: "family",
      status: "active",
    },
    { onConflict: "society_id,user_id,flat_id" },
  );
  if (membershipError) {
    throw new Error(`signInWithRole membership upsert (${phone}, ${role}): ${membershipError.message}`);
  }

  // Refresh session so inject_society_claims hook injects society_id + role into JWT.
  const refreshed = await refreshSession(session.session.refresh_token);
  return {
    userId: session.userId,
    accessToken: refreshed.accessToken,
    refreshToken: refreshed.session.refresh_token,
    client: refreshed.client,
  };
}

/**
 * Sign in as a board member of the given society + flat.
 */
export async function signInAsBoard(phone, societyId, flatId) {
  return signInWithRole(phone, societyId, flatId, "board_member");
}

/**
 * Sign in as a regular member of the given society + flat.
 */
export async function signInAsMember(phone, societyId, flatId) {
  return signInWithRole(phone, societyId, flatId, "member");
}

/**
 * Reuse the Phase 1 seeded societies — no new society creation needed.
 * Returns the canonical IDs for Society A (default) or Society B if requested.
 * @param {'A'|'B'} which
 */
export function seedTestSociety(which = "A") {
  if (which === "A") {
    return {
      societyId: SOCIETY_A_ID,
      wingId: WING_A_ID,
      flatId: FLAT_A_101,
      flat2Id: FLAT_A_102,
    };
  }
  return {
    societyId: SOCIETY_B_ID,
    wingId: WING_B_ID,
    flatId: FLAT_B_101,
    flat2Id: FLAT_B_102,
  };
}

/**
 * Delete Phase 4 test rows for a society without touching Phase 1 seed rows.
 * Order respects FK constraints: attachments → complaint_responses → complaints,
 * then push_tokens for the supplied user IDs.
 *
 * @param {string|string[]} societyIds
 * @param {string[]} [userIds]
 */
export async function teardownPhase4(societyIds, userIds = []) {
  const admin = adminClient();
  const ids = Array.isArray(societyIds) ? societyIds : [societyIds];

  // attachments: scope by society_id AND owner_kind=complaint to avoid touching other owner kinds
  await admin
    .from("attachments")
    .delete()
    .in("society_id", ids)
    .eq("owner_kind", "complaint");

  await admin.from("complaint_responses").delete().in("society_id", ids);
  await admin.from("complaints").delete().in("society_id", ids);

  if (userIds.length > 0) {
    await admin.from("push_tokens").delete().in("user_id", userIds);
  }

  // Reset memberships back to clean state if any role-mutating tests changed them.
  // Memberships are NOT deleted here (Phase 1 + Phase 3 tests share the same memberships).
}

/**
 * Wait up to `timeoutMs` for `predicate` to return a truthy value, polling every `intervalMs`.
 * Returns the truthy value, or throws after timeout.
 * @param {() => Promise<unknown>} predicate
 * @param {number} timeoutMs
 * @param {number} intervalMs
 */
export async function waitFor(predicate, timeoutMs = 3000, intervalMs = 100) {
  const deadline = Date.now() + timeoutMs;
  let lastError = null;
  while (Date.now() < deadline) {
    try {
      const result = await predicate();
      if (result) return result;
    } catch (err) {
      lastError = err;
    }
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  if (lastError) throw lastError;
  throw new Error(`waitFor timed out after ${timeoutMs}ms`);
}
