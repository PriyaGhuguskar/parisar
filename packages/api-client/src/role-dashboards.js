// Role dashboards. Real data only; metrics with no module are absent, not zero.
// See docs/onboarding/API.md.
import { callOnboardingRpc } from "./onboarding-rpc.js";

export function societyAdminDashboard(supabase, societyId) {
  return callOnboardingRpc(supabase, "society_admin_dashboard", { p_society_id: societyId });
}

/** societyId omitted = the caller's active society. */
export function residentDashboard(supabase, societyId) {
  return callOnboardingRpc(supabase, "resident_dashboard", { p_society_id: societyId ?? null });
}

export function securityDashboard(supabase, societyId) {
  return callOnboardingRpc(supabase, "security_dashboard", { p_society_id: societyId ?? null });
}
