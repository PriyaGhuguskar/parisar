// apps/mobile/lib/notification-route.js
// Where a tapped push notification may take the user.
//
// The payload's `screen` is data from the network, so it is never pushed into
// the router as-is: only known in-app detail/list routes are accepted, ids are
// restricted to a safe charset, and anything else is ignored (the app simply
// opens where it was).
//
// Producers (supabase/functions/*-fanout):
//   booking-ack-fanout   → /(protected)/(tabs)/bookings
//   flat-action-fanout   → /(protected)/(tabs)/flat-actions/{id}
//   notification-fanout  → /(protected)/(tabs)/notices/{id}
//   push-fanout (legacy) → /complaints/{id} + complaintId
//
// JavaScript only — no TypeScript per CLAUDE.md.

const TABS_PREFIX = "/(protected)/(tabs)";

// Feature folders a notification may open, list or `/{id}` detail.
const ALLOWED_SECTIONS = new Set([
  "bookings",
  "complaints",
  "flat-actions",
  "notices",
  "polls",
  "community",
  "visitors",
]);

// Every routable id (complaint, notice, flat action, post, …) is a uuid.
const ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function sectionRoute(section, id) {
  if (!ALLOWED_SECTIONS.has(section)) return null;
  if (id == null || id === "") return `${TABS_PREFIX}/${section}`;
  return ID_RE.test(id) ? `${TABS_PREFIX}/${section}/${id}` : null;
}

/** Validate a `screen` path; returns the canonical in-app route or null. */
export function routeForScreen(screen) {
  if (typeof screen !== "string" || screen.length > 200) return null;
  const path = screen.split(/[?#]/)[0];
  const rel = path.startsWith(`${TABS_PREFIX}/`) ? path.slice(TABS_PREFIX.length) : path;
  // rel is now "/section" or "/section/id" (legacy payloads omit the groups).
  const m = /^\/([a-z-]+)(?:\/([^/]+))?\/?$/.exec(rel);
  if (!m) return null;
  return sectionRoute(m[1], m[2] ?? null);
}

/**
 * @param {Record<string, unknown>|null|undefined} data notification content.data
 * @returns {string|null} a safe route, or null when the payload is unknown
 */
export function routeForNotification(data) {
  if (!data || typeof data !== "object") return null;
  const fromScreen = routeForScreen(data.screen);
  if (fromScreen) return fromScreen;
  // Legacy Phase 4 payload: only a complaint id.
  if (typeof data.complaintId === "string") return sectionRoute("complaints", data.complaintId);
  return null;
}
