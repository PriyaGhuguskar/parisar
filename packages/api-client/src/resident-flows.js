// Resident self-onboarding helpers used by the web wizard and the invite accept flow.
// Same contract as the other onboarding wrappers: the RPC's JSON, or { error: CODE };
// anything that is not a code throws. See docs/onboarding/API.md.
import { callOnboardingRpc, onboardingErrorCode } from "./onboarding-rpc.js";

const MISSING_FUNCTION = new Set(["PGRST202", "42883"]);

function isMissingFunction(error) {
  return (
    MISSING_FUNCTION.has(error?.code) || /could not find the function/i.test(error?.message ?? "")
  );
}

/** The older RPC has no floors; give it the same shape so callers need one path. */
function withEmptyFloors(data) {
  if (!data || data.error) return data;
  return {
    ...data,
    wings: (data.wings ?? []).map((w) => ({
      ...w,
      code: w.code ?? null,
      floors: [],
      flats: (w.flats ?? []).map((f) => ({ ...f, floor_id: f.floor_id ?? null })),
    })),
  };
}

/**
 * Wings with floors and flats for a society code (migration 076). Falls back to
 * onboard_flats_for_code where 076 is not applied yet.
 * @returns {Promise<{ society_id, society_name, wings: Array } | { error: string }>}
 */
export async function onboardStructureForCode(supabase, code) {
  const p_code = String(code ?? "")
    .trim()
    .toUpperCase();
  const { data, error } = await supabase.rpc("onboard_structure_for_code", { p_code });
  if (!error) return data;
  if (!isMissingFunction(error)) {
    const errorCode = onboardingErrorCode(error);
    if (errorCode) return { error: errorCode };
    throw error;
  }
  const legacy = await callOnboardingRpc(supabase, "onboard_flats_for_code", { p_code });
  return withEmptyFloors(legacy);
}

/** The existing join RPC. Returns { society_id, status } or { error }. */
export function onboardResident(supabase, { code, flatId, fullName, residency, altPhone, family }) {
  return callOnboardingRpc(supabase, "onboard_resident", {
    p_code: code,
    p_flat_id: flatId,
    p_full_name: fullName,
    p_residency: residency,
    p_alt_phone: altPhone?.trim() ? altPhone.trim() : null,
    p_family: family ?? [],
  });
}

/** The caller's own name. The phone always comes from the OTP-verified account. */
export function upsertMyProfile(supabase, fullName) {
  return callOnboardingRpc(supabase, "upsert_my_profile", {
    p_full_name: String(fullName ?? "").trim(),
    p_signup_intent: null,
  });
}
