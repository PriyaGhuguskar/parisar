// apps/web/app/(protected)/dashboard/page.jsx
// Server Component shell (Phase 04.1 Wave 2, Plan 03, Task 2).
//
// SSR-fetches the stable identity bits — role, societyId, societyName,
// memberships — for the active user, then hands off to the client DashboardClient
// for the tile grid and the volatile badge-count hydration.
//
// Why SSR the shell but NOT the badges (RESEARCH.md §Anti-Patterns):
//   - role + societyId + societyName are stable enough to render server-side.
//   - the pending-reviews count is volatile; it hydrates client-side via effect
//     so the Reviews badge refreshes when a Secretary returns from the queue.
//
// force-dynamic (Phase 4 convention, Pitfall 5): navigation re-runs the SSR so
// the shell data stays fresh after a Secretary acts on the review queue.
//
// Auth: getUser() — validates the JWT against the auth server (Phase 2 D-02);
// the (protected)/layout.jsx guard already 302s a signed-out user, this is a
// defensive second check so the server component never renders stale identity.
//
// Active society + role: resolveActiveSociety (my_active_society() RPC) — the
// single source of truth. full_name falls back to user_metadata then "Member".
//
// JavaScript only — no TypeScript per CLAUDE.md.

import { getDashboardSummary } from "@parisar/api-client";
import { redirect } from "next/navigation";
import { isManagerRole } from "../../../lib/auth/activeSociety";
import { loadSocietyContext } from "../../../lib/auth/societyContext";
import { getServerT } from "../../../lib/i18n/server";
import { createSupabaseServerClient } from "../../../lib/supabase/server";
import { DashboardClient } from "./DashboardClient";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Protected layout already 302s when no user; defensive check anyway.
  if (!user) redirect("/login");

  const { t } = await getServerT(["auth"]);
  const meta = user.app_metadata ?? {};
  const fullName = meta.full_name ?? user.user_metadata?.full_name ?? t("profile.roleMember");

  // Active society + role come from resolveActiveSociety (my_active_society()
  // RPC) — the same resolver the layout and every page use. NOT app_metadata
  // (absent on getUser()) and NOT memberships[0] (unordered). No active
  // membership at all → onboarding not finished.
  const {
    active,
    memberships: rawMemberships,
    activeMembership,
  } = await loadSocietyContext(supabase, user);
  if (!active.societyId) redirect("/onboarding");
  const memberships = rawMemberships.map((m) => ({
    ...m,
    society_name: m.society_name ?? t("profile.society"),
  }));

  const societyId = active.societyId;
  const role = active.role;

  // A society authority must finish onboarding before the app opens: set up the
  // society's wings/flats first if there are none, then join as a resident
  // (their authority membership has no flat until then).
  if (isManagerRole(role) && activeMembership && !activeMembership.flat_id) {
    const { count } = await supabase
      .from("flats")
      .select("id", { count: "exact", head: true })
      .eq("society_id", societyId);
    redirect((count ?? 0) === 0 ? "/setup/structure" : "/onboarding");
  }

  const resolvedSocietyName =
    active.societyName ?? activeMembership?.society_name ?? t("common.yourSociety");

  // Phase 7 Plan 07-08 — SSR-fetch the initial dashboard summary so the client
  // hydrates with real tile previews on first paint (no FOUC, no loading flash).
  // The cookie-bound server client is RLS-scoped (T-07-29 cross-tenant defense
  // — never uses the service-role key). On fetch failure we degrade to null and
  // the client falls back to its loading skeleton → empty/fetch path (UI-SPEC
  // silent-omission contract).
  let initialSummary = null;
  try {
    // An authority's home is the resident view (management is on the Society
    // Dashboard), so ask for the resident summary to match its tiles.
    const isAuthority = isManagerRole(role);
    initialSummary = await getDashboardSummary(supabase, {
      view: isAuthority ? "member" : null,
    });
  } catch (err) {
    console.error("[dashboard] summary load failed:", err?.message ?? err);
    initialSummary = null;
  }

  return (
    <DashboardClient
      userId={user.id}
      role={role}
      societyId={societyId}
      societyName={resolvedSocietyName}
      fullName={fullName}
      memberships={memberships}
      initialSummary={initialSummary}
    />
  );
}
