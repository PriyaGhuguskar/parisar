// Phase 7 — Plan 07-01: shared i18next instance factory.
//
// Both apps (apps/web and apps/mobile) call createI18nInstance(...) to build a
// freshly-configured i18next instance bound to react-i18next. The factory is
// async because resourcesToBackend loads each shard lazily.
//
// Config rationale:
//   - fallbackLng: DEFAULT_LOCALE so any missing key falls back to English
//     silently in production (RESEARCH.md). The CI gate check-i18n-coverage.mjs
//     blocks merges that would actually trigger this fallback path.
//   - interpolation.escapeValue: false — React/RN already auto-escape; double
//     escaping breaks Devanagari content.
//   - react.useSuspense: false — the apps wire their own loading states; we
//     avoid Suspense boundaries to keep the SSR + RN flows uniform.
//   - returnNull: false — i18next-v22+ default returns null for missing keys;
//     we want a string fallback (the key itself) so React's child-type guards
//     don't blow up if a key slips through.

import { createInstance } from "i18next";
import { initReactI18next } from "react-i18next";
import { createBackend } from "./backend.js";
import { DEFAULT_LOCALE } from "./index.js";
import { DEFAULT_NS } from "./namespaces.js";

/**
 * @param {{ lng?: string, ns?: string[] }} [options]
 * @returns {Promise<import("i18next").i18n>}
 */
export async function createI18nInstance({ lng, ns = [DEFAULT_NS] } = {}) {
  const i18n = createInstance();
  await i18n
    .use(createBackend())
    .use(initReactI18next)
    .init({
      lng: lng ?? DEFAULT_LOCALE,
      fallbackLng: DEFAULT_LOCALE,
      ns,
      defaultNS: DEFAULT_NS,
      interpolation: { escapeValue: false },
      react: { useSuspense: false },
      returnNull: false,
    });
  return i18n;
}
