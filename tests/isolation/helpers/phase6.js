// Phase 6 isolation test helpers.
// Re-exports phase5.js primitives (which re-export phase4/phase3:
// clientForSession, signInAsBoard/Member, seedTestSociety, adminClient,
// refreshSession, signInTestPhone, FLAT_A_101/FLAT_A_102/FLAT_B_* fixtures,
// waitFor) and adds:
//   - signInAsSecretary / signInAsCoSecretary (admin roles for issue/waive/
//     restore/takedown/grievance) — composed from exported primitives since
//     phase4's private signInWithRole only exposes board/member.
//   - Phase 6 service-role seed helpers: seedFlatAction, seedPost, seedComment,
//     seedReport (bypass the REVOKE on the mutation tables; clients can only
//     write through the RPCs).
//   - teardownPhase6 — FK-respecting delete of the 5 Phase 6 tables' rows.
//
// supabase-js v2 quirk (Pitfall 1): the query builder is a thenable, NOT a
// Promise — always `const { data, error } = await supabase...`, NEVER `.catch`
// on a builder chain.
//
// JavaScript only — no TypeScript, no import type. Pure ESM.

import {
  SUPABASE_URL,
  SUPABASE_ANON_KEY,
  adminClient,
  signInTestPhone,
  refreshSession,
  clientForSession,
  signInAsBoard,
  signInAsMember,
  seedTestSociety,
  waitFor,
  SOCIETY_A_ID,
  SOCIETY_B_ID,
  WING_A_ID,
  WING_B_ID,
  FLAT_A_101,
  FLAT_A_102,
  FLAT_B_101,
  FLAT_B_102,
  BOARD_A_PHONE,
  MEMBER_A_PHONE,
  BOARD_A2_PHONE,
  MEMBER_B_PHONE,
  seedAmenity,
  seedNotification,
  seedBooking,
  seedPushDelivery,
  seedPushDeliveries,
  seedNotificationPreference,
  clearNotificationPreference,
  teardownPhase5,
} from "./phase5.js";

export {
  SUPABASE_URL,
  SUPABASE_ANON_KEY,
  adminClient,
  signInTestPhone,
  refreshSession,
  clientForSession,
  signInAsBoard,
  signInAsMember,
  seedTestSociety,
  waitFor,
  SOCIETY_A_ID,
  SOCIETY_B_ID,
  WING_A_ID,
  WING_B_ID,
  FLAT_A_101,
  FLAT_A_102,
  FLAT_B_101,
  FLAT_B_102,
  BOARD_A_PHONE,
  MEMBER_A_PHONE,
  BOARD_A2_PHONE,
  MEMBER_B_PHONE,
  seedAmenity,
  seedNotification,
  seedBooking,
  seedPushDelivery,
  seedPushDeliveries,
  seedNotificationPreference,
  clearNotificationPreference,
  teardownPhase5,
};

// Phase 6 test phones (added to [auth.sms.test_otp] in supabase/config.toml).
export const SECRETARY_A_PHONE = "+919000000005"; // Society A secretary
export const MEMBER_A2_PHONE = "+919000000006"; // Society A member on a SECOND flat (cross-flat)
export const CO_SECRETARY_A_PHONE = "+919000000007"; // Society A co_secretary

/**
 * Sign in a test phone, ensure a society_memberships row with the requested
 * role/flat, then refresh the session so inject_society_claims lands
 * society_id + role into JWT app_metadata. Mirrors phase4's private
 * signInWithRole, re-built here so secretary / co_secretary roles are reachable.
 *
 * @param {string} phone
 * @param {string} societyId
 * @param {string} flatId
 * @param {'member'|'board_member'|'co_secretary'|'secretary'} role
 * @returns {Promise<{ userId: string, accessToken: string, refreshToken: string, client: import('@supabase/supabase-js').SupabaseClient }>}
 */
async function signInWithRole(phone, societyId, flatId, role) {
  const intent = role === "secretary" || role === "co_secretary" ? "secretary" : "member";
  const session = await signInTestPhone(phone, intent);
  const admin = adminClient();

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

  const refreshed = await refreshSession(session.session.refresh_token);
  return {
    userId: session.userId,
    accessToken: refreshed.accessToken,
    refreshToken: refreshed.session.refresh_token,
    client: refreshed.client,
  };
}

/** Sign in as a secretary (admin) of the given society + flat. */
export async function signInAsSecretary(phone, societyId, flatId) {
  return signInWithRole(phone, societyId, flatId, "secretary");
}

/** Sign in as a co_secretary (admin) of the given society + flat. */
export async function signInAsCoSecretary(phone, societyId, flatId) {
  return signInWithRole(phone, societyId, flatId, "co_secretary");
}

/**
 * Seed a flat_actions row directly (service-role bypasses the REVOKE).
 * fine_status defaults to 'outstanding' for kind='fine', null otherwise.
 *
 * @param {{ societyId: string, flatId: string, issuerId: string, issuerFlatId?: string|null, kind?: string, body?: string, amount?: number|null, dueDate?: string|null, fineStatus?: string|null }} opts
 * @returns {Promise<string>} the flat action id
 */
