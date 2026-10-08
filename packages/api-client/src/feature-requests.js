// Feature requests — a society's authorities ask Parisar staff to ADD or REMOVE
// a paid feature; staff approve (which switches it) or decline from the admin
// console. Core features are always on and cannot be requested.
//
// Reads are RLS-scoped: platform_features is readable by everyone,
// society_features and feature_requests only for the caller's own society.

const REQUEST_ERRORS = [
  "NOT_AUTHORITY",
  "INVALID_ACTION",
  "UNKNOWN_FEATURE",
  "CORE_FEATURE",
  "ALREADY_ENABLED",
  "NOT_ENABLED",
  "ALREADY_REQUESTED",
];

/**
 * The feature catalogue for a society, with whether each is on, its monthly
 * price for this society, and any pending request.
 * @returns {Promise<Array<{key:string,name:string,description:string|null,isCore:boolean,
 *   enabled:boolean,price:number,pending:null|{id:string,action:"add"|"remove"}}>>}
 */
export async function listSocietyFeatureState(supabase, societyId) {
  const [catalogue, granted, requests] = await Promise.all([
    supabase
      .from("platform_features")
      .select("key, name, description, price_monthly, is_core, sort_order")
      .order("sort_order", { ascending: true }),
    supabase
      .from("society_features")
      .select("feature_key, enabled, price_override")
      .eq("society_id", societyId),
    supabase
      .from("feature_requests")
      .select("id, feature_key, action")
      .eq("society_id", societyId)
      .eq("status", "pending"),
  ]);
  for (const r of [catalogue, granted, requests]) if (r.error) throw r.error;

  const grantByKey = new Map((granted.data ?? []).map((g) => [g.feature_key, g]));
  const pendingByKey = new Map((requests.data ?? []).map((r) => [r.feature_key, r]));

  return (catalogue.data ?? []).map((f) => {
    const grant = grantByKey.get(f.key);
    const pending = pendingByKey.get(f.key);
    return {
      key: f.key,
      name: f.name,
      description: f.description ?? null,
      isCore: Boolean(f.is_core),
      enabled: f.is_core ? true : Boolean(grant?.enabled),
      price: f.is_core ? 0 : (grant?.price_override ?? f.price_monthly ?? 0),
      pending: pending ? { id: pending.id, action: pending.action } : null,
    };
  });
}

/**
 * Ask staff to add or remove a feature.
 * @returns {Promise<{ok:true, id:string} | {error:string}>}
 */
export async function requestFeatureChange(supabase, { societyId, featureKey, action, note }) {
  const { data, error } = await supabase.rpc("request_feature_change", {
    p_society_id: societyId,
    p_feature_key: featureKey,
    p_action: action,
    p_note: note ? String(note).trim() : null,
  });
  if (error) {
    const hit = REQUEST_ERRORS.find((code) => (error.message ?? "").includes(code));
    if (hit) return { error: hit };
    throw error;
  }
  return { ok: true, id: data?.id ?? null };
}
