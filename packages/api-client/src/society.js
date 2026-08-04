// Shared society helpers used by BOTH the web and mobile Phase 3 flows.
// Centralised so all Phase 3 UI plans import from one place with zero inline redefinitions.

// Society codes use a 31-character charset excluding ambiguous characters: 0, O, I, 1, L.
export const SOCIETY_CODE_CHARSET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

// Canonical pattern: 4 chars + hyphen + 4 chars, no ambiguous chars (0, O, I, 1, L excluded).
// Charset breakdown: A-H, J-K, M-N, P-Z, 2-9  (excludes I=9th letter, L=12th, O=15th; digits exclude 0 and 1)
export const SOCIETY_CODE_RE = /^[A-HJ-KM-NP-Z2-9]{4}-[A-HJ-KM-NP-Z2-9]{4}$/;

/**
 * Normalize a raw user-typed Society Code to canonical XXXX-XXXX form.
 * - Strips spaces and hyphens, uppercases, then re-inserts hyphen at position 4.
 * - Returns '' for blank/null input.
 */
export function formatSocietyCode(raw) {
  if (raw == null) return "";
  const stripped = String(raw).replace(/[\s-]/g, "").toUpperCase();
  if (stripped.length === 0) return "";
  if (stripped.length <= 4) return stripped;
  // Do NOT truncate inputs longer than 8 chars — return them as-is so isValidSocietyCode
  // will correctly reject them (the regex requires exactly 4+hyphen+4 = 9 chars total).
  if (stripped.length > 8) return `${stripped.slice(0, 4)}-${stripped.slice(4)}`;
  return `${stripped.slice(0, 4)}-${stripped.slice(4, 8)}`;
}

/**
 * True iff formatSocietyCode(raw) produces a string that matches SOCIETY_CODE_RE.
 * Rejects ambiguous characters (O, 0, I, 1, L), wrong lengths, non-alphanumerics.
 */
export function isValidSocietyCode(raw) {
  return SOCIETY_CODE_RE.test(formatSocietyCode(raw));
}

// Internal mapping from server-side RPC error codes to i18n key paths.
const RPC_ERROR_TO_I18N = {
  INVALID_CODE: "join.codeNotFound",
  CODE_PAUSED: "join.codePaused",
  CODE_PAUSED_RATE_LIMIT: "join.rateLimited",
  FLAT_NOT_IN_SOCIETY: "join.codeNotFound",
};

/**
 * Map an RPC result that may contain an `.error` string to the i18n key the UI
 * should display. Returns null when the result has no error.
 *
 * Usage: const i18nKey = mapSocietyCodeError(rpcResult);
 */
export function mapSocietyCodeError(rpcResult) {
  if (!rpcResult || !rpcResult.error) return null;
  return RPC_ERROR_TO_I18N[rpcResult.error] ?? "auth.networkError";
}

/**
 * Strip a +91 country-code prefix from a raw co-secretary phone string and return
 * a bare 10-digit number. Used by createSociety before calling the RPC.
 *
 * - "+919876543210" → "9876543210"
 * - "9876543210"   → "9876543210"
 * - "98765 43210"  → "9876543210"  (spaces stripped)
 */
export function normalizePhoneForCoSec(raw) {
  if (raw == null) return "";
  const digits = String(raw).replace(/\D/g, "");
  // +91 prefix adds 2 digits to a 10-digit number → 12 digits total
  return digits.startsWith("91") && digits.length === 12 ? digits.slice(2) : digits;
}

// ---------------------------------------------------------------------------
// RPC Wrappers
// ---------------------------------------------------------------------------
// Every wrapper accepts a Supabase client as its first argument.
// Wrappers that mutate the caller's membership/role call refreshSession()
// before returning so the JWT carries the updated claims.
//
// Helpers that do NOT call refreshSession: createSociety, bootstrapSocietyStructure,
// listSocietyStructure, rotateSocietyCode, resumeSocietyCode, revealPhone, removeMember.
// Helpers that DO call refreshSession: finalizeSocietySetup, joinBySocietyCode,
// transferSecretaryRole.
// ---------------------------------------------------------------------------

