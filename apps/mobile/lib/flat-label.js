// apps/mobile/lib/flat-label.js
// Resolve "{wing}-{number}" flat label for a user when JWT app_metadata
// does not carry flat_label directly (it doesn't — see 04.1-00-JWT-SHAPE.md).
// Falls back to "—" when no membership or query failure.
//
// Cheap, single-row query; cached by call-site (useEffect + useState, or
// React Query if Wave 3 introduces it).
// JavaScript only — no TypeScript per CLAUDE.md.

/**
 * @param {object} supabase - authenticated supabase-js client
 * @param {string} userId
 * @param {string} societyId
 * @returns {Promise<string>} formatted flat label, e.g. "B-203", or "—" if not resolved
 */
export async function fetchFlatLabel(supabase, userId, societyId) {
  if (!userId || !societyId) return "—";
  try {
    const { data, error } = await supabase
      .from("society_memberships")
      .select("flats:flat_id(number, wings:wing_id(name))")
      .eq("user_id", userId)
      .eq("society_id", societyId)
      .eq("status", "active")
      .maybeSingle();
    if (error || !data) return "—";
    const wing = data.flats?.wings?.name ?? "";
    const number = data.flats?.number ?? "";
    if (!wing && !number) return "—";
    return [wing, number].filter(Boolean).join("-");
  } catch {
    return "—";
  }
}
