// Emergency SOS — a resident raises an alert to a chosen audience. Reads are a
// plain RLS-scoped select (RLS enforces who sees which audience).
//
// Error contract: known validation / business codes are RETURNED as
// `{ error: CODE }` (listed per function) so the UI can render localized copy;
// any other RPC failure (network, auth, unexpected SQL error) is THROWN.

/**
 * Raise an SOS. Returns { ok, id } or { error: 'INVALID_DESC'|'NOT_A_MEMBER'|
 * 'SOS_RATE_LIMITED' } (055: max 3 per 10 min per user).
 */
export async function raiseSos(supabase, { societyId, description, audience }) {
  const { data, error } = await supabase.rpc("raise_sos", {
    p_society_id: societyId,
    p_description: description,
    p_audience: audience || "all",
  });
  if (error) {
    const m = error.message ?? "";
    if (m.includes("INVALID_DESC")) return { error: "INVALID_DESC" };
    if (m.includes("NOT_A_MEMBER")) return { error: "NOT_A_MEMBER" };
    if (m.includes("SOS_RATE_LIMITED")) return { error: "SOS_RATE_LIMITED" };
    throw error;
  }
  return { ok: true, id: data.id };
}

/** Resolve an SOS. Returns { ok } or { error: 'NOT_ALLOWED' }. */
export async function resolveSos(supabase, id) {
  const { error } = await supabase.rpc("resolve_sos", { p_id: id });
  if (error) {
    if ((error.message ?? "").includes("NOT_ALLOWED")) return { error: "NOT_ALLOWED" };
    throw error;
  }
  return { ok: true };
}
