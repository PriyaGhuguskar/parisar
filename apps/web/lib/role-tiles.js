// apps/web/lib/role-tiles.js
// Web mirror of apps/mobile/lib/role-tiles.js — same shape, lucide-react icons,
// Next.js href routes.
//
// Per user decision (Phase 04.1 PLAN iteration 2): Member and Board Member
// both receive the SAME six placeholder tiles including Staff. Admin roles
// (secretary, co_secretary) swap Staff for Flat Actions so the tile count
// stays at 11.
//
// JavaScript only — no TypeScript per CLAUDE.md.

import {
  AlertCircle,
  BarChart3,
  Bell,
  Calendar,
  Car,
  ClipboardCheck,
  Key,
  MessageSquareWarning,
  RotateCcw,
  UserCheck,
  Users,
  Users2,
} from "lucide-react";

const BOARD_ROLES = new Set(["board_member", "co_secretary", "secretary"]);
const ADMIN_ROLES = new Set(["co_secretary", "secretary"]);

// Web routes — verified against apps/web/app/(protected)/ in Phase 04.1 Wave 0.
// my-complaints has no dedicated web route in Phase 4 (mobile-only). Until
// Phase 7 delivers web parity, point members at /complaints (RLS filters to
// their own complaints anyway). TODO marked in role-tiles.js so Phase 7 catches it.
const ROUTES = {
  allComplaints: "/complaints",
  myComplaints: "/complaints", // TODO Phase 7: dedicated /my-complaints when web parity ships
  directory: "/dashboard/directory",
  societyCode: "/dashboard/code-rotation",
  codeRotation: "/dashboard/code-rotation",
  reviews: "/dashboard/review-queue",
  // Phase 5 (DT-02) — notices/polls/bookings flipped live with web hrefs.
  notices: "/notices",
  polls: "/polls",
  bookings: "/bookings",
  // Phase 6 (DT-02) — community (all roles) + flatActions (admin) flipped live.
  community: "/community",
  flatActions: "/flat-actions",
};

/**
 * @param {string|undefined} role
 * @returns {Array<{key: string, labelKey: string, icon: any, route: string|null, live: boolean, phase: number|null, badge: string|null}>}
 */
