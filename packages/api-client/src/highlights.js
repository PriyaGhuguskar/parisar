// Home highlights — the secretary's up-to-4 pinned cards. Residents read the
// rows directly (RLS); the secretary saves the whole set through one RPC that
// notifies residents on any add/change.

/**
 * Replace the society's highlights (0..4). Secretary/co-sec only (enforced
 * server-side). Each new or text-changed item notifies residents.
 * Calls: secretary_set_highlights(p_society_id, p_items)
 * items: Array<{ title, body }>
 * Returns { ok, highlights } or { error: 'TOO_MANY'|'NOT_SECRETARY' }.
 */
export async function setHighlights(supabase, { societyId, items }) {
  const { data, error } = await supabase.rpc("secretary_set_highlights", {
    p_society_id: societyId,
    p_items: items,
  });
  if (error) {
    const m = error.message ?? "";
    if (m.includes("TOO_MANY")) return { error: "TOO_MANY" };
    if (m.includes("NOT_SECRETARY")) return { error: "NOT_SECRETARY" };
    throw error;
  }
  return { ok: true, highlights: Array.isArray(data) ? data : [] };
}
