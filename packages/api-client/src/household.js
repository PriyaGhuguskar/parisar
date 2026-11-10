// Family invites and same-flat household access. Nothing here is delivered to anyone:
// the UI shows a copyable link and says so. See docs/onboarding/API.md.
import { callOnboardingRpc } from "./onboarding-rpc.js";

/** Returns the token once. It cannot be read back later. */
export function familyInviteCreate(supabase, { societyId, fullName, relationship, phone }) {
  return callOnboardingRpc(supabase, "family_invite_create", {
    p_society_id: societyId,
    p_full_name: fullName,
    p_relationship: relationship,
    p_phone: phone ?? null,
  });
}

export function familyInviteList(supabase, societyId) {
  return callOnboardingRpc(supabase, "family_invite_list", { p_society_id: societyId });
}

export function familyInviteRevoke(supabase, inviteId) {
  return callOnboardingRpc(supabase, "family_invite_revoke", { p_invite_id: inviteId });
}

export function familyInvitePreview(supabase, token) {
  return callOnboardingRpc(supabase, "family_invite_preview", { p_token: token });
}

export function familyInviteAccept(supabase, token) {
  return callOnboardingRpc(supabase, "family_invite_accept", { p_token: token });
}

/** Masked names and a count, at most. Never a phone. */
export function householdLookup(supabase, { code, wing, floor, flat }) {
  return callOnboardingRpc(supabase, "household_lookup", {
    p_code: code,
    p_wing: wing,
    p_floor: floor ?? null,
    p_flat: flat,
  });
}

export function householdRequestAccess(
  supabase,
  { code, flatId, fullName, relationship, residentType, message },
) {
  return callOnboardingRpc(supabase, "household_request_access", {
    p_code: code,
    p_flat_id: flatId,
    p_full_name: fullName,
    p_relationship: relationship,
    p_resident_type: residentType ?? "family_member",
    p_message: message ?? null,
  });
}

export function householdMyRequests(supabase) {
  return callOnboardingRpc(supabase, "household_my_requests");
}

export function householdCancelRequest(supabase, requestId) {
  return callOnboardingRpc(supabase, "household_cancel_request", { p_request_id: requestId });
}

export function householdPendingForMe(supabase) {
  return callOnboardingRpc(supabase, "household_pending_for_me");
}

export function householdDecideRequest(supabase, { requestId, approve, reason }) {
  return callOnboardingRpc(supabase, "household_decide_request", {
    p_request_id: requestId,
    p_approve: approve,
    p_reason: reason ?? null,
  });
}
