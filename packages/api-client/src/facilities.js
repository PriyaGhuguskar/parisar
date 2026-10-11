// Facility calendar — society-ops schedule. Secretary/co-sec schedule events;
// residents read (RLS). The next upcoming event surfaces on home highlights.

/** Schedule a facility event (secretary/co-sec only). Notifies residents. */
export async function addFacilityEvent(supabase, { societyId, category, title, note, startsAt }) {
  const { data, error } = await supabase.rpc("add_facility_event", {
    p_society_id: societyId,
    p_category: category,
    p_title: title,
    p_note: note || null,
    p_starts_at: startsAt,
  });
  if (error) {
    const m = error.message ?? "";
    if (m.includes("INVALID_TITLE")) return { error: "INVALID_TITLE" };
    if (m.includes("INVALID_TIME")) return { error: "INVALID_TIME" };
    if (m.includes("NOT_SECRETARY")) return { error: "NOT_SECRETARY" };
    throw error;
  }
  return { ok: true, id: data.id };
}

/** Remove a facility event (secretary/co-sec only). */
export async function deleteFacilityEvent(supabase, id) {
  const { error } = await supabase.rpc("delete_facility_event", { p_id: id });
  if (error) {
    if ((error.message ?? "").includes("NOT_ALLOWED")) return { error: "NOT_ALLOWED" };
    throw error;
  }
  return { ok: true };
}
