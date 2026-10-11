// apps/web/lib/auth/requireRole.js
// Server-side role gate for protected pages whose UI is a client component.
//
// A client page cannot stop a member from loading it — the bundle ships and the
// browser renders it before any client-side check runs. Wrapping the client UI
// in a server page.jsx that calls this keeps members from ever seeing the live
// society code, the review queue, or the secretary hand-off screen. RLS/RPCs
// remain the real enforcement; this is the UI boundary.
//
// JavaScript only — no TypeScript per CLAUDE.md.

import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "../supabase/server";
import { resolveActiveSociety } from "./activeSociety";

/**
 * Resolve the caller and their active society; redirect unless their live role
 * is one of `allowedRoles`.
 *
 * @param {readonly string[]} allowedRoles
 * @param {{ fallback?: string }} [opts]  where to send a disallowed role
 * @returns {Promise<{ user: object, societyId: string, role: string }>}
 */
export async function requireSocietyRole(allowedRoles, opts = {}) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { societyId, role } = await resolveActiveSociety(supabase, user);
  if (!societyId) redirect("/onboarding");
  if (!allowedRoles.includes(role)) redirect(opts.fallback ?? "/dashboard");

  return { user, societyId, role };
}
