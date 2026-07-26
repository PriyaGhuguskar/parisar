// apps/web/lib/auth/activeSociety.js
// Resolve the caller's active society_id + role.
//
// WHY THIS EXISTS
// The Custom Access Token Hook (inject_society_claims) injects society_id/role
// into the *JWT*, but supabase.auth.getUser() returns the stored user record,
// where those claims are ABSENT. Every page that read
// `user.app_metadata.society_id` from getUser() therefore saw null and bounced a
// fully-onboarded member to /onboarding — the blank-dashboard / "can't reach
// complaints" bug.
//
// The active membership row is the real source of truth ("does this user belong
// to a society, and as what"). We prefer the JWT claim when it is present (it
// pins the active society for multi-society switching) and fall back to the
// membership that RLS itself confirms. Works unchanged with either a server
// (cookie-bound) or browser Supabase client — it only issues a scoped SELECT.
//
// JavaScript only — no TypeScript per CLAUDE.md.

/**
 * @param {import("@supabase/supabase-js").SupabaseClient} supabase
 * @param {{ id?: string, app_metadata?: Record<string, unknown> } | null} user
 * @returns {Promise<{ societyId: string | null, role: string }>}
 */
export async function resolveActiveSociety(supabase, user) {
  const meta = user?.app_metadata ?? {};
  let societyId = meta.society_id ?? null;
  let role = meta.role ?? null;

  if (!societyId && user?.id) {
    const { data } = await supabase
      .from("society_memberships")
      .select("society_id, role")
      .eq("user_id", user.id)
      .eq("status", "active")
      .limit(1)
      .maybeSingle();
    if (data) {
      societyId = data.society_id;
      role = role ?? data.role;
    }
  }

  return { societyId, role: role ?? "member" };
}
