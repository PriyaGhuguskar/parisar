// apps/web/app/(protected)/layout.jsx
// Server-component auth guard (PRESERVED from Phase 2 — uses getUser(), which
// validates the JWT against the auth server, never getSession() which trusts a
// possibly-stale cookie; Phase 2 D-02 mandate). The guard stays FIRST so no
// protected content renders for a signed-out user.
//
// Phase 04.1 Wave 2: wraps every protected page in the shadcn SidebarProvider so
// the persistent left sidebar (AppSidebar) surrounds the whole protected app.
// Pitfall 4 — the sidebar_state cookie is read here (server-side) and passed to
// SidebarProvider as defaultOpen, preventing an open→closed flash on hydration.
//
// JavaScript only — no TypeScript per CLAUDE.md.

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { AppSidebar } from "../../components/AppSidebar";
import { ServiceStatusScreen } from "../../components/society/ServiceStatusScreen";
import { SidebarInset, SidebarProvider, SidebarTrigger } from "../../components/ui/sidebar";
import { isManagerRole } from "../../lib/auth/activeSociety";
import { loadSocietyContext } from "../../lib/auth/societyContext";
import { devRoutesEnabled } from "../../lib/devRoutes";
import { getServerT } from "../../lib/i18n/server";
import { createSupabaseServerClient } from "../../lib/supabase/server";

export default async function ProtectedLayout({ children }) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    // DEV-ONLY convenience: opening a protected screen locally auto-signs-in as a
    // seeded test resident instead of bouncing to the OTP screen. The guard itself
    // is UNCHANGED — an unauthenticated user still never reaches protected content;
    // they are redirected, just to /dev-login (which 404s unless dev routes are
    // enabled — NODE_ENV=development AND ENABLE_DEV_ROUTES=1).
    // Remove alongside app/dev-login/route.js in the Phase 8 production OTP swap.
    if (devRoutesEnabled()) {
      redirect("/dev-login?next=/dashboard");
    }
    redirect("/login");
  }

  // SERVICE STATUS: Parisar paused or blocked this user's society. Nothing else
  // is reachable — show the admin's reason and a sign-out. (The database also
  // stops serving the society's data; this is the explanation, not the lock.)
  const { data: service } = await supabase.rpc("my_society_service_status");
  if (service?.status && service.status !== "active") {
    return (
      <ServiceStatusScreen
        status={service.status}
        societyName={service.society_name}
        reason={service.reason}
        changedAt={service.changed_at}
      />
    );
  }

  // Identity bits for the sidebar's society switcher + profile menu.
  // society_id + role come from resolveActiveSociety (the my_active_society()
  // RPC) — the SINGLE source of truth shared with every page. NOT
  // user.app_metadata: getUser() returns the stored user record, where the Auth
  // Hook's claims are absent, and NOT memberships[0] (unordered — it diverged
  // from the society the JWT is scoped to). full_name falls back to
  // user_metadata; flat_label is fetched client-side by ProfileMenuDropdown.
  const { t } = await getServerT(["auth"]);
  const meta = user.app_metadata ?? {};
  const fullName = meta.full_name ?? user.user_metadata?.full_name ?? t("profile.roleMember");
  const flatLabel = meta.flat_label ?? undefined;

  // Memberships — RLS + explicit user_id filter scope this to the calling user's
  // societies (threat T-04.1-01). Single-society users see no switcher chevron.
  const {
    active,
    memberships: rawMemberships,
    activeMembership,
  } = await loadSocietyContext(supabase, user);
  const memberships = rawMemberships.map((m) => ({
    ...m,
    society_name: m.society_name ?? t("profile.society"),
  }));
  const societyId = active.societyId;
  const activeRole = active.role;

  // A secretary/co-secretary who hasn't finished setup (their society has no
  // flats yet) must complete it before the app opens up. Render bare — with no
  // sidebar to escape through — so an incomplete society can't be left half-built.
  let setupIncomplete = false;
  if (societyId && isManagerRole(activeRole)) {
    const { count } = await supabase
      .from("flats")
      .select("id", { count: "exact", head: true })
      .eq("society_id", societyId);
    setupIncomplete = (count ?? 0) === 0;
  }

  // PRE-SOCIETY / INCOMPLETE-SETUP STATE (onboarding, joining, unfinished setup).
  // Every sidebar destination is society-scoped and redirects straight back here
  // without one, so the nav would be links that cannot go anywhere — and worse,
  // an escape hatch out of an unfinished setup. Deliberately a RULE rather than a
  // list of routes — a blacklist rots when a screen is added. These screens carry
  // their own header, so nothing is lost.
  // A society authority who hasn't finished PERSONAL onboarding yet (their
  // authority membership has no flat) is in the same state: the app opens only
  // after they have joined as a resident. /dashboard sends them to /onboarding.
  const onboardingIncomplete =
    isManagerRole(activeRole) && Boolean(activeMembership) && !activeMembership.flat_id;

  if (!societyId || setupIncomplete || onboardingIncomplete) {
    return <main id="main-content">{children}</main>;
  }

  const resolvedSocietyName =
    active.societyName ?? activeMembership?.society_name ?? t("common.yourSociety");

  // Pitfall 4 — cookie-driven default open state to prevent layout shift on
  // hydration. shadcn's Sidebar writes "sidebar_state" ("true"/"false") on toggle.
  const cookieStore = await cookies();
  const sidebarStateCookie = cookieStore.get("sidebar_state")?.value;
  const defaultOpen = sidebarStateCookie !== "false";

  return (
    <SidebarProvider defaultOpen={defaultOpen}>
      <AppSidebar
        userId={user.id}
        societyId={societyId}
        societyName={resolvedSocietyName}
        role={activeRole}
        fullName={fullName}
        flatLabel={flatLabel}
        memberships={memberships}
        tokenStale={active.tokenStale}
      />
      {/* PAR-071: skip-to-content link. Visually hidden until focused, so a
          keyboard user can jump past the whole sidebar nav on every page.
          The target is the SidebarInset <main> itself — do NOT wrap {children}
          in an extra div: SidebarInset is `flex flex-1 flex-col` and pages rely
          on being its direct flex children (a plain wrapper collapses the layout). */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:z-50 focus:top-2 focus:left-2 focus:h-11 focus:px-4 focus:inline-flex focus:items-center focus:rounded-lg focus:bg-[#0E5A48] focus:text-white focus:text-sm focus:font-semibold"
      >
        {t("common.skipToContent")}
      </a>
      <SidebarInset id="main-content">
        {/* Narrow-viewport hamburger trigger — the sidebar collapses to an
            offcanvas sheet below the md breakpoint, opened via this button. */}
        <div className="md:hidden p-2">
          <SidebarTrigger aria-label={t("common.openNavigation")} />
        </div>
        {children}
      </SidebarInset>
    </SidebarProvider>
  );
}
