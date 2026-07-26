// apps/mobile/lib/role-tiles.js
// Single source of truth for the role-aware dashboard tile set.
// Mirrors UI-SPEC §Role-Aware Tile Set tables and locks the forward-compat
// contract from Design Decision DT-02: phases 5-11 activate placeholders by
// flipping `live: false -> true` only; key, icon, labelKey must NOT change.
//
// Imports lucide-react-native icons. Web equivalent imports from lucide-react.
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
} from "lucide-react-native";

const BOARD_ROLES = new Set(["board_member", "co_secretary", "secretary"]);
const ADMIN_ROLES = new Set(["co_secretary", "secretary"]);

/**
 * Role-aware tile set.
 *
 * Per user decision (Phase 04.1 PLAN iteration 2): Member and Board Member
 * both receive the SAME six placeholder tiles, including Staff. Admin roles
 * (secretary, co_secretary) swap Staff for Flat Actions so the tile count
 * stays at 11.
 *
 *   member       -> 3 live + 6 placeholders = 9 tiles
 *   board_member -> 3 live + 6 placeholders = 9 tiles
 *   secretary    -> 5 live + 6 placeholders = 11 tiles
 *   co_secretary -> identical to secretary  = 11 tiles
 *
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
      route: "/(protected)/(tabs)/complaints",
      live: true,
      phase: null,
      badge: null,
    });
  } else {
    tiles.push({
      key: "myComplaints",
      labelKey: "tiles.myComplaints",
      icon: MessageSquareWarning,
      route: "/(protected)/(tabs)/my-complaints",
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
      route: "/(protected)/(tabs)/review-queue",
      live: true,
      phase: null,
      badge: "pending_reviews",
    });
  }

  tiles.push({
    key: "directory",
    labelKey: "tiles.directory",
    icon: Users,
    route: "/(protected)/(tabs)/directory",
    live: true,
    phase: null,
    badge: null,
  });

  // WR-02 (intentional): admin tiles `societyCode` and `codeRotation` both
  // route to /(protected)/(tabs)/code-rotation. Per DT-02 (Phase 04.1
  // forward-compat contract), tile keys MUST NOT change once shipped — so
  // collapsing them is not an option. We differentiate via badges only:
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
    route: "/(protected)/(tabs)/code-rotation",
    live: true,
    phase: null,
    badge: null,
  });

  if (isAdmin) {
    tiles.push({
      key: "codeRotation",
      labelKey: "tiles.codeRotation",
      icon: RotateCcw,
      route: "/(protected)/(tabs)/code-rotation",
      live: true,
      phase: null,
      badge: "days_until_rotation",
    });
  }

  // === PLACEHOLDER tiles (6 per role) ===

  // === DT-02 (Phase 5): notices / polls / bookings flipped LIVE in place. ===
  // Only `live`, `route`, `phase`, and `badge` change — key/icon/labelKey are the
  // durable DT-02 contract and MUST NOT change. Routes are (tabs)-nested to match
  // the existing live tiles (e.g. "/(protected)/(tabs)/complaints"). The web app's
  // lib/role-tiles.js uses the Next.js href form ("/notices") instead.
  tiles.push({
    key: "notices",
    labelKey: "tiles.notices",
    icon: Bell,
    route: "/(protected)/(tabs)/notices",
    live: true,
    phase: null,
    // notices badge ships NULL this phase — read-tracking (unread_notices) is a
    // deferred fast-follow (no notification_reads table in 05-01; markNoticeRead is
    // a documented no-op stub in 05-03). When read-tracking lands, flip to
    // badge: "unread_notices" (DashboardTile already supports the count). NOT a defect.
    badge: null,
  });
  tiles.push({
    key: "polls",
    labelKey: "tiles.polls",
    icon: BarChart3,
    route: "/(protected)/(tabs)/polls",
    live: true,
    phase: null,
    badge: null,
  });
  tiles.push({
    key: "bookings",
    labelKey: "tiles.bookings",
    icon: Calendar,
    route: "/(protected)/(tabs)/bookings",
    live: true,
    phase: null,
    // Board roles see a pending-bookings count; members have no action queue.
    badge: isBoard ? "pending_bookings" : null,
  });
  // === DT-02 (Phase 6): community / flatActions flipped LIVE in place. ===
  // Only `live`, `route`, `phase` change — key/icon/labelKey are the durable
  // DT-02 contract and MUST NOT change (04.1 §Role-Aware Tile Set). Routes are
  // (tabs)-nested to match the existing live tiles. The member-facing flat-actions
  // surface is route-only (a href:null screen reached via push deep-link + Home
  // entry) — there is intentionally NO member `flatActions` tile and NO 4th
  // bottom-nav tab (DT-02 durable tile contract). The web app's lib/role-tiles.js
  // uses the Next.js href form ("/community", "/flat-actions") instead.
  tiles.push({
    key: "community",
    labelKey: "tiles.community",
    icon: Users2,
    route: "/(protected)/(tabs)/community",
    live: true,
    phase: null,
    badge: null,
  });

  if (isAdmin) {
    // Admin-only issuer surface. The flatActions tile stays inside if(isAdmin)
    // (D-05): it is the Secretary/Co-Secretary issuer entry, not a member feature.
    tiles.push({
      key: "flatActions",
      labelKey: "tiles.flatActions",
      icon: AlertCircle,
      route: "/(protected)/(tabs)/flat-actions",
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
    // Member + Board both get Staff placeholder (per user decision — both
    // show the same 6 placeholders; Staff is hidden for admins only because
    // admins get Flat Actions in its slot to keep the total at 11 tiles).
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
// Used by the Home screen to compute the "{N}d" days-until-rotation pill on the
// admin Code Rotation tile.
//
// IMPORTANT (Wave 0 audit §4): society_codes has NO rotates_at column and the
// product has no scheduled-rotation policy — rotation is manual/on-demand. The
// Home screen therefore passes `null` for rotatesAt today, so the badge is
// HIDDEN (graceful degradation). These helpers are kept pure + fully covered so
// that when a future phase introduces a rotation timestamp, the badge lights up
// with zero logic change. Mirror in apps/web/lib/role-tiles.js.

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
