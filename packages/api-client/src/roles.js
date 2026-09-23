// Every role Parisar has, the surface each one lands on, and that surface's
// route id.
//
// WHY THIS FILE EXISTS. Role knowledge was scattered: `new Set(["board_member",
// "co_secretary","secretary"])` is copy-pasted into a dozen components, the
// platform roles live only in Postgres, and `apps/web/lib/role-tiles.js` and
// `apps/mobile/lib/role-tiles.js` are kept in step by hand. Six roles across two
// apps makes that unsustainable — the first time one app learns about a role and
// the other doesn't, you get a user who can sign in and reach nothing.
//
// SURFACES, NOT URLS. resolveHomeSurface() returns a stable key, not an href.
// Web mounts these under /c/<routeId>; mobile mounts them as Expo Router groups.
// The DECISION — which surface does this role get — is shared; the URL shape
// stays each app's own business, the same split role-tiles.js already uses.
//
// ABOUT ROUTE IDS AND SECURITY. The ids below are opaque so that /admin and
// /sales are not sitting at guessable paths for anything crawling the origin.
// That is the ONLY thing they buy. They are not a secret and they are not an
// authorisation check: every id is visible in the URL bar of anyone who reaches
// it, and in this file, which ships to the client. The real control is the
// server-side gate on each route — is_platform_admin(), is_platform_admin_or_sales(),
// is_platform_user(), or the society_guards lookup — which re-reads the database
// on every request and redirects on failure. Treat a route id as a name, never
// as a password. Never add a role whose only protection is that nobody guessed
// its id.

/** Platform-level roles. Mirrors the `public.platform_role` enum. */
export const PLATFORM_ROLE = {
  ADMIN: "admin",
  SALES: "sales",
  STAFF: "staff",
};

/** Society-level roles. Mirrors the `public.membership_role` enum. */
export const MEMBERSHIP_ROLE = {
  MEMBER: "member",
  BOARD_MEMBER: "board_member",
  CO_SECRETARY: "co_secretary",
  SECRETARY: "secretary",
};

// A guard is not a membership and not a platform user — they have no row in
// either table's role column. This is the literal string the Auth Hook
// (inject_society_claims) writes into app_metadata.role for them, alongside a
// NULL society_id and a separate guard_society_id claim.
export const GUARD_ROLE = "guard";

/**
 * Society roles that may act on other people's items — respond to complaints,
 * moderate posts, see the full complaint list rather than only their own.
 *
 * NOTE: `board_member` is in here and NOT in SOCIETY_ADMIN_ROLES. That split is
 * the existing product rule, not an oversight: a board member responds, a
 * secretary administers.
 */
export const BOARD_ROLES = new Set([
  MEMBERSHIP_ROLE.BOARD_MEMBER,
  MEMBERSHIP_ROLE.CO_SECRETARY,
  MEMBERSHIP_ROLE.SECRETARY,
]);

/**
 * Society roles that administer the society itself — setup, code rotation, flat
 * actions, appointing guards.
 *
 * Named SOCIETY_ADMIN_ROLES rather than the ADMIN_ROLES used in role-tiles.js
 * because "admin" now also means a platform role. A secretary is not a Parisar
 * admin and a Parisar admin is not a secretary; the longer name stops the two
 * from being confused at a glance.
 */
export const SOCIETY_ADMIN_ROLES = new Set([
  MEMBERSHIP_ROLE.CO_SECRETARY,
  MEMBERSHIP_ROLE.SECRETARY,
]);

const PLATFORM_ROLES = new Set(Object.values(PLATFORM_ROLE));

/**
 * True for a Parisar staff role (admin, sales or staff) — someone who belongs to
 * no society. Says nothing about what they may DO; capability lives in the
 * database helpers, never here.
 *
 * @param {string|null|undefined} role
 * @returns {boolean}
 */
export function isPlatformRole(role) {
  return PLATFORM_ROLES.has(role);
}

// ---------------------------------------------------------------------------
// Surfaces — one per dashboard.
//
// SECRETARY and RESIDENT are separate surfaces even though both are served by
// society members. They branch heavily already (getRoleTiles swaps roughly half
// the tile set), and giving each its own entry point means a route gate can say
// "secretaries only" instead of every page re-deriving that from the role.
// ---------------------------------------------------------------------------
export const SURFACE = {
  CONSOLE_ADMIN: "console-admin",
  CONSOLE_SALES: "console-sales",
  CONSOLE_STAFF: "console-staff",
  SECRETARY: "secretary",
  RESIDENT: "resident",
  SECURITY: "security",
  ONBOARDING: "onboarding",
};

