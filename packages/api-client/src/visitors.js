// Guest / visitor management wrappers, shared by web (and later mobile).
// Every wrapper takes a Supabase client as its first argument. Writes go through
// SECURITY DEFINER RPCs that re-check the caller server-side.
//
// Error contract: known validation / business codes are RETURNED as
// `{ error: CODE }` (listed per function) so the UI can render localized copy;
// any other RPC failure (network, auth, unexpected SQL error) is THROWN.
//
// visitor_requests.status may be 'expired' since 055 (a pending request older than
// 30 min) — treat it as closed, like 'approved' / 'denied'.

/**
 * Wings + flats for the calling guard's own society, so they can pick a flat.
 * Calls: guard_list_flats() → [{ id, name, flats: [{id, number}] }]
 */
export async function guardListFlats(supabase) {
  const { data, error } = await supabase.rpc("guard_list_flats");
  if (error) throw error;
  return Array.isArray(data) ? data : [];
}

/**
 * Guard raises a gate request for a flat.
 * Calls: guard_create_visit(p_flat_id, p_visitor_name, p_visitor_phone, p_purpose)
 * Returns { requestId, status } or { error: 'INVALID_VISITOR'|'FLAT_NOT_IN_SOCIETY'|
 * 'NOT_GUARD'|'VISIT_RATE_LIMITED' } (055: 30 per 10 min per guard; NOT_GUARD also
 * when the guard row is no longer active).
 */
export async function guardCreateVisit(supabase, { flatId, visitorName, visitorPhone, purpose }) {
  const { data, error } = await supabase.rpc("guard_create_visit", {
    p_flat_id: flatId,
    p_visitor_name: visitorName,
    p_visitor_phone: visitorPhone || null,
    p_purpose: purpose || null,
  });
  if (error) {
    const m = error.message ?? "";
    if (m.includes("INVALID_VISITOR")) return { error: "INVALID_VISITOR" };
    if (m.includes("FLAT_NOT_IN_SOCIETY")) return { error: "FLAT_NOT_IN_SOCIETY" };
    if (m.includes("NOT_GUARD")) return { error: "NOT_GUARD" };
    if (m.includes("VISIT_RATE_LIMITED")) return { error: "VISIT_RATE_LIMITED" };
    throw error;
  }
  return { requestId: data.request_id, status: data.status };
}

/**
 * Resident approves or denies a pending request for their flat.
 * Calls: resident_decide_visit(p_request_id, p_approve)
 * Returns { status } or { error: 'ALREADY_DECIDED'|'NOT_YOUR_FLAT'|'VISIT_EXPIRED'|
 * 'INVALID_DECISION' } (055: VISIT_EXPIRED after 30 min pending; ALREADY_DECIDED
 * also when another resident won the race).
 */
export async function residentDecideVisit(supabase, { requestId, approve }) {
  const { data, error } = await supabase.rpc("resident_decide_visit", {
    p_request_id: requestId,
    p_approve: approve,
  });
  if (error) {
    const m = error.message ?? "";
    if (m.includes("ALREADY_DECIDED")) return { error: "ALREADY_DECIDED" };
    if (m.includes("NOT_YOUR_FLAT")) return { error: "NOT_YOUR_FLAT" };
    if (m.includes("VISIT_EXPIRED")) return { error: "VISIT_EXPIRED" };
    if (m.includes("INVALID_DECISION")) return { error: "INVALID_DECISION" };
    throw error;
  }
  return { status: data.status };
}

/**
 * Link the signed-in phone to its gate-guard row.
 * Calls: claim_guard(p_society_id) — p_society_id is optional (055); pass it when
 * the phone guards several societies (`otherSocieties > 0`) to pick one.
 * Returns { societyId, guardId, otherSocieties } or { error: 'NOT_A_GUARD'|'NO_PHONE' }.
 */
export async function claimGuard(supabase, { societyId = null } = {}) {
  const { data, error } = await supabase.rpc(
    "claim_guard",
    societyId ? { p_society_id: societyId } : {},
  );
  if (error) {
    const m = error.message ?? "";
    if (m.includes("NOT_A_GUARD")) return { error: "NOT_A_GUARD" };
    if (m.includes("NO_PHONE")) return { error: "NO_PHONE" };
    throw error;
  }
  return {
    societyId: data?.society_id ?? null,
    guardId: data?.guard_id ?? null,
    otherSocieties: data?.other_societies ?? 0,
  };
}

/**
 * Secretary registers a gate guard by name + phone (auth user created on the
 * guard's first OTP login).
 * Calls: secretary_add_guard(p_society_id, p_name, p_phone)
 * Returns { ok, guardId, name } or { error } for known codes.
 */
export async function addGuard(supabase, { societyId, name, phone }) {
  const { data, error } = await supabase.rpc("secretary_add_guard", {
    p_society_id: societyId,
    p_name: name,
    p_phone: phone,
  });
  if (error) {
    const m = error.message ?? "";
    if (m.includes("GUARD_EXISTS")) return { error: "GUARD_EXISTS" };
    if (m.includes("INVALID_PHONE")) return { error: "INVALID_PHONE" };
    if (m.includes("INVALID_NAME")) return { error: "INVALID_NAME" };
    if (m.includes("NOT_SECRETARY")) return { error: "NOT_SECRETARY" };
    throw error;
  }
  return { ok: true, guardId: data.guard_id, name: data.name };
}
