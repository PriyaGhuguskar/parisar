// apps/web/components/I18nProvider.jsx
// Phase 7 — Plan 07-04 Task 1.
//
// Client provider mounted at the root layout. Receives the server-resolved
// `lng` + preloaded `resources` from the RSC tree, builds a memoised client
// i18next instance once per locale change, and provides it to every
// `useTranslation()` consumer below it.

"use client";

import { useMemo } from "react";
import { I18nextProvider } from "react-i18next";
import { createClientI18n } from "../lib/i18n/client";

/**
 * @param {object} props
 * @param {string} props.lng
 * @param {Record<string, Record<string, any>>} props.resources
 * @param {string[]} props.namespaces
 * @param {React.ReactNode} props.children
 */
export function I18nProvider({ lng, resources, namespaces, children }) {
  const i18n = useMemo(
    () => createClientI18n({ lng, resources, namespaces }),
    [lng, resources, namespaces],
  );
  return <I18nextProvider i18n={i18n}>{children}</I18nextProvider>;
}