/**
 * Create a new society and generate its first Society Code.
 * Calls: create_society_with_secretary(p_name, p_address, p_co_secretary_phone)
 * Returns: { societyId, code, coSecretaryFound }
 * Does NOT call refreshSession — the Secretary's membership doesn't exist yet
 * (flat_id NOT NULL prevents it; membership is created at finalizeSocietySetup).
 */
export async function createSociety(supabase, { name, address, coSecretaryPhone }) {
  const { data, error } = await supabase.rpc("create_society_with_secretary", {
    p_name: name,
    p_address: address,
    p_co_secretary_phone: normalizePhoneForCoSec(coSecretaryPhone),
  });
  if (error) throw error;
  return {
    societyId: data.society_id,
    code: data.code,
    coSecretaryFound: data.co_secretary_found,
  };
}

/**
 * Finalize the Secretary's membership by selecting their flat (wizard Step 3).
 * Calls: finalize_society_setup(p_society_id, p_flat_id)
 * Returns: { membershipId }
 * Calls refreshSession() — JWT must carry society_id + role='secretary' after this.
 * If refreshSession fails, logs a warning and still returns the membershipId (don't throw).
 */
export async function finalizeSocietySetup(supabase, { societyId, flatId }) {
  const { data, error } = await supabase.rpc("finalize_society_setup", {
    p_society_id: societyId,
    p_flat_id: flatId,
  });
  if (error) throw error;
  const { error: refreshError } = await supabase.auth.refreshSession();
  if (refreshError) {
    console.warn("[society] refreshSession failed after finalize:", refreshError.message);
  }
  return { membershipId: data.membership_id };
}

/**
 * Batch-insert wings and flats before the Secretary's membership exists (wizard Step 3).
 * Consumed by Plans 03-04 and 03-05 (wizard Step 3) — do NOT redefine inline.
 * Calls: bootstrap_society_structure(p_society_id, p_wings, p_flats)
 *
 * wings: Array<{ name: string }>
 * flats: Array<{ wing_name: string, number: string }>
 *
 * Returns: { wings: [{name, id}], flats: [{id, wing_name, number}] }
 * Throws on RPC errors (NOT_SOCIETY_CREATOR, WING_NOT_FOUND, etc.).
 * Does NOT call refreshSession (no membership change).
 */
export async function bootstrapSocietyStructure(supabase, { societyId, wings, flats }) {
  const { data, error } = await supabase.rpc("bootstrap_society_structure", {
    p_society_id: societyId,
    p_wings: wings,
    p_flats: flats,
  });
  if (error) throw error;
  return data; // { wings: [{name, id}], flats: [{id, wing_name, number}] }
}

/**
 * Add a single wing (and optional flats) to an already-live society.
 * Secretary / co-secretary only — enforced server-side by secretary_add_wing.
 * Calls: secretary_add_wing(p_society_id, p_wing_name, p_flat_numbers)
 *
 * flatNumbers: string[] (trimmed + de-duped server-side; may be empty)
 *
 * Returns: { ok: true, wingId, name, flatCount }
 *       OR { error: 'WING_EXISTS'|'INVALID_WING_NAME'|'NOT_SECRETARY' } for the
 *          known validation failures (does NOT throw — the UI renders the message).
 * Throws only on unexpected RPC (network/server) errors.
 * Does NOT call refreshSession (no membership/claim change).
 */
export async function addWing(supabase, { societyId, wingName, flatNumbers = [] }) {
  const { data, error } = await supabase.rpc("secretary_add_wing", {
    p_society_id: societyId,
    p_wing_name: wingName,
    p_flat_numbers: flatNumbers,
  });
  if (error) {
    const code = error.message ?? "";
    if (code.includes("WING_EXISTS")) return { error: "WING_EXISTS" };
    if (code.includes("INVALID_WING_NAME")) return { error: "INVALID_WING_NAME" };
    if (code.includes("NOT_SECRETARY")) return { error: "NOT_SECRETARY" };
    throw error;
  }
  return { ok: true, wingId: data.wing_id, name: data.name, flatCount: data.flat_count };
}

