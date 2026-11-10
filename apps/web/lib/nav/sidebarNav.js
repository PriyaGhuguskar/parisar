// Sidebar navigation, by role and by the society's switched-on features.
//
// Groups follow the brief's Society Admin layout (Society, Residents, Security,
// Finance, Services, Communication, Documents, Reports, Settings). Only items with a
// real route are listed. Finance, Documents and Reports have no module, so they
// never render; HIDDEN_NAV_ITEMS records what is missing (docs/onboarding/REPORT.md).
//
// Labels are `nav.*` keys in the staff-nav i18n shard. Pure module: no React, so it
// is unit-tested directly (lib/nav/__tests__/sidebarNav.test.js).
//
// JavaScript only — no TypeScript per CLAUDE.md.

import {
  BarChart3,
  Bell,
  Building2,
  CalendarCheck,
  CalendarClock,
  ClipboardCheck,
  ClipboardList,
  DoorOpen,
  FileSpreadsheet,
  Gavel,
  Home,
  IdCard,
  KeyRound,
  LayoutDashboard,
  MessageSquareWarning,
  Repeat,
  ShieldCheck,
  SlidersHorizontal,
  User,
  UserCheck,
  UserRound,
  Users,
  Users2,
  UsersRound,
  Wrench,
} from "lucide-react";

export const MANAGER_ROLES = new Set(["secretary", "co_secretary"]);
export const BOARD_ROLES = new Set(["board_member", "co_secretary", "secretary"]);

/** Core features are on for every society, so they show while the list loads. */
export const CORE_FEATURES = new Set(["notices", "complaints", "sos"]);

/**
 * Items the brief lists that have no real module. They are never rendered.
 * `group` is the brief's group; `reason` is for the report, not the UI.
 */
export const HIDDEN_NAV_ITEMS = Object.freeze([
  { group: "finance", item: "maintenance_dues", reason: "No accounting or dues module." },
  { group: "finance", item: "accounting", reason: "No accounting module (platform_feature_gaps)." },
  { group: "finance", item: "vendor_payments", reason: "No vendor module." },
  { group: "security", item: "parking", reason: "No parking module (platform_feature_gaps)." },
  { group: "security", item: "expected_visitors", reason: "No visitor pre-approval module." },
  { group: "security", item: "staff_attendance", reason: "No staff attendance module." },
  { group: "services", item: "vendors", reason: "No vendor module (platform_feature_gaps)." },
  { group: "communication", item: "events", reason: "No events module (platform_feature_gaps)." },
  { group: "documents", item: "society_documents", reason: "No society document library." },
  { group: "reports", item: "reports", reason: "No reports module." },
]);

// `feature`: society_features key that must be on. `roles`: who sees it ("manager",
// "board", "resident" = everyone with a flat). `exact`: active only on that path.
const ITEMS = {
  home: { href: "/dashboard", icon: LayoutDashboard, exact: true },
  societyDashboard: { href: "/society-dashboard", icon: ShieldCheck },
  societyProfile: { href: "/society", icon: Building2, exact: true },
  setup: { href: "/setup", icon: SlidersHorizontal },
  societyCode: { href: "/dashboard/code-rotation", icon: KeyRound },
  owners: { href: "/residents/owners", icon: Home },
  tenants: { href: "/residents/tenants", icon: KeyRound },
  family: { href: "/residents/family", icon: UsersRound },
  directory: { href: "/dashboard/directory", icon: Users, feature: "directory" },
  importResidents: { href: "/import", icon: FileSpreadsheet },
  verification: { href: "/verification/admin", icon: UserCheck },
  approvals: { href: "/approvals", icon: ClipboardCheck },
  joinRequests: { href: "/dashboard/review-queue", icon: ClipboardList },
  household: { href: "/household", icon: Users2 },
  visitors: { href: "/visitors", icon: DoorOpen, feature: "visitors" },
  staffManage: { href: "/staff/manage", icon: IdCard, feature: "staff_directory" },
  staffDirectory: { href: "/staff", icon: UserRound, feature: "staff_directory", exact: true },
  complaints: { href: "/complaints", icon: MessageSquareWarning, feature: "complaints" },
  myComplaints: { href: "/my-complaints", icon: MessageSquareWarning, feature: "complaints" },
  facilities: { href: "/facilities", icon: CalendarClock, feature: "facility_calendar" },
  bookings: { href: "/bookings", icon: CalendarCheck, feature: "bookings" },
  flatActions: { href: "/flat-actions", icon: Wrench, feature: "flat_actions" },
  notices: { href: "/notices", icon: Bell, feature: "notices" },
  polls: { href: "/polls", icon: BarChart3, feature: "polls" },
  community: { href: "/community", icon: Users2, feature: "community" },
  notifications: { href: "/settings/notifications", icon: Bell },
  grievanceOfficer: { href: "/settings/grievance-officer", icon: Gavel },
  roleTransfer: { href: "/dashboard/role-transfer", icon: Repeat, secretaryOnly: true },
  profile: { href: "/profile", icon: User, exact: true },
};

