// apps/web/components/AppSidebar.jsx
// Project-specific Sidebar composition.
//
//   SidebarHeader  = wordmark + SocietySwitcherDropdown
//   SidebarContent = society navigation, grouped
//   SidebarFooter  = ProfileMenuDropdown trigger (avatar)
//
// Pitfall 4 — usePathname() is client-only, so this file is "use client". The
// parent (protected)/layout.jsx stays a Server Component; it reads the
// sidebar_state cookie there and passes defaultOpen to SidebarProvider, which
// prevents the open/closed flash on hydration. The layout also fetches the
// identity bits + memberships and passes them as props.
//
// The layout does NOT render this at all when the user has no society yet —
// every destination below is society-scoped, so during onboarding the nav would
// be seven links that bounce straight back.
//
// VISUAL NOTES (this pass):
//   · A wordmark now sits above the society switcher. Previously the first thing
//     in the sidebar was a switcher reading "Society", so the product had no name
//     anywhere in the signed-in app.
//   · Nav is grouped by role (lib/nav/sidebarNav.js): authorities get the brief's
//     Society Admin groups, residents a shorter set. Anything the society has
//     switched off (my_society_features) or that has no module is not rendered.
//   · The active item carries a brand tint AND a left accent bar, not colour
//     alone — the same rule used for status elsewhere in the product.
//
// JavaScript only — no TypeScript per CLAUDE.md.

"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { resetDashboardSummary } from "../lib/dashboard-summary-store";
import { buildSidebarNav } from "../lib/nav/sidebarNav";
import { useSocietyFeatures } from "../lib/nav/useSocietyFeatures";
import { createSupabaseBrowserClient } from "../lib/supabase/client";
import { ProfileMenuDropdown } from "./dashboard/ProfileMenuDropdown";
import { SocietySwitcherDropdown } from "./dashboard/SocietySwitcherDropdown";
import { SosButton } from "./sos/SosButton";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "./ui/sidebar";

/**
 * @param {object} props
 * @param {string} props.userId
 * @param {string|null} props.societyId
 * @param {string} props.role
 * @param {string} props.fullName
 * @param {string|undefined} [props.flatLabel]
 * @param {Array<{society_id: string, society_name: string}>} [props.memberships]
 * @param {boolean} [props.tokenStale]  my_active_society() says the access
 *   token predates a switch / role change → refresh it once on mount.
 *
 * Note: the active society NAME is derived inside SocietySwitcherDropdown from
 * the memberships list, so AppSidebar does not need a societyName prop.
 */
