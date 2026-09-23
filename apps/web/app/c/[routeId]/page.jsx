// /c/<routeId> — every role-gated dashboard, behind one opaque id.
//
// One dynamic segment rather than six sibling folders, so the id→surface table
// lives in exactly one place (packages/api-client/src/roles.js) and web and
// mobile cannot drift apart on it.
//
// WHAT THE ROUTE ID IS AND IS NOT. It is a name, not a password. It appears in
// the URL bar of anyone who reaches it and in a client-shipped module. All it
// buys is that /admin is not sitting at a guessable path for anything crawling
// the origin. The actual boundary is two layers below: the role is resolved by
// reading the database on every request (force-dynamic, no caching), and every
// byte of data these pages render arrives through an RLS policy or a SECURITY
// DEFINER RPC that re-checks the caller itself.
//
// An unknown id and an id belonging to someone else are treated identically —
// both redirect, neither confirms the id was real.
//
// JavaScript only — no TypeScript per CLAUDE.md.

import { SURFACE, surfaceFromRouteId } from "@parisar/api-client";
import { redirect } from "next/navigation";
import { AdminConsole } from "@/components/admin/AdminConsole";
import { StaffConsole } from "@/components/console/StaffConsole";
import { GuardClient } from "@/components/guard/GuardClient";
import { resolveCallerRole } from "@/lib/auth/callerRole";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { homeHrefForRole } from "@/lib/surface-routes";

export const dynamic = "force-dynamic";

export default async function SurfacePage({ params }) {
  // Next 15: params is a Promise. Reading it synchronously yields undefined.
  const { routeId } = await params;

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { role, guard } = await resolveCallerRole(supabase, user);
  const requested = surfaceFromRouteId(routeId);
  const home = homeHrefForRole(role);

  // Unknown id, or someone else's surface — same outcome either way.
  if (!requested || `/c/${routeId}` !== home) redirect(home);

  switch (requested) {
    case SURFACE.CONSOLE_ADMIN:
    case SURFACE.CONSOLE_SALES:
      return renderConsole(supabase, requested === SURFACE.CONSOLE_ADMIN);

    case SURFACE.CONSOLE_STAFF: {
      const { data: profile } = await supabase
        .from("profiles")
        .select("full_name, phone")
        .eq("user_id", user.id)
        .maybeSingle();
      return <StaffConsole fullName={profile?.full_name} phone={profile?.phone} />;
    }

    case SURFACE.SECURITY:
      return (
        <GuardClient guardName={guard.name} societyName={guard.societies?.name ?? "Society"} />
      );

    default:
      // Secretary and resident map to /dashboard, so homeHrefForRole never
      // equals this path for them and the guard above already redirected.
      redirect(home);
  }
}

/**
 * The staff console's data, moved here verbatim from the old /admin page rather
 * than duplicated — /admin is now a redirect to this route.
 *
 * `isAdmin` only chooses what renders. The RPCs below enforce the same split
 * server-side: admin_stats and admin_society_detail return NULL for mrr,
 * past_due, billing and payments unless is_platform_admin(), so a sales user
 * cannot reach finance data by editing the prop in their browser.
 */
async function renderConsole(supabase, isAdmin) {
  // Leads come through RLS (enrollment_staff_read) — the policy is the security
  // boundary, not the query. Societies and stats come through SECURITY DEFINER
  // RPCs instead: every policy on societies / society_memberships is
  // tenant-scoped, and widening those to admit staff would put the entire tenant
  // boundary behind one admin check. The RPCs return only what this console
  // renders — no resident names, no resident phone numbers.
  const [{ data: leads }, { data: societies }, { data: stats }, { data: features }] =
    await Promise.all([
      supabase
        .from("society_enrollment_requests")
        .select(
          "id, society_name, contact_name, phone, preferred_slot, preferred_at, call_now, status, created_at",
        )
        .in("status", ["new", "contacted"])
        .order("call_now", { ascending: false })
        .order("preferred_at", { ascending: true, nullsFirst: false }),
      supabase.rpc("admin_list_societies"),
      supabase.rpc("admin_stats"),
      // The catalogue is readable by any signed-in user (a chairman should be
      // able to see what exists and what it costs), so a plain select is fine.
      supabase
        .from("platform_features")
        .select("key, name, description, price_monthly, is_core")
        .order("sort_order"),
    ]);

  return (
    <AdminConsole
      isAdmin={isAdmin}
      initialLeads={leads ?? []}
      initialSocieties={societies ?? []}
      initialStats={stats ?? {}}
      initialFeatures={features ?? []}
    />
  );
}
