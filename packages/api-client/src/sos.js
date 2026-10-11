// Emergency SOS — a resident raises an alert to a chosen audience. Reads are a
// plain RLS-scoped select (RLS enforces who sees which audience).

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
    throw error;
  }
  return { ok: true, id: data.id };
}

export async function resolveSos(supabase, id) {
  const { error } = await supabase.rpc("resolve_sos", { p_id: id });
  if (error) {
    if ((error.message ?? "").includes("NOT_ALLOWED")) return { error: "NOT_ALLOWED" };
    throw error;
  }
  return { ok: true };
}
