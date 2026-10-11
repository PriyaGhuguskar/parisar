// Membership / profile / setup wrappers for the SECURITY DEFINER RPCs added by
// migration 054 (tenant lockdown). Direct INSERT/UPDATE/DELETE on societies,
// society_memberships, family_members, amenities, flats, wings and profiles
// (except profiles.full_name) is revoked for clients — these RPCs are the only
// write path.
//
// Error contract (this module): every function THROWS the raw supabase error when
// the RPC raises (error.message contains the SQL exception code, e.g.
// MEMBERSHIP_NOT_FOUND, INSUFFICIENT_PRIVILEGES). Use rpcErrorCode() to extract a
// known code for UI mapping. onboardResident additionally RETURNS `{ error }` for
// the inline jsonb outcomes the RPC reports without raising.
//
// Functions that change the caller's JWT claims (setActiveSociety,
// onboardResident) refresh the session and report `refreshed: boolean`.

import { formatSocietyCode, refreshSessionAfterClaimsChange } from "./society.js";

// Exception codes raised by the 054 RPCs (first match wins; no code is a substring
// of another listed before it).
export const MEMBERSHIP_RPC_ERROR_CODES = Object.freeze([
  "AUTH_REQUIRED",
  "MEMBERSHIP_NOT_FOUND",
  "INSUFFICIENT_PRIVILEGES",
  "NOT_PENDING",
  "ONLY_SECRETARY_CAN_SET_ROLE",
  "CANNOT_CHANGE_OWN_ROLE",
  "FLAT_NOT_IN_SOCIETY",
  "INVALID_PHONE",
  "NOT_SECRETARY",
  "INVALID_AMENITIES",
  "TOO_MANY_AMENITIES",
  "INVALID_MEMBERS",
  "TOO_MANY_MEMBERS",
  "INVALID_NAME",
  "INVALID_SIGNUP_INTENT",
  "NO_PHONE",
  "PHONE_IN_USE",
  "INVALID_CONTACT",
  "NOT_A_MEMBER",
  "NO_PROFILE",
  "TOO_MANY_CODE_ATTEMPTS",
]);

/**
 * Extract a known 054 RPC exception code from an error.
 *
 * @param {unknown} error
 * @returns {string|null}
 */
export function rpcErrorCode(error) {
  const msg = String(error?.message ?? "");
  return MEMBERSHIP_RPC_ERROR_CODES.find((code) => msg.includes(code)) ?? null;
}

async function callRpc(supabase, name, params) {
  const { data, error } = await supabase.rpc(name, params);
  if (error) throw error;
  return data;
}

function mapActiveSociety(data) {
  return {
    societyId: data?.society_id ?? null,
    role: data?.role ?? null,
    societyName: data?.society_name ?? null,
    serviceStatus: data?.service_status ?? null,
    tokenStale: data?.token_stale === true,
  };
}

// ---------------------------------------------------------------------------
// Active society (single source of truth for society + role)
// ---------------------------------------------------------------------------

/**
 * Read the caller's active society + LIVE role.
 * Calls: my_active_society() — same rule as the Auth Hook (switcher choice, else
 * newest active membership). Use instead of memberships[0] / app_metadata.role.
 *
 * When `tokenStale` is true the JWT claims lag behind; pass `{ refreshIfStale: true }`
 * to refresh the session automatically.
 *
 * @param {object} supabase
 * @param {{ refreshIfStale?: boolean }} [opts]
 * @returns {Promise<{ societyId: string|null, role: string|null, societyName: string|null,
 *                     serviceStatus: string|null, tokenStale: boolean, refreshed?: boolean }>}
 *   all-null fields when the caller has no active membership.
 */
export async function getMyActiveSociety(supabase, { refreshIfStale = false } = {}) {
  const active = mapActiveSociety(await callRpc(supabase, "my_active_society", {}));
  if (refreshIfStale && active.tokenStale) {
    return { ...active, refreshed: await refreshSessionAfterClaimsChange(supabase) };
  }
  return active;
}

/**
 * Switch the caller's active society, then refresh the session (the RPC requires
 * it — `refresh_required: true`).
 * Calls: set_active_society(p_society_id). Errors: AUTH_REQUIRED, NOT_A_MEMBER, NO_PROFILE.
 *
 * @param {object} supabase
 * @param {string} societyId
 * @returns {Promise<{ societyId, role, societyName, serviceStatus, tokenStale, refreshed: boolean }>}
 */
