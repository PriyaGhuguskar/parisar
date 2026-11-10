// Society registration, the feature catalogue and navigation gating.
// See docs/onboarding/API.md.
import { callOnboardingRpc } from "./onboarding-rpc.js";

/**
 * Register a society, optionally closing a connect request (requestId), whose numbers
 * are added to authorities.
 * @returns {Promise<{society_id:string,code:string,authority_count:number,request_id:string|null,
 *   features:string[]}|{error:string}>}
 */
export function adminRegisterSociety(supabase, input) {
  return callOnboardingRpc(supabase, "admin_register_society", {
    p_name: input.name,
    p_address_line: input.addressLine,
    p_city: input.city,
    p_state: input.state,
    p_pincode: input.pincode,
    p_landmark: input.landmark ?? null,
    p_authorities: input.authorities ?? [],
    p_request_id: input.requestId ?? null,
    p_registration_number: input.registrationNumber ?? null,
    p_society_type: input.societyType ?? null,
    p_registration_date: input.registrationDate ?? null,
    p_official_email: input.officialEmail ?? null,
    p_official_phone: input.officialPhone ?? null,
    p_country: input.country ?? "India",
    p_features: input.features ?? [],
  });
}

/** Fill in or correct registration fields. A field left out stays as it is. */
export function adminUpdateSocietyRegistration(supabase, input) {
  return callOnboardingRpc(supabase, "admin_update_society_registration", {
    p_society_id: input.societyId,
    p_registration_number: input.registrationNumber ?? null,
    p_society_type: input.societyType ?? null,
    p_registration_date: input.registrationDate ?? null,
    p_official_email: input.officialEmail ?? null,
    p_official_phone: input.officialPhone ?? null,
    p_country: input.country ?? null,
  });
}

export function getSocietyRegistration(supabase, societyId) {
  return callOnboardingRpc(supabase, "get_society_registration", { p_society_id: societyId });
}

/** Every catalogue key with has_module. Keys with no module come back in `unavailable`. */
export function adminFeatureCatalogue(supabase) {
  return callOnboardingRpc(supabase, "admin_feature_catalogue");
}

/** Which real modules this society has on. Use it to hide navigation. */
export function mySocietyFeatures(supabase, societyId) {
  return callOnboardingRpc(supabase, "my_society_features", { p_society_id: societyId });
}
