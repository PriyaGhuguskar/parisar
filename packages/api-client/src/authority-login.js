// Authority login and society titles. Call refreshSession() after a result carrying
// refresh_required, because the JWT only learns about a new membership on refresh.
// See docs/onboarding/API.md.
import { callOnboardingRpc } from "./onboarding-rpc.js";

/** Societies the signed-in, OTP-verified phone is an authority of, with setup_state. */
export function myAuthoritySocieties(supabase) {
  return callOnboardingRpc(supabase, "my_authority_societies");
}

export function claimAuthorityForSociety(supabase, societyId) {
  return callOnboardingRpc(supabase, "claim_authority_for_society", { p_society_id: societyId });
}

/** For an authority who does not live in the society. */
export function authoritySkipPersonalOnboarding(supabase, societyId) {
  return callOnboardingRpc(supabase, "authority_skip_personal_onboarding", {
    p_society_id: societyId,
  });
}

export function setMemberSocietyTitle(supabase, { societyId, targetUserId, title }) {
  return callOnboardingRpc(supabase, "set_member_society_title", {
    p_society_id: societyId,
    p_target_user_id: targetUserId,
    p_title: title,
  });
}

/** Everything waiting for this person after OTP. */
export function myOnboardingState(supabase) {
  return callOnboardingRpc(supabase, "my_onboarding_state");
}