export async function setActiveSociety(supabase, societyId) {
  const active = mapActiveSociety(
    await callRpc(supabase, "set_active_society", { p_society_id: societyId }),
  );
  return { ...active, refreshed: await refreshSessionAfterClaimsChange(supabase) };
}

// ---------------------------------------------------------------------------
// Self-service profile
// ---------------------------------------------------------------------------

/**
 * Create/update the caller's profile. Phone is always taken from auth.users.
 * Calls: upsert_my_profile(p_full_name, p_signup_intent)
 * Errors: AUTH_REQUIRED, INVALID_NAME (2–80 chars), INVALID_SIGNUP_INTENT, NO_PHONE, PHONE_IN_USE.
 *
 * @param {object} supabase
 * @param {{ fullName: string, signupIntent?: 'secretary'|'member'|null }} opts
 * @returns {Promise<{ userId: string, fullName: string }>}
 */
export async function upsertMyProfile(supabase, { fullName, signupIntent = null }) {
  const data = await callRpc(supabase, "upsert_my_profile", {
    p_full_name: fullName,
    p_signup_intent: signupIntent,
  });
  return { userId: data?.user_id ?? null, fullName: data?.full_name ?? null };
}

/**
 * Set or clear the emergency contact on the caller's own membership.
 * Calls: update_my_emergency_contact(p_membership_id, p_emergency_contact)
 * Errors: AUTH_REQUIRED, INVALID_CONTACT (≤40 chars; digits ( ) - space), MEMBERSHIP_NOT_FOUND.
 *
 * @param {object} supabase
 * @param {{ membershipId: string, emergencyContact?: string|null }} opts — null/'' clears
 * @returns {Promise<void>}
 */
export async function updateMyEmergencyContact(
  supabase,
  { membershipId, emergencyContact = null },
) {
  await callRpc(supabase, "update_my_emergency_contact", {
    p_membership_id: membershipId,
    p_emergency_contact: emergencyContact || null,
  });
}

/**
 * Add family members to the caller's own (active or pending_review) membership.
 * Calls: add_family_members(p_membership_id, p_members) — max 10 per call. Invalid,
 * duplicate or own phones are stored as null (the name is kept).
 * Errors: AUTH_REQUIRED, INVALID_MEMBERS, TOO_MANY_MEMBERS, MEMBERSHIP_NOT_FOUND.
 *
 * @param {object} supabase
 * @param {{ membershipId: string,
 *           members: Array<{ name: string, phone?: string|null, relation?: string|null, isResident?: boolean }> }} opts
 * @returns {Promise<{ added: number, skipped: number }>}
 */
export async function addFamilyMembers(supabase, { membershipId, members }) {
  const data = await callRpc(supabase, "add_family_members", {
    p_membership_id: membershipId,
    p_members: toFamilyPayload(members),
  });
  return { added: data?.added ?? 0, skipped: data?.skipped ?? 0 };
}

function toFamilyPayload(members) {
  return (members ?? []).map((m) => ({
    name: m.name ?? m.fullName ?? m.full_name ?? "",
    phone: m.phone || null,
    relation: m.relation || null,
    is_resident: m.isResident ?? m.is_resident ?? true,
  }));
}

// ---------------------------------------------------------------------------
// Resident onboarding (replaces redeem_society_code + family_members.insert)
// ---------------------------------------------------------------------------

/**
 * Join a society by code: membership + name + family in ONE call, then refresh
 * the session so the JWT carries the new society/role.
 * Calls: onboard_resident(p_code, p_flat_id, p_full_name, p_residency, p_alt_phone, p_family)
 *
 * Throws on exceptions: AUTH_REQUIRED, INVALID_NAME, TOO_MANY_CODE_ATTEMPTS.
 * Returns `{ error }` for inline outcomes: INVALID_CODE, CODE_PAUSED, SOCIETY_BLOCKED,
 * FLAT_NOT_IN_SOCIETY, MEMBERSHIP_REMOVED (no refresh in that case).
 *
 * @param {object} supabase
 * @param {{ code: string, flatId: string, fullName: string, residency: string,
 *           altPhone?: string|null, family?: Array }} opts
 * @returns {Promise<{ error: string } | { societyId: string, status: 'active'|'pending_review', refreshed: boolean }>}
 */
