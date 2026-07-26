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
import { SidebarInset, SidebarProvider, SidebarTrigger } from "../../components/ui/sidebar";
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
    // they are redirected, just to /dev-login (which 404s outside development).
    // Remove alongside app/dev-login/route.js in the Phase 8 production OTP swap.
    if (process.env.NODE_ENV === "development") {
      redirect("/dev-login?next=/dashboard");
    }
    redirect("/login");
  }

  // Identity bits for the sidebar's society switcher + profile menu (Wave 3).
  // JWT shape (04.1-00-JWT-SHAPE.md): app_metadata carries ONLY society_id + role.
  // society_name / full_name / flat_label are NOT in the JWT — society_name is
  // resolved from the memberships fetch, full_name falls back to user_metadata,
  // and flat_label is left undefined so ProfileMenuDropdown fetches it client-side.
  const meta = user.app_metadata ?? {};
  const role = meta.role ?? "member";
  const fullName = meta.full_name ?? user.user_metadata?.full_name ?? "Member";
  const flatLabel = meta.flat_label ?? undefined;

  // Memberships — RLS + explicit user_id filter scope this to the calling user's
  // societies (threat T-04.1-01). Single-society users see no switcher chevron.
  let memberships = [];
  if (user.id) {
    const { data } = await supabase
      .from("society_memberships")
      .select("society_id, societies:society_id(name)")
      .eq("user_id", user.id)
      .eq("status", "active");
    if (Array.isArray(data)) {
      memberships = data.map((r) => ({
        society_id: r.society_id,
        society_name: r.societies?.name ?? "Society",
      }));
    }
  }

  // SOURCE OF TRUTH for "does this user belong to a society".
  //
  // app_metadata.society_id is NOT reliable here: the Custom Access Token Hook
  // injects society_id/role into the JWT, but getUser() returns the stored user
  // record, where those claims are absent. Gating the sidebar on
  // meta.society_id alone therefore hid the nav for every real member.
  //
  // An active membership row is the fact we actually care about, and this layout
  // already fetches it, so we prefer the JWT claim when present and fall back to
  // the membership that RLS just confirmed.
  const societyId = meta.society_id ?? memberships[0]?.society_id ?? null;

  // PRE-SOCIETY STATE (onboarding, joining). Every sidebar destination is
  // society-scoped and redirects straight back here without one, so the nav
  // would be seven links that cannot go anywhere. Deliberately a RULE rather
  // than a list of onboarding routes — a blacklist rots when a screen is added.
  // These screens carry their own header, so nothing is lost.
  if (!societyId) {
    return <main id="main-content">{children}</main>;
  }

  const activeMembership = memberships.find((m) => m.society_id === societyId);
  const resolvedSocietyName =
    meta.society_name ??
    activeMembership?.society_name ??
    memberships[0]?.society_name ??
    "Your Society";

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
        role={role}
        fullName={fullName}
        flatLabel={flatLabel}
        memberships={memberships}
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
        Skip to content
      </a>
      <SidebarInset id="main-content">
        {/* Narrow-viewport hamburger trigger — the sidebar collapses to an
            offcanvas sheet below the md breakpoint, opened via this button. */}
        <div className="md:hidden p-2">
          <SidebarTrigger aria-label="Open navigation" />
        </div>
        {children}
      </SidebarInset>
    </SidebarProvider>
  );
}
