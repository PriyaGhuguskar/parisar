// Authority sign-in, after the OTP (docs/onboarding/API.md section 5).
//
//   my_authority_societies()  -> which societies this VERIFIED phone is an authority of
//   claim_authority_for_society(id) -> one membership with authority powers, then
//   refreshSession() so the JWT carries the society, then route by setup_state.
//
// Nothing is looked up before the OTP: no RPC takes a phone number, so the
// number alone never reveals a society. Pure helpers only; the page does I/O.

/** Where an authority goes once claimed, by setup_state. */
export function authorityDestination(setupState) {
  if (setupState === "needs_setup") return "/setup";
  if (setupState === "needs_personal_onboarding") return "/setup/personal";
  return "/society-dashboard";
}

const CLAIM_ERRORS = new Set(["NO_PHONE", "NOT_AN_AUTHORITY", "SOCIETY_BLOCKED"]);

/** setup-wizard i18n key for a claim failure. */
export function claimErrorKey(code) {
  return CLAIM_ERRORS.has(code)
    ? `setup-wizard:authLogin.errors.${code}`
    : "setup-wizard:authLogin.errors.generic";
}

/**
 * For a returning manager signing in the usual way: send them to setup or the
 * Society Dashboard when their society still needs it, instead of the resident
 * home. Returns a path, or null to keep the normal destination.
 *
 * @param {object|null} loginState my_login_state()
 * @param {Array<object>} societies my_authority_societies().societies
 */
export function managerDestination(loginState, societies) {
  const m = loginState?.membership;
  if (!m || !["secretary", "co_secretary"].includes(m.role)) return null;
  const row = (societies ?? []).find((s) => s.society_id === m.society_id && s.claimed);
  if (!row) return null;
  if (row.setup_state === "complete" && m.flat_id) return null;
  return authorityDestination(row.setup_state);
}