/**
 * Opaque route ids. Read the "ABOUT ROUTE IDS AND SECURITY" note at the top of
 * this file before relying on these for anything.
 *
 * These are a DURABLE CONTRACT once shipped, for the same reason tile keys are
 * (DT-02): they end up in bookmarks, in support tickets, in the OTP redirect,
 * and in whatever a user has pinned. Changing one silently 404s people who had
 * the old link. Add ids; do not edit them.
 */
export const ROUTE_ID = {
  [SURFACE.CONSOLE_ADMIN]: "k7m2x9",
  [SURFACE.CONSOLE_SALES]: "p4v8qd",
  [SURFACE.CONSOLE_STAFF]: "t6r3wz",
  [SURFACE.SECRETARY]: "b9n5hj",
  [SURFACE.RESIDENT]: "c2f7ly",
  [SURFACE.SECURITY]: "g8s4muv",
};

// Both lookup tables below are consulted with Object.hasOwn rather than a bare
// index. A plain object inherits from Object.prototype, so `TABLE["constructor"]`
// returns a *function* — truthy, so `?? fallback` never fires and the caller
// gets a function where it expected a surface name. Role and route id are both
// attacker-influenced strings (a JWT claim, a URL segment), so this is reachable,
// not theoretical.

/** Reverse lookup, built once. Unknown ids resolve to null. */
const SURFACE_BY_ROUTE_ID = Object.fromEntries(
  Object.entries(ROUTE_ID).map(([surface, id]) => [id, surface]),
);

const SURFACE_BY_ROLE = {
  [PLATFORM_ROLE.ADMIN]: SURFACE.CONSOLE_ADMIN,
  [PLATFORM_ROLE.SALES]: SURFACE.CONSOLE_SALES,
  [PLATFORM_ROLE.STAFF]: SURFACE.CONSOLE_STAFF,
  [GUARD_ROLE]: SURFACE.SECURITY,
  [MEMBERSHIP_ROLE.SECRETARY]: SURFACE.SECRETARY,
  [MEMBERSHIP_ROLE.CO_SECRETARY]: SURFACE.SECRETARY,
  [MEMBERSHIP_ROLE.BOARD_MEMBER]: SURFACE.RESIDENT,
  [MEMBERSHIP_ROLE.MEMBER]: SURFACE.RESIDENT,
};

/**
 * Where a signed-in user belongs, given their role.
 *
 * Returns ONBOARDING for an unknown or absent role rather than defaulting to the
 * resident surface. Someone whose role we cannot name has not finished joining a
 * society, and sending them to a dashboard that renders empty reads as a broken
 * app. Treat ONBOARDING as "we don't know yet", not as an error.
 *
 * @param {string|null|undefined} role
 * @returns {string} one of SURFACE
 */
export function resolveHomeSurface(role) {
  if (typeof role !== "string" || !Object.hasOwn(SURFACE_BY_ROLE, role)) {
    return SURFACE.ONBOARDING;
  }
  return SURFACE_BY_ROLE[role];
}

/**
 * The route id a role should be sent to, or null when there is no surface for
 * them yet (onboarding has a fixed path in each app, not an id).
 *
 * @param {string|null|undefined} role
 * @returns {string|null}
 */
export function resolveHomeRouteId(role) {
  return ROUTE_ID[resolveHomeSurface(role)] ?? null;
}

/**
 * Resolve a route id back to its surface. Returns null for anything unknown, so
 * a gate can treat a typo and an unauthorised id identically — both redirect,
 * neither confirms whether the id was real.
 *
 * @param {string|null|undefined} routeId
 * @returns {string|null}
 */
export function surfaceFromRouteId(routeId) {
  if (typeof routeId !== "string" || !Object.hasOwn(SURFACE_BY_ROUTE_ID, routeId)) {
    return null;
  }
  return SURFACE_BY_ROUTE_ID[routeId];
}

/**
 * True when `role` may open `surface`. Used by route gates so a guard typing a
 * secretary's route, or a sales user typing the admin one, is bounced to their
 * own surface instead of rendering an empty shell.
 *
 * This is a convenience for redirect logic, NOT the authorisation boundary —
 * role here comes from a JWT claim the client can see. The database helpers
 * remain the thing that decides whether data crosses the wire.
 *
 * @param {string|null|undefined} role
 * @param {string} surface one of SURFACE
 * @returns {boolean}
 */
export function canAccessSurface(role, surface) {
  return resolveHomeSurface(role) === surface;
}
