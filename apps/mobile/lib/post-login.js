// apps/mobile/lib/post-login.js
// Where a signed-in user belongs. The facts come from the database function
// my_login_state() (migration 053), the same rules the website uses, so the two
// apps can't drift apart again:
//
//   Parisar staff (admin / sales / staff)        → staff screen
//   society service stopped / blocked            → service screen
//   gate guard (claimed on first login)          → [PIN] → guard screen
//   resident with a flat                         → [PIN] → app (tabs)
//   society authority, society has no flats      → wings/flats setup
//   society authority, no flat of their own yet  → onboarding (code pre-filled)
//   pre-entered family member (claimed here)     → set PIN → app
//   anyone else                                  → onboarding (society code)
//
// [PIN] only right after OTP (`atLogin`): enter the PIN if one is set, else set
// one — same as the website. Onboarding asks for the PIN itself.
//
// JavaScript only — no TypeScript per CLAUDE.md.

export const ROUTES = {
  app: "/(protected)/(tabs)",
  structure: "/(protected)/structure",
  onboarding: "/(protected)/onboarding",
  staff: "/(protected)/staff",
  guard: "/(protected)/guard",
  service: "/(protected)/service",
  pin: "/(protected)/pin",
};

/** The PIN screen, then `next`. mode: "enter" (has a PIN) or "set". */
export function pinRoute(mode, next) {
  return `${ROUTES.pin}?mode=${mode}&next=${encodeURIComponent(next)}`;
}

async function rpcOrThrow(supabase, fn) {
  const { data, error } = await supabase.rpc(fn);
  if (error) throw error;
  return data;
}

/**
 * @param {object} supabase signed-in supabase-js client
 * @param {{ atLogin?: boolean }} [opts] true right after OTP (adds the PIN step)
 * @returns {Promise<string>} a route (ROUTES.* or a pinRoute)
 * @throws on network / unexpected database errors (callers show a retry)
 */
export async function resolvePostLoginRoute(supabase, { atLogin = false } = {}) {
  let s = await rpcOrThrow(supabase, "my_login_state");
  const withPin = (next) => (atLogin ? pinRoute(s.pin_set ? "enter" : "set", next) : next);

  if (s.staff) return ROUTES.staff;
  if (s.service && s.service !== "active") return ROUTES.service;

  if (s.guard) {
    if (s.guard === "unclaimed") {
      await rpcOrThrow(supabase, "claim_guard");
      await supabase.auth.refreshSession();
    }
    return withPin(ROUTES.guard);
  }

  if (s.membership?.flat_id) return withPin(ROUTES.app);

  if (s.authority) {
    if (!s.membership) {
      // First login: link them to their society's authority list.
      const claim = await rpcOrThrow(supabase, "claim_society_authority");
      await supabase.auth.refreshSession();
      return claim?.needs_setup ? ROUTES.structure : ROUTES.onboarding;
    }
    return (s.flats_in_society ?? 0) === 0 ? ROUTES.structure : ROUTES.onboarding;
  }

  if (s.family) {
    // A resident pre-entered this number: join their flat, no code needed.
    await rpcOrThrow(supabase, "claim_family_membership");
    await supabase.auth.refreshSession();
    s = await rpcOrThrow(supabase, "my_login_state");
    return pinRoute(s.pin_set ? "enter" : "set", ROUTES.app);
  }

  return ROUTES.onboarding;
}
