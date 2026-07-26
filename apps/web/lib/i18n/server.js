// apps/web/lib/i18n/server.js
// Phase 7 — Plan 07-04 Task 1.
//
// RSC-side i18n init. Reads the parisar_lang cookie (whitelist-validated) and
// builds an isolated i18next instance per request — Next.js server components
// must never share mutable instance state across requests.
//
// Per RESEARCH.md Pattern 2 — hydration-safe seeding: the server returns BOTH
// the resolved `lng` AND the preloaded `resources` so the client provider can
// boot in the same language without a second fetch. This closes T-07-16
// (hydration mismatch leaks SSR HTML in the wrong language).
//
// IMPORTANT: this file does NOT use createI18nInstance from @parisar/i18n
// because that helper wires `initReactI18next`, which calls React.createContext
// at module load. createContext blows up Next 15's page-data collection step
// when the import graph pulls it into a Server Component bundle (Plan 07-04
// Rule 1 deviation — verified locally via `pnpm --filter @parisar/web build`).
// Instead we build a bare i18next instance with ONLY the resources backend +
// no React plugin — the server just needs `t` and the resources tree.

// Direct subpath imports avoid pulling @parisar/i18n's index.js into the
// Server Component bundle (which would transitively bring in `react-i18next`
// via create-instance.js and trip createContext at page-data collection).
import { createBackend } from "@parisar/i18n/backend";
import { NAMESPACES } from "@parisar/i18n/namespaces";
import { createInstance } from "i18next";
import { cookies } from "next/headers";
import { LOCALE_COOKIE_NAME, validateLocale } from "./cookie";

// Inline DEFAULT_LOCALE here so the @parisar/i18n index module (which
// re-exports the react-i18next-using factory) never lands in the RSC bundle.
// The supported locale list is sourced via cookie.js which already imports
// SUPPORTED_LOCALES / DEFAULT_LOCALE from the index.js, but cookie.js is a
// pure module — no React, no createContext.
const DEFAULT_LOCALE = "en";

/**
 * Read the locale from the request cookie store. Whitelist-validated on every
 * call — anything unsupported falls back to DEFAULT_LOCALE.
 *
 * @returns {Promise<string>}
 */
export async function readLocaleFromCookies() {
  const store = await cookies();
  const raw = store.get(LOCALE_COOKIE_NAME)?.value;
  return validateLocale(raw);
}

/**
 * Build a per-request i18next instance preloaded with the requested namespaces,
 * and return a bound `t` plus the raw resources for client seeding.
 *
 * Bare i18next instance (NO initReactI18next) — see header comment above.
 *
 * @param {string} lng
 * @param {string[]} [namespaces]
 * @returns {Promise<{
 *   t: Function,
 *   lng: string,
 *   namespaces: string[],
 *   resources: Record<string, Record<string, any>>
 * }>}
 */
export async function initTranslations(lng, namespaces = NAMESPACES) {
  const i18n = createInstance();
  await i18n.use(createBackend()).init({
    lng,
    fallbackLng: DEFAULT_LOCALE,
    ns: namespaces,
    defaultNS: "dashboard",
    interpolation: { escapeValue: false },
    returnNull: false,
  });
  return {
    t: i18n.getFixedT(lng, namespaces),
    lng,
    namespaces,
    resources: i18n.services.resourceStore.data,
  };
}
