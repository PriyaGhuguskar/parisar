// Guest / visitor management wrappers, shared by web (and later mobile).
// Every wrapper takes a Supabase client as its first argument. Writes go through
// SECURITY DEFINER RPCs that re-check the caller server-side.

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
 * Returns { requestId, status } or { error } for known validation codes.
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
    throw error;
  }
  return { requestId: data.request_id, status: data.status };
}

/**
 * Resident approves or denies a pending request for their flat.
 * Calls: resident_decide_visit(p_request_id, p_approve)
 * Returns { status } or { error } for known codes.
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
    throw error;
  }
  return { status: data.status };
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
