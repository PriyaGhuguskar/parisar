// Phase 7 — Plan 07-01: i18next resource backend for @parisar/i18n.
//
// Why a static map (not a dynamic-import template literal)?
//   - Metro (React Native bundler) cannot resolve `import(`../locales/${lng}/${ns}.json`)`
//     statically; it bails to a runtime require which fails on the device. Each
//     `() => import("...")` literal here IS the static import graph the bundler
//     needs to split shards into individual chunks while still loading lazily.
//   - Webpack/Turbopack on the web side also tree-shakes the unused-locale chunks
//     cleanly with this shape.
//
// The map covers the 9 domain shards × 3 locales + the flat top-level <lng>.json
// loaded under the synthetic "auth" namespace.

import resourcesToBackend from "i18next-resources-to-backend";

const STATIC = {
  "en/dashboard": () => import("../locales/en/dashboard.json"),
  "hi/dashboard": () => import("../locales/hi/dashboard.json"),
  "mr/dashboard": () => import("../locales/mr/dashboard.json"),
  "en/complaints": () => import("../locales/en/complaints.json"),
  "hi/complaints": () => import("../locales/hi/complaints.json"),
  "mr/complaints": () => import("../locales/mr/complaints.json"),
  "en/notifications": () => import("../locales/en/notifications.json"),
  "hi/notifications": () => import("../locales/hi/notifications.json"),
  "mr/notifications": () => import("../locales/mr/notifications.json"),
  "en/polls": () => import("../locales/en/polls.json"),
  "hi/polls": () => import("../locales/hi/polls.json"),
  "mr/polls": () => import("../locales/mr/polls.json"),
  "en/bookings": () => import("../locales/en/bookings.json"),
  "hi/bookings": () => import("../locales/hi/bookings.json"),
  "mr/bookings": () => import("../locales/mr/bookings.json"),
  "en/preferences": () => import("../locales/en/preferences.json"),
  "hi/preferences": () => import("../locales/hi/preferences.json"),
  "mr/preferences": () => import("../locales/mr/preferences.json"),
  "en/flat-actions": () => import("../locales/en/flat-actions.json"),
  "hi/flat-actions": () => import("../locales/hi/flat-actions.json"),
  "mr/flat-actions": () => import("../locales/mr/flat-actions.json"),
  "en/community": () => import("../locales/en/community.json"),
  "hi/community": () => import("../locales/hi/community.json"),
  "mr/community": () => import("../locales/mr/community.json"),
  "en/moderation": () => import("../locales/en/moderation.json"),
  "hi/moderation": () => import("../locales/hi/moderation.json"),
  "mr/moderation": () => import("../locales/mr/moderation.json"),
  "en/auth": () => import("../locales/en.json"),
  "hi/auth": () => import("../locales/hi.json"),
  "mr/auth": () => import("../locales/mr.json"),
};

/**
 * Build an i18next backend plugin that resolves (lng, ns) pairs via the static
 * import map above. Returns a plugin instance suitable for `i18n.use(...)`.
 *
 * @returns {import("i18next").BackendModule | any}
 */
export function createBackend() {
  return resourcesToBackend(async (lng, ns) => {
    const loader = STATIC[`${lng}/${ns}`];
    if (!loader) {
      throw new Error(`@parisar/i18n: missing shard ${lng}/${ns}`);
    }
    const mod = await loader();
    return mod.default ?? mod;
  });
}
