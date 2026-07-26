// apps/web/lib/i18n/client.js
// Phase 7 — Plan 07-04 Task 1.
//
// Client-side i18next factory. Seeded with the server's lng + preloaded
// resources so the SSR HTML and client hydration agree on language and
// strings (RESEARCH.md Pitfall 2 — hydration mismatch).
//
// The backend plugin is wired in addition to the resources prop so that any
// namespace NOT preloaded server-side (rare — `initTranslations` preloads
// every NAMESPACE by default) is still lazy-loaded by the static-map backend
// from @parisar/i18n.

"use client";

import { createBackend, DEFAULT_LOCALE } from "@parisar/i18n";
import { createInstance } from "i18next";
import { initReactI18next } from "react-i18next";

/**
 * @param {object} args
 * @param {string} args.lng
 * @param {Record<string, Record<string, any>>} args.resources
 * @param {string[]} args.namespaces
 * @returns {import('i18next').i18n}
 */
export function createClientI18n({ lng, resources, namespaces }) {
  const i18n = createInstance();
  i18n
    .use(createBackend())
    .use(initReactI18next)
    .init({
      lng,
      fallbackLng: DEFAULT_LOCALE,
      ns: namespaces,
      defaultNS: "dashboard",
      resources,
      // React/RN auto-escape `t()` output — double-escaping breaks Devanagari
      // and we never inject `t()` into raw HTML.
      interpolation: { escapeValue: false },
      // The apps wire their own loading boundaries; avoid Suspense churn.
      react: { useSuspense: false },
      // i18next v22+ returns null for missing keys; we want a string fallback
      // (the key itself) so React child-type guards don't blow up if a key
      // slips past the CI coverage gate.
      returnNull: false,
    });
  return i18n;
}