export function getRoleTiles(role) {
  const isBoard = BOARD_ROLES.has(role);
  const isAdmin = ADMIN_ROLES.has(role);

  const tiles = [];

  // === LIVE tiles ===

  if (isBoard) {
    tiles.push({
      key: "allComplaints",
      labelKey: "tiles.allComplaints",
      icon: MessageSquareWarning,
      route: ROUTES.allComplaints,
      live: true,
      phase: null,
      badge: null,
    });
  } else {
    tiles.push({
      key: "myComplaints",
      labelKey: "tiles.myComplaints",
      icon: MessageSquareWarning,
      route: ROUTES.myComplaints,
      live: true,
      phase: null,
      badge: null,
    });
  }

  if (isAdmin) {
    tiles.push({
      key: "reviews",
      labelKey: "tiles.reviews",
      icon: ClipboardCheck,
      route: ROUTES.reviews,
      live: true,
      phase: null,
      badge: "pending_reviews",
    });
  }

  tiles.push({
    key: "directory",
    labelKey: "tiles.directory",
    icon: Users,
    route: ROUTES.directory,
    live: true,
    phase: null,
    badge: null,
  });

  // WR-02 (intentional): admin tiles `societyCode` and `codeRotation` both
  // route to /dashboard/code-rotation. Per DT-02 (Phase 04.1 forward-compat
  // contract), tile keys MUST NOT change once shipped — so collapsing them
  // is not an option. We differentiate via badges only:
  //   - societyCode:  no badge — the "read the current code" glance. All roles
  //                   see it; the screen reveals the code + share button.
  //   - codeRotation: {N}d warning-500 badge when daysUntilRotation < 7. ADMIN
  //                   ONLY — the "rotation health" glance for Secretary /
  //                   Co-Secretary to act on an imminent rotation.
  // See UI-SPEC §Role-Aware Tile Set §WR-02 reconciliation.
  tiles.push({
    key: "societyCode",
    labelKey: "tiles.societyCode",
    icon: Key,
    route: ROUTES.societyCode,
    live: true,
    phase: null,
    badge: null,
  });

  if (isAdmin) {
    tiles.push({
      key: "codeRotation",
      labelKey: "tiles.codeRotation",
      icon: RotateCcw,
      route: ROUTES.codeRotation,
      live: true,
      phase: null,
      badge: "days_until_rotation",
    });
  }

  // === PLACEHOLDER tiles (6 per role) ===

  // === DT-02 (Phase 5) — notices/polls/bookings flipped LIVE ===
  // key/icon/labelKey are UNCHANGED (DT-02 durable contract); only live + route +
  // badge change, and phase drops to null.
  //   - notices: unread badge deferred (no read-marker table yet, 05-03 fast-follow)
  //     → null for all roles; flip to "unread_notices" when the marker lands.
  //   - polls:   null badge (open-unvoted count is a future fast-follow).
  //   - bookings: pending-queue count for board roles (DashboardClient wires it);
  //     members get no badge (their bookings are not an action queue).
  tiles.push({
    key: "notices",
    labelKey: "tiles.notices",
    icon: Bell,
    route: ROUTES.notices,
    live: true,
    phase: null,
    badge: null,
  });
  tiles.push({
    key: "polls",
    labelKey: "tiles.polls",
    icon: BarChart3,
    route: ROUTES.polls,
    live: true,
    phase: null,
    badge: null,
  });
  tiles.push({
    key: "bookings",
    labelKey: "tiles.bookings",
    icon: Calendar,
    route: ROUTES.bookings,
    live: true,
    phase: null,
    badge: isBoard ? "pending_bookings" : null,
  });
  // === DT-02 (Phase 6) — community (all roles) + flatActions (admin) flipped LIVE ===
  // key/icon/labelKey are UNCHANGED (DT-02 durable contract); only live + route
  // change, and phase drops to null. No badge in v1 (UI-SPEC §Tile Activation).
  tiles.push({
    key: "community",
    labelKey: "tiles.community",
    icon: Users2,
    route: ROUTES.community,
    live: true,
    phase: null,
    badge: null,
  });

  if (isAdmin) {
    tiles.push({
      key: "flatActions",
      labelKey: "tiles.flatActions",
      icon: AlertCircle,
      route: ROUTES.flatActions,
      live: true,
      phase: null,
      badge: null,
    });
  }

  tiles.push({
    key: "visitors",
    labelKey: "tiles.visitors",
    icon: Car,
    route: null,
    live: false,
    phase: 9,
    badge: null,
  });

  if (!isAdmin) {
    tiles.push({
      key: "staff",
      labelKey: "tiles.staff",
      icon: UserCheck,
      route: null,
      live: false,
      phase: 10,
      badge: null,
    });
  }

  return tiles;
}

// === Code-rotation badge helpers (D-05) ===
// Mirror of apps/mobile/lib/role-tiles.js. society_codes has NO rotates_at
// column today (Wave 0 audit §4) and rotation is manual, so the DashboardClient
// passes `null` and the badge is hidden (graceful degradation). Helpers are pure
// + fully covered so a future rotation timestamp lights the badge up unchanged.

/**
 * Days until the society code rotates, rounded UP, clamped to >= 0.
 * @param {string|number|Date|null|undefined} rotatesAt
 * @param {number} [nowMs] - injectable for testing; defaults to Date.now()
 * @returns {number|null} days until rotation; null when rotatesAt is missing/invalid
 */
export function computeDaysUntilRotation(rotatesAt, nowMs = Date.now()) {
  if (!rotatesAt) return null;
  const ts = typeof rotatesAt === "number" ? rotatesAt : new Date(rotatesAt).getTime();
  if (Number.isNaN(ts)) return null;
  const diffMs = ts - nowMs;
  return Math.max(0, Math.ceil(diffMs / 86400000));
}

/**
 * Badge text for the days-until-rotation pill. Shows "{N}d" only when the code
 * rotates in under 7 days; hides the badge otherwise (UI-SPEC: < 7 only).
 * @param {number|null|undefined} days
 * @returns {string|null} e.g. "5d"; null when the badge should be hidden
 */
export function daysUntilRotationToBadge(days) {
  if (days === null || days === undefined) return null;
  if (days < 0 || days >= 7) return null;
  return `${days}d`;
}
