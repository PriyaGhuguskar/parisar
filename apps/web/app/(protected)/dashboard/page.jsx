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
// JWT shape (04.1-00-JWT-SHAPE.md): the Auth Hook injects ONLY society_id + role.
// society_name and full_name are NOT in app_metadata — society_name falls back to
// the first membership's society name (fetched below), full_name to user_metadata
// then "Member". Wave 3 wires the real profiles.full_name fetch.
//
// JavaScript only — no TypeScript per CLAUDE.md.

import { getDashboardSummary } from "@parisar/api-client";
import { redirect } from "next/navigation";
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

  const meta = user.app_metadata ?? {};
  const fullName = meta.full_name ?? user.user_metadata?.full_name ?? "Member";

  // Membership is the SOURCE OF TRUTH for society_id + role — NOT app_metadata.
  // The Custom Access Token Hook injects society_id/role into the JWT, but
  // getUser() returns the stored user record, where those claims are absent. So
  // reading meta.society_id gave null for every real member and bounced the whole
  // dashboard to /onboard (blank screen after onboarding). We fetch the active
  // membership directly; RLS + the user_id filter scope it to this user, and it
  // exists the moment onboarding/claim completes — no waiting for a JWT refresh.
  let memberships = [];
  if (user.id) {
    const { data } = await supabase
      .from("society_memberships")
      .select("society_id, role, societies:society_id(name)")
      .eq("user_id", user.id)
      .eq("status", "active");
    if (Array.isArray(data)) {
      memberships = data.map((r) => ({
        society_id: r.society_id,
        role: r.role,
        society_name: r.societies?.name ?? "Society",
      }));
    }
  }

  // Prefer the JWT claim's active society when present (multi-society switching),
  // else the first membership. No membership at all → onboarding not finished.
  const active =
    memberships.find((m) => m.society_id === meta.society_id) ?? memberships[0] ?? null;
  if (!active) redirect("/onboarding");

  const societyId = active.society_id;
  const role = meta.role ?? active.role ?? "member";
  const resolvedSocietyName = meta.society_name ?? active.society_name ?? "Your Society";

  // Phase 7 Plan 07-08 — SSR-fetch the initial dashboard summary so the client
  // hydrates with real tile previews on first paint (no FOUC, no loading flash).
  // The cookie-bound server client is RLS-scoped (T-07-29 cross-tenant defense
  // — never uses the service-role key). On fetch failure we degrade to null and
  // the client falls back to its loading skeleton → empty/fetch path (UI-SPEC
  // silent-omission contract).
  let initialSummary = null;
  try {
    initialSummary = await getDashboardSummary(supabase);
  } catch {
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
