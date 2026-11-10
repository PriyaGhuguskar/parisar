// Staff details for society managers. The public contact list stays in staff.js; the
// private fields here are never readable by residents. See docs/onboarding/API.md.
import { callOnboardingRpc } from "./onboarding-rpc.js";

export function managerSaveStaff(supabase, input) {
  return callOnboardingRpc(supabase, "manager_save_staff", {
    p_society_id: input.societyId,
    p_name: input.name,
    p_category: input.category,
    p_phone: input.phone ?? null,
    p_last_name: input.lastName ?? null,
    p_email: input.email ?? null,
    p_joining_date: input.joiningDate ?? null,
    p_employee_id: input.employeeId ?? null,
    p_vendor_name: input.vendorName ?? null,
    p_shift: input.shift ?? null,
    p_emergency_contact_name: input.emergencyContactName ?? null,
    p_emergency_contact_phone: input.emergencyContactPhone ?? null,
    p_id_proof_type: input.idProofType ?? null,
    p_staff_id: input.staffId ?? null,
  });
}

export function managerListStaff(supabase, { societyId, category, search, limit, offset }) {
  return callOnboardingRpc(supabase, "manager_list_staff", {
    p_society_id: societyId,
    p_category: category ?? null,
    p_search: search ?? null,
    p_limit: limit ?? 25,
    p_offset: offset ?? 0,
  });
}

export function managerGetStaff(supabase, staffId) {
  return callOnboardingRpc(supabase, "manager_get_staff", { p_staff_id: staffId });
}
