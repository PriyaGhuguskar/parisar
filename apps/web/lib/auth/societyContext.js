// apps/web/lib/auth/societyContext.js
// Server-side bundle of "who am I in which society" for the protected layout and
// the dashboard shell: the active society + role (from resolveActiveSociety —
// the single source of truth) plus the caller's active memberships (for the
// society switcher). The active membership is looked up BY the resolved society
// id — never `memberships[0]`, which is unordered and diverged from the JWT.
//
// JavaScript only — no TypeScript per CLAUDE.md.

import { resolveActiveSociety } from "./activeSociety";

/**
 * @param {import("@supabase/supabase-js").SupabaseClient} supabase
 * @param {{ id: string }} user
 * @returns {Promise<{
 *   active: Awaited<ReturnType<typeof resolveActiveSociety>>,
 *   memberships: Array<{ society_id: string, role: string, flat_id: string|null, society_name: string|null }>,
 *   activeMembership: { society_id: string, role: string, flat_id: string|null, society_name: string|null } | null,
 * }>}
 */
export async function loadSocietyContext(supabase, user) {
  const [active, membershipsRes] = await Promise.all([
    resolveActiveSociety(supabase, user),
    supabase
      .from("society_memberships")
      .select("society_id, role, flat_id, joined_at, societies:society_id(name)")
      .eq("user_id", user.id)
      .eq("status", "active")
      .order("joined_at", { ascending: false }),
  ]);

  const memberships = Array.isArray(membershipsRes.data)
    ? membershipsRes.data.map((r) => ({
        society_id: r.society_id,
        role: r.role,
        flat_id: r.flat_id,
        society_name: r.societies?.name ?? null,
      }))
    : [];

  const activeMembership = active.societyId
    ? (memberships.find((m) => m.society_id === active.societyId) ?? null)
    : null;

  return { active, memberships, activeMembership };
}