export function AppSidebar({
  userId,
  societyId,
  role,
  fullName,
  flatLabel,
  memberships = [],
  tokenStale = false,
}) {
  const pathname = usePathname();
  const router = useRouter();
  const { t } = useTranslation("dashboard"); // switcher.* stays in the dashboard shard
  const { t: tn } = useTranslation("staff-nav");
  const p = pathname || "";
  const [isSwitching, setIsSwitching] = useState(false);
  const [switchError, setSwitchError] = useState(null);
  const refreshedStaleToken = useRef(false);

  // The server resolved the active society from the database, but the cookie's
  // JWT (which RLS reads) was issued before a switch / role change. Re-issue it
  // once so RLS and the UI agree, then re-render the server tree.
  useEffect(() => {
    if (!tokenStale || refreshedStaleToken.current) return;
    refreshedStaleToken.current = true;
    const supabase = createSupabaseBrowserClient();
    supabase.auth
      .refreshSession()
      .then(({ error }) => {
        if (!error) router.refresh();
      })
      .catch(() => {
        // Non-fatal: the next natural token refresh picks up the new claims.
      });
  }, [tokenStale, router]);

  // Society switch: persist the choice server-side (set_active_society), then
  // refresh the session so the Auth Hook re-issues society_id/role in the JWT,
  // drop cached per-society client state, and re-render the server tree.
  async function handleSwitchSociety(nextSocietyId) {
    if (!nextSocietyId || nextSocietyId === societyId || isSwitching) return;
    setIsSwitching(true);
    setSwitchError(null);
    try {
      const supabase = createSupabaseBrowserClient();
      const { error } = await supabase.rpc("set_active_society", {
        p_society_id: nextSocietyId,
      });
      if (error) throw error;
      const { error: refreshError } = await supabase.auth.refreshSession();
      if (refreshError) throw refreshError;
      resetDashboardSummary();
      router.push("/dashboard");
      router.refresh();
    } catch (err) {
      console.error("[AppSidebar] society switch failed:", err?.message ?? err);
      setSwitchError(t("switcher.error"));
    } finally {
      setIsSwitching(false);
    }
  }

  // Role- and feature-driven groups (lib/nav/sidebarNav.js). Items for modules the
  // society has switched off, or that do not exist, are never rendered.
  const features = useSocietyFeatures(societyId);
  const groups = buildSidebarNav({ role, isEnabled: features.isEnabled, pathname: p });

  function renderItem({ id, href, icon: Icon, active }) {
    const label = tn(`nav.${id}`);
    return (
      <SidebarMenuItem key={href}>
        {/* This project's shadcn layer is built on @base-ui/react, which composes
            via the `render` prop — NOT Radix's `asChild`. Passing `asChild` left
            it unconsumed, so React forwarded it to the DOM <button> and the
            <Link> rendered as a child instead of AS the button. */}
        <SidebarMenuButton
          render={<Link href={href} aria-current={active ? "page" : undefined} />}
          isActive={active}
          className="group/nav relative min-h-11 gap-3 rounded-[8px] px-3 text-[13.5px] font-medium transition-colors md:min-h-9"
          style={
            active
              ? {
                  backgroundColor: "var(--color-brand-50)",
                  color: "var(--color-brand-700)",
                }
              : { color: "var(--color-neutral-600)" }
          }
        >
          {/* Accent bar: state is carried by shape as well as colour. */}
          <span
            aria-hidden="true"
            className="absolute left-0 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-r-full transition-opacity"
            style={{
              backgroundColor: "var(--color-brand-500)",
              opacity: active ? 1 : 0,
            }}
          />
          <Icon size={17} strokeWidth={active ? 2.2 : 1.8} />
          <span>{label}</span>
        </SidebarMenuButton>
      </SidebarMenuItem>
    );
  }

  return (
    <Sidebar collapsible="offcanvas">
      <SidebarHeader className="gap-3 px-3 pt-4">
        <span className="flex items-center gap-2.5 px-1">
          <span
            className="flex h-8 w-8 items-center justify-center rounded-[10px]"
            style={{ color: "#fff" }}
          >
            <Image
              src="/parisar-mark-96.png"
              alt=""
              aria-hidden="true"
              width={32}
              height={32}
              className="h-full w-full object-contain"
            />
          </span>
          <span
            className="text-[17px] font-bold tracking-[-0.02em]"
            style={{ color: "var(--color-neutral-900)" }}
          >
            Parisar
          </span>
        </span>

        <div aria-busy={isSwitching || undefined}>
          <SocietySwitcherDropdown
            memberships={memberships}
            activeSocietyId={societyId}
            onSelect={handleSwitchSociety}
          />
          {switchError ? (
            <p role="alert" className="mt-1 text-xs" style={{ color: "var(--color-danger)" }}>
              {switchError}
            </p>
          ) : null}
        </div>

        {/* Emergency SOS — reachable from every page, not just home. */}
        {societyId && features.isEnabled("sos") ? (
          <SosButton
            societyId={societyId}
            triggerClassName="mt-1 flex w-full items-center justify-center gap-2 rounded-lg px-3 py-2 text-[13px] font-semibold text-white transition-transform active:scale-[0.99]"
          />
        ) : null}
      </SidebarHeader>

      <SidebarContent className="px-3 pt-2">
        <nav aria-label={tn("nav.label")} className="flex flex-col gap-4 pb-4">
          {groups.map((group) => (
            <section key={group.id} aria-labelledby={`nav-group-${group.id}`}>
              <h2
                id={`nav-group-${group.id}`}
                className={
                  group.id === "main"
                    ? "sr-only"
                    : "type-caption mb-1 px-3 font-medium text-muted-foreground"
                }
              >
                {tn(`group.${group.id}`)}
              </h2>
              <SidebarMenu className="gap-0.5">{group.items.map(renderItem)}</SidebarMenu>
            </section>
          ))}
          {features.status === "error" ? (
            <output className="block px-3">
              <p className="type-body-sm text-muted-foreground">{tn("nav.featuresFailed")}</p>
              <button
                type="button"
                onClick={features.retry}
                className="focus-ring mt-1 inline-flex min-h-11 items-center text-[13px] font-semibold text-primary underline underline-offset-4"
              >
                {tn("nav.retry")}
              </button>
            </output>
          ) : null}
        </nav>
      </SidebarContent>

      <SidebarFooter className="px-3 pb-4">
        <ProfileMenuDropdown
          userId={userId}
          societyId={societyId}
          role={role}
          fullName={fullName}
          flatLabel={flatLabel}
        />
      </SidebarFooter>
    </Sidebar>
  );
}
