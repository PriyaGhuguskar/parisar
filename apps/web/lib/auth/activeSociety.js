// apps/web/lib/auth/activeSociety.js
// Resolve the caller's active society_id + role — the SINGLE source of truth.
//
// WHY THIS EXISTS
// The Custom Access Token Hook (inject_society_claims) injects society_id/role
// into the *JWT*, but supabase.auth.getUser() returns the stored user record,
// where those claims are ABSENT. Every page that read `user.app_metadata.role`
// from getUser() therefore saw null and treated everyone as a plain "member"
// (secretaries could not post notices, the board action row never rendered).
//
// Every caller (layout, pages, server actions, client pages) goes through this
// one function so the society + role can never diverge between screens. It asks
// the `my_active_society()` RPC (migration 054), which applies exactly the same
// rule as the Auth Hook: the switcher choice (`profiles.active_society_id`),
// else the newest active membership. It also reports `token_stale` — true when
// the caller's access token predates a switch / role change, so the client can
// call `auth.refreshSession()`.
//
// If the RPC is unavailable (e.g. a local DB that has not applied 054 yet) we
// fall back to the same ordering the RPC uses — newest active membership — so
// the app still works; an ERROR from the RPC is never silently read as "no
// society".
//
// Works with either a server (cookie-bound) or browser Supabase client.
//
// JavaScript only — no TypeScript per CLAUDE.md.

const EMPTY = Object.freeze({
  societyId: null,
  role: "member",
  societyName: null,
  serviceStatus: null,
  tokenStale: false,
});

/**
 * Fallback when my_active_society() is unavailable: newest active membership
 * (same ordering as app_private.resolve_active_membership minus the switcher).
 */
async function resolveFromMembership(supabase, userId) {
  const { data, error } = await supabase
    .from("society_memberships")
    .select("society_id, role, societies:society_id(name)")
    .eq("user_id", userId)
    .eq("status", "active")
    .order("joined_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error || !data) return EMPTY;
  return {
    societyId: data.society_id,
    role: data.role ?? "member",
    societyName: data.societies?.name ?? null,
    serviceStatus: null,
    tokenStale: false,
  };
}

/**
 * @param {import("@supabase/supabase-js").SupabaseClient} supabase
 * @param {{ id?: string } | null} user
 * @returns {Promise<{
 *   societyId: string | null,
 *   role: string,
 *   societyName: string | null,
 *   serviceStatus: string | null,
 *   tokenStale: boolean,
 * }>}
 */
export async function resolveActiveSociety(supabase, user) {
  if (!user?.id) return EMPTY;

  const { data, error } = await supabase.rpc("my_active_society");
  if (error) return resolveFromMembership(supabase, user.id);
  if (!data?.society_id) return EMPTY;

  return {
    societyId: data.society_id,
    role: data.role ?? "member",
    societyName: data.society_name ?? null,
    serviceStatus: data.service_status ?? null,
    tokenStale: data.token_stale === true,
  };
}

/** Board roles: may respond to complaints, post notices, approve bookings. */
export const BOARD_ROLES = Object.freeze(["board_member", "co_secretary", "secretary"]);

/** Society authorities: may manage members, codes and the review queue. */
export const MANAGER_ROLES = Object.freeze(["co_secretary", "secretary"]);

/** @param {string|null|undefined} role */
export function isBoardRole(role) {
  return BOARD_ROLES.includes(role);
}

/** @param {string|null|undefined} role */
export function isManagerRole(role) {
  return MANAGER_ROLES.includes(role);
}
