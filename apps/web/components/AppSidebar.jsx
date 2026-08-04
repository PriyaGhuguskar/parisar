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
//   · Nav is split into two groups. The main six are places you GO; Profile is
//     your account. Mixing them made Profile look like a seventh society screen.
//   · The active item carries a brand tint AND a left accent bar, not colour
//     alone — the same rule used for status elsewhere in the product.
//
// JavaScript only — no TypeScript per CLAUDE.md.

"use client";

import {
  BarChart3,
  Bell,
  Building2,
  Calendar,
  CalendarClock,
  DoorOpen,
  LayoutDashboard,
  MessageSquareWarning,
  User,
  UserRound,
  Users2,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslation } from "react-i18next";
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
 *
 * Note: the active society NAME is derived inside SocietySwitcherDropdown from
 * the memberships list, so AppSidebar does not need a societyName prop.
 */
export function AppSidebar({ userId, societyId, role, fullName, flatLabel, memberships = [] }) {
  const pathname = usePathname();
  const { t } = useTranslation("dashboard");
  const { t: tv } = useTranslation("auth"); // visitor.* live in the flat "auth" file
  const p = pathname || "";

  // Built inside the component so locale changes refresh the labels (Plan 07-06).
  const SOCIETY_NAV = [
    { href: "/dashboard", label: t("nav.home"), icon: LayoutDashboard, active: p === "/dashboard" },
    {
      href: "/my-complaints",
      label: t("nav.myComplaints"),
      icon: MessageSquareWarning,
      active: p.startsWith("/my-complaints"),
    },
    { href: "/notices", label: t("tiles.notices"), icon: Bell, active: p.startsWith("/notices") },
    { href: "/polls", label: t("tiles.polls"), icon: BarChart3, active: p.startsWith("/polls") },
    {
      href: "/bookings",
      label: t("tiles.bookings"),
      icon: Calendar,
      active: p.startsWith("/bookings"),
    },
    {
      href: "/community",
      label: t("tiles.community"),
      icon: Users2,
      active: p.startsWith("/community"),
    },
    {
      href: "/visitors",
      label: tv("visitor.inboxTitle"),
      icon: DoorOpen,
      active: p.startsWith("/visitors"),
    },
    {
      href: "/staff",
      label: tv("staff.title"),
      icon: UserRound,
      active: p.startsWith("/staff"),
    },
    {
      href: "/facilities",
      label: tv("facility.title"),
      icon: CalendarClock,
      active: p.startsWith("/facilities"),
    },
  ];

  // Society profile is the secretary/co-secretary management hub (wings, guards,
  // amenities) — shown only to them, right above their personal Profile.
  const isManager = role === "secretary" || role === "co_secretary";
  const ACCOUNT_NAV = [
    ...(isManager
      ? [
          {
            href: "/society",
            label: tv("profile.societyProfile"),
            icon: Building2,
            active: p.startsWith("/society"),
          },
        ]
      : []),
    { href: "/profile", label: t("nav.profile"), icon: User, active: p === "/profile" },
  ];

  function renderItem({ href, label, icon: Icon, active }) {
    return (
      <SidebarMenuItem key={href}>
        {/* This project's shadcn layer is built on @base-ui/react, which composes
            via the `render` prop — NOT Radix's `asChild`. Passing `asChild` left
            it unconsumed, so React forwarded it to the DOM <button> and the
            <Link> rendered as a child instead of AS the button. */}
        <SidebarMenuButton
          render={<Link href={href} aria-current={active ? "page" : undefined} />}
          isActive={active}
          className="group/nav relative h-10 gap-3 rounded-[10px] px-3 text-[14px] font-semibold transition-colors"
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
          <Icon size={18} strokeWidth={active ? 2.4 : 2} />
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
            style={{ backgroundColor: "var(--color-brand-500)", color: "#fff" }}
          >
            <Building2 size={16} strokeWidth={2.3} aria-hidden="true" />
          </span>
          <span
            className="text-[17px] font-extrabold tracking-[-0.03em]"
            style={{ color: "var(--color-neutral-900)" }}
          >
            Parisar
          </span>
        </span>

        <SocietySwitcherDropdown
          memberships={memberships}
          activeSocietyId={societyId}
          onSelect={() => {
            // Visual-only stub per user decision #1 — Phase 8 wires the real
            // switch (JWT refresh so society_id changes; threat T-04.1-01).
            // PAR-100: removed console.log that leaked the society UUID.
          }}
        />

        {/* Emergency SOS — reachable from every page, not just home. */}
        {societyId ? (
          <SosButton
            societyId={societyId}
            triggerClassName="mt-1 flex w-full items-center justify-center gap-2 rounded-xl px-3 py-2.5 text-[14px] font-extrabold text-white transition-transform active:scale-[0.99]"
          />
        ) : null}
      </SidebarHeader>

      <SidebarContent className="px-3 pt-2">
        <SidebarMenu className="gap-1">{SOCIETY_NAV.map(renderItem)}</SidebarMenu>

        {/* Divider before the account group: Profile is not a seventh society
            screen, and grouping says so without needing a label. */}
        <span
          aria-hidden="true"
          className="mx-1 my-3 block h-px"
          style={{ backgroundColor: "var(--color-neutral-200)" }}
        />

        <SidebarMenu className="gap-1">{ACCOUNT_NAV.map(renderItem)}</SidebarMenu>
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
