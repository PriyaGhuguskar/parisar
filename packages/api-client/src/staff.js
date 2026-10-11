// Staff directory — a shared contact list any resident can add to; the adder is
// attributed server-side. Reads are a plain RLS-scoped select in the UI.
//
// Error contract: known validation / business codes are RETURNED as
// `{ error: CODE }` (listed per function) so the UI can render localized copy;
// any other RPC failure (network, auth, unexpected SQL error) is THROWN.

/**
 * Add a staff contact. Any active member may add (enforced server-side).
 * Returns { ok, id } or { error: 'INVALID_NAME'|'NOT_A_MEMBER' }.
 */
export async function addStaff(supabase, { societyId, name, phone, category }) {
  const { data, error } = await supabase.rpc("add_society_staff", {
    p_society_id: societyId,
    p_name: name,
    p_phone: phone || null,
    p_category: category || "other",
  });
  if (error) {
    const m = error.message ?? "";
    if (m.includes("INVALID_NAME")) return { error: "INVALID_NAME" };
    if (m.includes("NOT_A_MEMBER")) return { error: "NOT_A_MEMBER" };
    throw error;
  }
  return { ok: true, id: data.id };
}

/**
 * Remove a staff contact. Allowed for the adder or a secretary/co-sec.
 * Returns { ok } or { error: 'NOT_ALLOWED' }.
 */
export async function deleteStaff(supabase, id) {
  const { error } = await supabase.rpc("delete_society_staff", { p_id: id });
  if (error) {
    if ((error.message ?? "").includes("NOT_ALLOWED")) return { error: "NOT_ALLOWED" };
    throw error;
  }
  return { ok: true };
}
