// "Connect With Us" requests. Submitting is public; everything else is Parisar staff.
// See docs/onboarding/API.md.
import { callOnboardingRpc } from "./onboarding-rpc.js";

/**
 * Submit a request. Callable with no session.
 * @param {{societyName:string, contactName:string, phone:string, email?:string,
 *   authorityNumbers?:Array<{phone:string,name?:string}>, preferredAt?:string, callNow?:boolean,
 *   alternateAt?:string, message?:string}} input
 * @returns {Promise<{request_code:string,status:string,preferred_at:string|null,preferred_slot:string,
 *   alternate_at:string|null,scheduled_at:string|null,call_now:boolean,created_at:string}|{error:string}>}
 */
export function submitConnectRequest(supabase, input) {
  return callOnboardingRpc(supabase, "submit_connect_request", {
    p_society_name: input.societyName,
    p_contact_name: input.contactName,
    p_phone: input.phone,
    p_email: input.email ?? null,
    p_authority_numbers: input.authorityNumbers ?? [],
    p_preferred_at: input.preferredAt ?? null,
    p_call_now: input.callNow ?? false,
    p_alternate_at: input.alternateAt ?? null,
    p_message: input.message ?? null,
  });
}

/** Look up a request. Needs the code and the phone that submitted it. */
export function getConnectRequestStatus(supabase, { requestCode, phone }) {
  return callOnboardingRpc(supabase, "get_connect_request_status", {
    p_request_code: requestCode,
    p_phone: phone,
  });
}

export function adminListConnectRequests(
  supabase,
  { search, status, from, to, limit, offset } = {},
) {
  return callOnboardingRpc(supabase, "admin_list_connect_requests", {
    p_search: search ?? null,
    p_status: status ?? null,
    p_from: from ?? null,
    p_to: to ?? null,
    p_limit: limit ?? 25,
    p_offset: offset ?? 0,
  });
}

export function adminGetConnectRequest(supabase, requestId) {
  return callOnboardingRpc(supabase, "admin_get_connect_request", { p_request_id: requestId });
}

export function adminRescheduleConnectRequest(supabase, { requestId, scheduledAt, note }) {
  return callOnboardingRpc(supabase, "admin_reschedule_connect_request", {
    p_request_id: requestId,
    p_scheduled_at: scheduledAt,
    p_note: note ?? null,
  });
}

export function adminRejectConnectRequest(supabase, { requestId, reason }) {
  return callOnboardingRpc(supabase, "admin_reject_connect_request", {
    p_request_id: requestId,
    p_reason: reason,
  });
}

export function adminMarkConnectCalled(supabase, { requestId, note }) {
  return callOnboardingRpc(supabase, "admin_mark_connect_called", {
    p_request_id: requestId,
    p_note: note ?? null,
  });
}

export function adminOnboardingMetrics(supabase) {
  return callOnboardingRpc(supabase, "admin_onboarding_metrics");
}