const MANAGER_GROUPS = [
  ["main", ["home"]],
  ["society", ["societyDashboard", "societyProfile", "setup", "societyCode"]],
  [
    "residents",
    [
      "owners",
      "tenants",
      "family",
      "directory",
      "importResidents",
      "verification",
      "approvals",
      "joinRequests",
      "household",
    ],
  ],
  ["security", ["visitors", "staffManage", "staffDirectory"]],
  ["services", ["complaints", "myComplaints", "facilities", "bookings", "flatActions"]],
  ["communication", ["notices", "polls", "community"]],
  ["settings", ["notifications", "grievanceOfficer", "roleTransfer", "profile"]],
];

const RESIDENT_GROUPS = (isBoard) => [
  ["main", ["home"]],
  ["myHome", ["myComplaints", "household", "visitors"]],
  ["services", [...(isBoard ? ["complaints"] : []), "facilities", "bookings", "staffDirectory"]],
  ["communication", ["notices", "polls", "community", "directory"]],
  ["settings", ["notifications", "profile"]],
];

/** The enabled keys from a my_society_features result, or null if it is not one. */
export function enabledFeatureKeys(result) {
  if (!Array.isArray(result)) return null;
  return new Set(result.filter((f) => f?.enabled).map((f) => f.key));
}

/** isEnabled(key) for a set of keys, falling back to core features when unknown. */
export function featureChecker(enabled) {
  return (key) => (enabled ? enabled.has(key) : CORE_FEATURES.has(key));
}

/** True when `pathname` is `href` or a page under it. */
export function matchesPath(href, pathname, exact = false) {
  if (!pathname) return false;
  if (pathname === href) return true;
  return !exact && pathname.startsWith(`${href}/`);
}

/**
 * @param {object} input
 * @param {string} input.role membership_role
 * @param {(key: string) => boolean} input.isEnabled whether a feature is on
 * @param {string} [input.pathname]
 * @returns {Array<{ id: string, items: Array<{ id: string, href: string, icon: any, active: boolean }> }>}
 */
export function buildSidebarNav({ role, isEnabled, pathname = "" }) {
  const isManager = MANAGER_ROLES.has(role);
  const groups = isManager ? MANAGER_GROUPS : RESIDENT_GROUPS(BOARD_ROLES.has(role));

  const built = groups
    .map(([id, keys]) => ({
      id,
      items: keys
        .map((key) => ({ id: key, ...ITEMS[key] }))
        .filter((item) => !item.feature || isEnabled(item.feature))
        .filter((item) => !item.secretaryOnly || role === "secretary"),
    }))
    .filter((group) => group.items.length > 0);

  // One active item: the longest route that matches, so /staff/manage does not
  // also light up /staff, and /dashboard/directory does not light up Home.
  let activeHref = null;
  for (const group of built) {
    for (const item of group.items) {
      if (matchesPath(item.href, pathname, item.exact)) {
        if (!activeHref || item.href.length > activeHref.length) activeHref = item.href;
      }
    }
  }

  return built.map((group) => ({
    id: group.id,
    items: group.items.map(({ id, href, icon }) => ({
      id,
      href,
      icon,
      active: href === activeHref,
    })),
  }));
}

/** Every route the sidebar can link to, for the route-existence check in QA. */
export function allNavHrefs() {
  return [...new Set(Object.values(ITEMS).map((item) => item.href))];
}
