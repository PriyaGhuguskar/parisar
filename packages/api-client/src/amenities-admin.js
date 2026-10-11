// Secretary amenity management — add/edit an amenity and its status
// (working / closed-until-date). Reads use the existing listAmenities/tenant RLS.

export async function upsertAmenity(
  supabase,
  { societyId, id = null, name, status, closedUntil = null },
) {
  const { data, error } = await supabase.rpc("secretary_upsert_amenity", {
    p_society_id: societyId,
    p_id: id,
    p_name: name,
    p_status: status || "working",
    p_closed_until: status === "closed" ? closedUntil : null,
  });
  if (error) {
    const m = error.message ?? "";
    if (m.includes("INVALID_NAME")) return { error: "INVALID_NAME" };
    if (m.includes("NOT_SECRETARY")) return { error: "NOT_SECRETARY" };
    throw error;
  }
  return { ok: true, amenity: data };
}

export async function deleteAmenity(supabase, id) {
  const { error } = await supabase.rpc("secretary_delete_amenity", { p_id: id });
  if (error) {
    if ((error.message ?? "").includes("NOT_SECRETARY")) return { error: "NOT_SECRETARY" };
    throw error;
  }
  return { ok: true };
}
