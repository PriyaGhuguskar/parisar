// Society Authorities — the people who manage a society (replaces the single
// "chairman"). Staff enter them at creation; any onboarded authority can add
// more. All authorities currently get the same (top) society-management role.
// Reads are RLS-scoped: only the society's authorities (and platform staff)
// can see the list.

const ADD_ERRORS = ["INVALID_NAME", "INVALID_PHONE", "ALREADY_AUTHORITY", "NOT_AUTHORITY"];

/** 10 digits, starting 6-9 (Indian mobile), after stripping +91 / spaces. */
export function normalizeAuthorityPhone(raw) {
  const digits = String(raw ?? "").replace(/\D/g, "");
  return digits.slice(-10);
}

export function isValidAuthorityPhone(raw) {
  return /^[6-9]\d{9}$/.test(normalizeAuthorityPhone(raw));
}

/** The society's authorities, oldest first. */
export async function listSocietyAuthorities(supabase, societyId) {
  const { data, error } = await supabase
    .from("society_authorities")
    .select("id, full_name, phone, user_id, claimed_at, created_at")
    .eq("society_id", societyId)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return data ?? [];
}

/**
 * An authority adds another authority. If that phone already belongs to an
 * active resident of the society, their membership gets authority powers now
 * (`linked: true`); otherwise on their first sign-in.
 * @returns {Promise<{ok:true, id:string, linked:boolean} | {error:string}>}
 */
export async function addSocietyAuthority(supabase, { societyId, name, phone }) {
  const { data, error } = await supabase.rpc("add_society_authority", {
    p_society_id: societyId,
    p_name: String(name ?? "").trim(),
    p_phone: normalizeAuthorityPhone(phone),
  });
  if (error) {
    const hit = ADD_ERRORS.find((code) => (error.message ?? "").includes(code));
    if (hit) return { error: hit };
    throw error;
  }
  return { ok: true, id: data?.id ?? null, linked: Boolean(data?.linked) };
}