export async function onboardResident(
  supabase,
  { code, flatId, fullName, residency, altPhone = null, family = [] },
) {
  const data = await callRpc(supabase, "onboard_resident", {
    p_code: formatSocietyCode(code),
    p_flat_id: flatId,
    p_full_name: fullName,
    p_residency: residency,
    p_alt_phone: altPhone || null,
    p_family: toFamilyPayload(family),
  });
  if (data?.error) return { error: data.error };
  return {
    societyId: data?.society_id ?? null,
    status: data?.status ?? null,
    refreshed: await refreshSessionAfterClaimsChange(supabase),
  };
}

// ---------------------------------------------------------------------------
// Secretary review queue
// ---------------------------------------------------------------------------

/**
 * Approve one pending claimant. Atomic: every other pending claimant on that flat
 * is rejected and their family rows deleted.
 * Calls: approve_pending_membership(p_membership_id)
 * Errors: AUTH_REQUIRED, MEMBERSHIP_NOT_FOUND, INSUFFICIENT_PRIVILEGES, NOT_PENDING.
 *
 * @param {object} supabase
 * @param {string} membershipId
 * @returns {Promise<{ approved: string, rejected: string[] }>}
 */
export async function approvePendingMembership(supabase, membershipId) {
  const data = await callRpc(supabase, "approve_pending_membership", {
    p_membership_id: membershipId,
  });
  return { approved: data?.approved ?? membershipId, rejected: data?.rejected ?? [] };
}

/**
 * Reject one pending claimant (status → rejected; the person may re-apply).
 * Calls: reject_pending_membership(p_membership_id)
 * Errors: as approvePendingMembership.
 *
 * @param {object} supabase
 * @param {string} membershipId
 * @returns {Promise<{ rejected: string }>}
 */
export async function rejectPendingMembership(supabase, membershipId) {
  const data = await callRpc(supabase, "reject_pending_membership", {
    p_membership_id: membershipId,
  });
  return { rejected: data?.rejected ?? membershipId };
}

// ---------------------------------------------------------------------------
// Secretary setup
// ---------------------------------------------------------------------------

/**
 * Add (or promote) a board member by verified phone.
 * Calls: secretary_add_board_member(p_society_id, p_phone, p_flat_id)
 * Errors: AUTH_REQUIRED, ONLY_SECRETARY_CAN_SET_ROLE, INVALID_PHONE,
 *         FLAT_NOT_IN_SOCIETY, CANNOT_CHANGE_OWN_ROLE.
 *
 * `status: 'not_registered'` is a benign skip (no account for that phone yet).
 *
 * @param {object} supabase
 * @param {{ societyId: string, phone: string, flatId: string }} opts
 * @returns {Promise<{ status: 'added'|'promoted'|'already_board'|'not_registered', membershipId: string|null }>}
 */
export async function secretaryAddBoardMember(supabase, { societyId, phone, flatId }) {
  const data = await callRpc(supabase, "secretary_add_board_member", {
    p_society_id: societyId,
    p_phone: phone,
    p_flat_id: flatId,
  });
  return { status: data?.status ?? null, membershipId: data?.membership_id ?? null };
}

/**
 * Insert the setup-wizard amenities. Idempotent on (society, lower(name)); max 50.
 * Calls: secretary_add_setup_amenities(p_society_id, p_amenities)
 * Errors: AUTH_REQUIRED, NOT_SECRETARY, INVALID_AMENITIES, TOO_MANY_AMENITIES.
 *
 * @param {object} supabase
 * @param {{ societyId: string, amenities: Array<{ name: string, isCustom?: boolean }> }} opts
 * @returns {Promise<{ inserted: number, skipped: number }>}
 */
export async function secretaryAddSetupAmenities(supabase, { societyId, amenities }) {
  const data = await callRpc(supabase, "secretary_add_setup_amenities", {
    p_society_id: societyId,
    p_amenities: (amenities ?? []).map((a) => ({
      name: a.name,
      is_custom: a.isCustom ?? a.is_custom ?? false,
    })),
  });
  return { inserted: data?.inserted ?? 0, skipped: data?.skipped ?? 0 };
}