/**
 * Return the wings and flats for a society identified by its code (pre-membership lookup).
 * Consumed by Plan 03-06 (Member profile form) — do NOT redefine inline.
 * Calls: list_society_structure(p_code)
 *
 * Formats the code via formatSocietyCode before calling the RPC.
 *
 * Returns: { society_id, wings: [{id, name}], flats: [{id, wing_id, number}] }
 *       OR { error: 'INVALID_CODE'|'CODE_PAUSED' } (does NOT throw — UI needs to render the message).
 * Throws only on unexpected RPC (network/server) errors.
 * Does NOT call refreshSession (read-only).
 */
export async function listSocietyStructure(supabase, rawCode) {
  const formatted = formatSocietyCode(rawCode);
  const { data, error } = await supabase.rpc("list_society_structure", { p_code: formatted });
  if (error) throw error;
  return data; // may be { error: 'INVALID_CODE'|'CODE_PAUSED' } or { society_id, wings, flats }
}

/**
 * Validate a Society Code before showing the join preview to the member.
 * Calls: validate_society_code(p_code)
 * Returns: { society_id, name, address, member_count } OR { error: 'INVALID_CODE' } if
 *          formatSocietyCode produces an invalid string before the RPC is called.
 */
export async function validateSocietyCode(supabase, rawCode) {
  const formatted = formatSocietyCode(rawCode);
  if (!isValidSocietyCode(formatted)) return { error: "INVALID_CODE" };
  const { data, error } = await supabase.rpc("validate_society_code", { p_code: formatted });
  if (error) throw error;
  return data;
}

/**
 * Redeem a Society Code and create the member's membership row.
 * Calls: redeem_society_code(p_code, p_flat_id, p_residency, p_household, p_emergency)
 *
 * If the RPC payload contains an `.error` field → return { error: payload.error }
 * (caller maps via mapSocietyCodeError). Does NOT call refreshSession in this case.
 *
 * On success → calls refreshSession (JWT must carry society_id + role).
 * Returns: { membershipId, societyId, status, duplicate, role, autoElevatedToCoSecretary }
 *
 * The `autoElevatedToCoSecretary` flag is propagated from the server-side co-secretary
 * auto-elevation logic so the UI can route co-sec joiners to the Secretary dashboard.
 */
export async function joinBySocietyCode(
  supabase,
  { code, flatId, residency, household, emergencyContact },
) {
  const formatted = formatSocietyCode(code);
  const { data, error } = await supabase.rpc("redeem_society_code", {
    p_code: formatted,
    p_flat_id: flatId,
    p_residency: residency,
    p_household: household,
    p_emergency: emergencyContact || null,
  });
  if (error) throw error;
  if (data && data.error) return { error: data.error };
  const { error: refreshError } = await supabase.auth.refreshSession();
  if (refreshError) {
    console.warn("[society] refreshSession failed after join:", refreshError.message);
  }
  return {
    membershipId: data.membership_id,
    societyId: data.society_id,
    status: data.status,
    duplicate: data.duplicate,
    role: data.role,
    autoElevatedToCoSecretary: data.auto_elevated_to_co_secretary === true,
  };
}

/**
 * Rotate the society code (old code stops working immediately).
 * Calls: rotate_society_code(p_society_id)
 * Returns: { code } (the new code string).
 * Does NOT call refreshSession (no membership change for the caller).
 */
export async function rotateSocietyCode(supabase, { societyId }) {
  const { data, error } = await supabase.rpc("rotate_society_code", { p_society_id: societyId });
  if (error) throw error;
  return { code: data.code };
}

/**
 * Resume a paused society code (clears paused_at).
 * Calls: resume_society_code(p_society_id)
 * Returns: { resumed: true }
 * Does NOT call refreshSession.
 */
export async function resumeSocietyCode(supabase, { societyId }) {
  const { data, error } = await supabase.rpc("resume_society_code", { p_society_id: societyId });
  if (error) throw error;
  return { resumed: data.resumed };
}

/**
 * Reveal a member's phone number. Creates an audit_log entry.
 * Calls: reveal_phone(p_target_user_id)
 * Returns: the phone string.
 * Throws on RPC error (NOT_FOUND_OR_CROSS_TENANT, etc.).
 * Does NOT call refreshSession.
 */
