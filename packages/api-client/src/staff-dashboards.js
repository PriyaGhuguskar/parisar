// Society-wide resident lists by resident type (Owners, Tenants, Family Members
// pages). Manager only; no phone numbers are returned. Migration 078.
import { callOnboardingRpc } from "./onboarding-rpc.js";

/**
 * @param {{ societyId: string, residentType: "owner"|"tenant"|"family_member",
 *   search?: string, status?: string, limit?: number, offset?: number }} input
 * @returns {Promise<{ items: object[], total: number, limit: number, offset: number } | { error: string }>}
 */
export function managerListSocietyResidents(
  supabase,
  { societyId, residentType, search, status, limit, offset },
) {
  return callOnboardingRpc(supabase, "manager_list_society_residents", {
    p_society_id: societyId,
    p_resident_type: residentType,
    p_search: search ?? null,
    p_status: status ?? null,
    p_limit: limit ?? 25,
    p_offset: offset ?? 0,
  });
}

/** @returns {Promise<{ owner: number, tenant: number, family_member: number } | { error: string }>} */
export function managerResidentTypeCounts(supabase, societyId) {
  return callOnboardingRpc(supabase, "manager_resident_type_counts", { p_society_id: societyId });
}
