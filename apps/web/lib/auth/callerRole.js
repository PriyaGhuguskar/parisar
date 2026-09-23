// Who is the signed-in user, in one call?
//
// Parisar keeps its three kinds of role in three different places — platform
// staff in `platform_admins`, gate guards in `society_guards`, and everyone else
// in `society_memberships`. A route that wants to know "which dashboard does
// this person get" has to ask all three, in a fixed order.
//
// JavaScript only — no TypeScript per CLAUDE.md.

import { GUARD_ROLE } from "@parisar/api-client";

/**
 * Resolve the caller's role by reading the tables, never the JWT claims.
 *
 * WHY NOT app_metadata. `getUser()` returns the stored user record, and the
 * Custom Access Token Hook only injects claims into the JWT — so the role is
 * simply absent there. It is also absent on a guard's or chairman's very first
 * login, before they have claimed, which is exactly when routing matters most.
 *
 * ORDER MATTERS. Platform staff first: they hold no membership, so checking
 * membership first would fall through to `null` for them. Guard before
 * membership for the same reason — a guard deliberately has no membership row.
 *
 * The membership query orders by `joined_at desc` to match `inject_society_claims`
 * in the guard-visitor migration. If the two ever order differently, a
 * multi-society user routes to one society while their JWT scopes them to
 * another — silent, and painful to debug.
 *
 * @returns {Promise<{role: string|null, guard: object|null}>}
 */
export async function resolveCallerRole(supabase, user) {
  const { data: platformRole } = await supabase.rpc("platform_role_of");
  if (platformRole) return { role: platformRole, guard: null };

  const { data: guard } = await supabase
    .from("society_guards")
    .select("id, society_id, name, societies:society_id(name)")
    .eq("user_id", user.id)
    .eq("status", "active")
    .maybeSingle();
  if (guard) return { role: GUARD_ROLE, guard };

  const { data: membership } = await supabase
    .from("society_memberships")
    .select("role")
    .eq("user_id", user.id)
    .eq("status", "active")
    .order("joined_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  return { role: membership?.role ?? null, guard: null };
}