export async function revealPhone(supabase, targetUserId) {
  const { data, error } = await supabase.rpc("reveal_phone", { p_target_user_id: targetUserId });
  if (error) throw error;
  return data;
}

/**
 * Remove a member from the society (DPDP-compliant erasure on last membership).
 * Calls: remove_member(p_membership_id)
 * Returns: void.
 * Throws on RPC error.
 * Does NOT call refreshSession (caller's membership is unchanged).
 */
export async function removeMember(supabase, membershipId) {
  const { error } = await supabase.rpc("remove_member", { p_membership_id: membershipId });
  if (error) throw error;
}

/**
 * Transfer the Secretary role to another eligible member (co_secretary or board_member).
 * Calls: transfer_secretary_role(p_new_secretary_user_id)
 * Returns: void.
 * Calls refreshSession() — the caller is demoted to member after this call.
 */
export async function transferSecretaryRole(supabase, newSecretaryUserId) {
  const { error } = await supabase.rpc("transfer_secretary_role", {
    p_new_secretary_user_id: newSecretaryUserId,
  });
  if (error) throw error;
  const { error: refreshError } = await supabase.auth.refreshSession();
  if (refreshError) {
    console.warn("[society] refreshSession failed after role transfer:", refreshError.message);
  }
}

// ---------------------------------------------------------------------------
// Aggregate Queries (direct table reads — no RPC)
// ---------------------------------------------------------------------------

/**
 * Return the percentage (0–100) of society flats with active memberships.
 * Runs two parallel COUNT queries (flats + active memberships).
 * Returns an integer.
 */
export async function fetchJoinPercent(supabase, societyId) {
  const [flatsRes, memRes] = await Promise.all([
    supabase.from("flats").select("id", { count: "exact", head: true }).eq("society_id", societyId),
    supabase
      .from("society_memberships")
      .select("flat_id", { count: "exact", head: true })
      .eq("society_id", societyId)
      .eq("status", "active"),
  ]);
  const total = flatsRes.count ?? 0;
  const joined = memRes.count ?? 0;
  return total === 0 ? 0 : Math.round((joined / total) * 100);
}

/**
 * Return memberships with status='pending_review' (duplicate flat conflicts).
 * Joins profiles + flats + wings for display in the Secretary review queue.
 */
export async function fetchPendingReviews(supabase, societyId) {
  const { data, error } = await supabase
    .from("society_memberships")
    .select(`
      id, user_id, flat_id, joined_at, status,
      profiles:user_id (full_name),
      flats:flat_id (number, wings:wing_id (name))
    `)
    .eq("society_id", societyId)
    .eq("status", "pending_review")
    .order("joined_at", { ascending: true });
  if (error) throw error;
  return data ?? [];
}

/**
 * Return the N most recently joined active members (default 5).
 * Joins profiles + flats + wings for the Secretary dashboard recent-joiners card.
 */
export async function fetchRecentJoiners(supabase, societyId, limit = 5) {
  const { data, error } = await supabase
    .from("society_memberships")
    .select(`
      id, user_id, flat_id, joined_at,
      profiles:user_id (full_name),
      flats:flat_id (number, wings:wing_id (name))
    `)
    .eq("society_id", societyId)
    .eq("status", "active")
    .order("joined_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data ?? [];
}

/**
 * Return audit_log rows for a society, optionally filtered by action and time window.
 * RLS restricts this to secretary/co_secretary of the same society.
 *
 * options.action    — exact action string to filter on (e.g., 'member.removed')
 * options.sinceDays — look-back window in days (default 7)
 */
export async function fetchAuditLog(supabase, societyId, { action, sinceDays = 7 } = {}) {
  let q = supabase
    .from("audit_log")
    .select("*")
    .eq("society_id", societyId)
    .order("created_at", { ascending: false });
  if (action) q = q.eq("action", action);
  if (sinceDays) {
    const since = new Date(Date.now() - sinceDays * 24 * 60 * 60 * 1000).toISOString();
    q = q.gte("created_at", since);
  }
  const { data, error } = await q;
  if (error) throw error;
  return data ?? [];
}
