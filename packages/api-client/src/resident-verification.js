// Resident verification. A resident only ever sees records on their own verified
// phone; edits are proposals until a manager applies them.
// See docs/onboarding/API.md.
import { callOnboardingRpc } from "./onboarding-rpc.js";

export function myResidentRecords(supabase) {
  return callOnboardingRpc(supabase, "my_resident_records");
}

/** Creates the membership. Call refreshSession() when refresh_required is true. */
export function residentConfirmRecord(supabase, recordId) {
  return callOnboardingRpc(supabase, "resident_confirm_record", { p_record_id: recordId });
}

/** changes: any of { full_name, email, resident_type, flat_label } */
export function residentSubmitCorrection(supabase, { recordId, changes, note }) {
  return callOnboardingRpc(supabase, "resident_submit_correction", {
    p_record_id: recordId,
    p_changes: changes,
    p_note: note ?? null,
  });
}

export function residentReportIncorrect(supabase, { recordId, reason }) {
  return callOnboardingRpc(supabase, "resident_report_incorrect", {
    p_record_id: recordId,
    p_reason: reason,
  });
}

export function managerListResidentRecords(supabase, input) {
  return callOnboardingRpc(supabase, "manager_list_resident_records", {
    p_society_id: input.societyId,
    p_status: input.status ?? null,
    p_resident_type: input.residentType ?? null,
    p_search: input.search ?? null,
    p_flat_id: input.flatId ?? null,
    p_batch_id: input.batchId ?? null,
    p_limit: input.limit ?? 25,
    p_offset: input.offset ?? 0,
  });
}

/** action: "apply_changes" | "reject" | "reopen" */
export function managerReviewResidentRecord(
  supabase,
  { recordId, action, changes, flatId, reason },
) {
  return callOnboardingRpc(supabase, "manager_review_resident_record", {
    p_record_id: recordId,
    p_action: action,
    p_changes: changes ?? null,
    p_flat_id: flatId ?? null,
    p_reason: reason ?? null,
  });
}

export function managerAddResidentRecord(supabase, input) {
  return callOnboardingRpc(supabase, "manager_add_resident_record", {
    p_society_id: input.societyId,
    p_flat_id: input.flatId,
    p_full_name: input.fullName,
    p_phone: input.phone,
    p_resident_type: input.residentType,
    p_email: input.email ?? null,
  });
}

/** Records that an invitation was prepared. Always returns sent:false; nothing is sent. */
export function managerPrepareResidentInvite(supabase, recordId) {
  return callOnboardingRpc(supabase, "manager_prepare_resident_invite", { p_record_id: recordId });
}
