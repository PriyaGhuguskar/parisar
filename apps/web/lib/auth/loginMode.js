// What /verify asks for after the OTP succeeds, decided from my_login_state()
// (migration 053) — read as the just-verified user, so nothing about a phone
// number is revealed before its owner has proved they hold it. Replaces the
// pre-OTP lookupPhone server action, which told anonymous callers whether a
// number was staff / guard / authority / resident.
//
// Same precedence the old lookupPhone used:
//   staff → authority (not yet linked) → guard → unfinished authority →
//   pin / setpin → family → code
//
// JavaScript only — no TypeScript per CLAUDE.md.

const AUTHORITY_ROLES = new Set(["secretary", "co_secretary"]);

/**
 * @param {object|null} s my_login_state() result
 * @returns {"staff"|"authority"|"guardpin"|"guardclaim"|"pin"|"setpin"|"family"|"code"}
 */
export function loginModeFromState(s) {
  const state = s ?? {};
  const m = state.membership ?? null;
  const pinSet = Boolean(state.pin_set);

  if (state.staff) return "staff";
  if (!m && state.authority) return "authority";
  if (state.guard === "claimed") return pinSet ? "guardpin" : "guardclaim";
  if (state.guard === "unclaimed") return "guardclaim";

  if (m && AUTHORITY_ROLES.has(m.role)) {
    if ((state.flats_in_society ?? 0) === 0) return "authority";
    if (!m.flat_id && !pinSet) return "authority";
  }

  if (pinSet) return "pin";
  if (m) return "setpin";
  if (state.family) return "family";
  return "code";
}

/** Only same-origin paths ("/x", never "//x" or "/\x"); else the fallback. */
export function safeNextPath(next, fallback = "/dashboard") {
  return typeof next === "string" && /^\/(?![/\\])/.test(next) ? next : fallback;
}