export async function seedFlatAction(opts) {
  const {
    societyId,
    flatId,
    issuerId,
    issuerFlatId = null,
    kind = "warning",
    body = "Test flat action",
    amount = null,
    dueDate = null,
    fineStatus,
  } = opts;
  const admin = adminClient();
  const row = {
    society_id: societyId,
    flat_id: flatId,
    issuer_id: issuerId,
    issuer_flat_id: issuerFlatId,
    kind,
    body,
    amount,
    due_date: dueDate,
    fine_status: fineStatus !== undefined ? fineStatus : kind === "fine" ? "outstanding" : null,
  };
  const { data, error } = await admin.from("flat_actions").insert(row).select("id").single();
  if (error) throw new Error(`seedFlatAction: ${error.message}`);
  return data.id;
}

/**
 * Seed a posts row directly (service-role).
 *
 * @param {{ societyId: string, authorId: string, authorFlatId?: string|null, kind?: string, body?: string, hiddenAt?: string|null, deletedAt?: string|null }} opts
 * @returns {Promise<string>} the post id
 */
export async function seedPost(opts) {
  const {
    societyId,
    authorId,
    authorFlatId = null,
    kind = "general",
    body = "Test post",
    hiddenAt = null,
    deletedAt = null,
  } = opts;
  const admin = adminClient();
  const { data, error } = await admin
    .from("posts")
    .insert({
      society_id: societyId,
      author_id: authorId,
      author_flat_id: authorFlatId,
      kind,
      body,
      hidden_at: hiddenAt,
      deleted_at: deletedAt,
    })
    .select("id")
    .single();
  if (error) throw new Error(`seedPost: ${error.message}`);
  return data.id;
}

/**
 * Seed a post_comments row directly (service-role).
 *
 * @param {{ societyId: string, postId: string, authorId: string, authorFlatId?: string|null, body?: string, hiddenAt?: string|null, deletedAt?: string|null }} opts
 * @returns {Promise<string>} the comment id
 */
export async function seedComment(opts) {
  const {
    societyId,
    postId,
    authorId,
    authorFlatId = null,
    body = "Test comment",
    hiddenAt = null,
    deletedAt = null,
  } = opts;
  const admin = adminClient();
  const { data, error } = await admin
    .from("post_comments")
    .insert({
      society_id: societyId,
      post_id: postId,
      author_id: authorId,
      author_flat_id: authorFlatId,
      body,
      hidden_at: hiddenAt,
      deleted_at: deletedAt,
    })
    .select("id")
    .single();
  if (error) throw new Error(`seedComment: ${error.message}`);
  return data.id;
}

/**
 * Seed a reports row directly (service-role).
 *
 * @param {{ societyId: string, targetKind: string, targetId: string, reporterId: string, reason?: string, note?: string|null }} opts
 * @returns {Promise<string>} the report id
 */
export async function seedReport(opts) {
  const { societyId, targetKind, targetId, reporterId, reason = "inappropriate", note = null } = opts;
  const admin = adminClient();
  const { data, error } = await admin
    .from("reports")
    .insert({
      society_id: societyId,
      target_kind: targetKind,
      target_id: targetId,
      reporter_id: reporterId,
      reason,
      note,
    })
    .select("id")
    .single();
  if (error) throw new Error(`seedReport: ${error.message}`);
  return data.id;
}

/**
 * Clear the Grievance Officer columns on a society (so get_grievance_officer
 * resolves to the Secretary default). Service-role.
 *
 * @param {string} societyId
 */
export async function clearGrievanceOfficer(societyId) {
  const admin = adminClient();
  const { error } = await admin
    .from("societies")
    .update({ grievance_officer_name: null, grievance_officer_contact: null })
    .eq("id", societyId);
  if (error) throw new Error(`clearGrievanceOfficer: ${error.message}`);
}

/**
 * FK-respecting teardown of Phase 6 test rows for the given societies.
 * Order: moderation_events; reports; attachments(post + flat_action);
 * post_comments; posts; flat_actions. Then clears the grievance columns.
 * Memberships are NOT deleted (shared across phases).
 *
 * @param {string|string[]} societyIds
 */
export async function teardownPhase6(societyIds) {
  const admin = adminClient();
  const ids = Array.isArray(societyIds) ? societyIds : [societyIds];

  await admin.from("moderation_events").delete().in("society_id", ids);
  await admin.from("reports").delete().in("society_id", ids);
  await admin
    .from("attachments")
    .delete()
    .in("society_id", ids)
    .in("owner_kind", ["post", "flat_action"]);
  await admin.from("post_comments").delete().in("society_id", ids);
  await admin.from("posts").delete().in("society_id", ids);
  await admin.from("flat_actions").delete().in("society_id", ids);

  await admin
    .from("societies")
    .update({ grievance_officer_name: null, grievance_officer_contact: null })
    .in("id", ids);
}
