// Web's surface → href map.
//
// The shared module (packages/api-client/src/roles.js) decides WHICH surface a
// role gets. This file decides what that surface's URL looks like on the web.
// Mobile keeps its own equivalent with Expo Router paths — the same split
// role-tiles.js already uses, and the reason the shared module returns surface
// keys rather than hrefs.
//
// JavaScript only — no TypeScript per CLAUDE.md.

import { ROUTE_ID, resolveHomeSurface, SURFACE } from "@parisar/api-client";

/** Every role-gated surface lives under /c/<opaque id>. */
export const SURFACE_HREF = {
  [SURFACE.CONSOLE_ADMIN]: `/c/${ROUTE_ID[SURFACE.CONSOLE_ADMIN]}`,
  [SURFACE.CONSOLE_SALES]: `/c/${ROUTE_ID[SURFACE.CONSOLE_SALES]}`,
  [SURFACE.CONSOLE_STAFF]: `/c/${ROUTE_ID[SURFACE.CONSOLE_STAFF]}`,
  [SURFACE.SECURITY]: `/c/${ROUTE_ID[SURFACE.SECURITY]}`,
  // Secretary and resident are NOT /c/ routes. Both are served by the existing
  // /dashboard, which lives inside the (protected) route group and depends on
  // that layout for its sidebar, society switcher and skip link. Re-mounting it
  // under /c/ would mean rebuilding that shell; delegating costs one redirect.
  [SURFACE.SECRETARY]: "/dashboard",
  [SURFACE.RESIDENT]: "/dashboard",
  [SURFACE.ONBOARDING]: "/onboarding",
};

/**
 * Where this role should be sent. Always returns something safe to redirect to.
 *
 * @param {string|null|undefined} role
 * @returns {string}
 */
export function homeHrefForRole(role) {
  return SURFACE_HREF[resolveHomeSurface(role)] ?? "/onboarding";
}
