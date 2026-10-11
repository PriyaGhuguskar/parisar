// apps/web/lib/devRoutes.js
// The single switch for the developer-only routes (/dev-login, /dev-preview and
// the auto-sign-in redirect in the (protected) layout).
//
// TWO independent conditions, both required:
//   1. NODE_ENV === "development" — `next build` / `next start` always run with
//      "production", so a deployed build can never satisfy this…
//   2. ENABLE_DEV_ROUTES === "1" — …and even a dev server that is somehow
//      exposed (or a build where NODE_ENV was mis-set) stays closed unless the
//      developer explicitly opted in via .env.local.
//
// Edge-safe (no imports) — the middleware uses it too.
//
// JavaScript only — no TypeScript per CLAUDE.md.

/** @returns {boolean} */
export function devRoutesEnabled() {
  return process.env.NODE_ENV === "development" && process.env.ENABLE_DEV_ROUTES === "1";
}
