// apps/mobile/lib/i18n.js
// Phase 7 (Plan 07-03 Wave 2) — mobile i18n runtime helper.
//
// Precedence (RESEARCH.md Pitfall 3 + UI-SPEC §Screen 4):
//   saved override (AsyncStorage `parisar_lang`)
//     > device locale (expo-localization.getLocales()[0].languageCode)
//     > DEFAULT_LOCALE ("en")
//
// The saved override ALWAYS wins. The device locale only SEEDS the default on
// first launch when nothing is saved. Both inputs are validated against the
// SUPPORTED_LOCALES whitelist on read AND write (T-07-09 mitigation).
//
// Hermes-safe init: `react.useSuspense: false` (set inside createI18nInstance)
// avoids RN Suspense boundary churn.
//
// JavaScript only — no TypeScript per CLAUDE.md.

import { createI18nInstance, DEFAULT_LOCALE, NAMESPACES, SUPPORTED_LOCALES } from "@parisar/i18n";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { getLocales } from "expo-localization";

export const STORAGE_KEY = "parisar_lang";

let _i18n = null;

/**
 * Resolve the language to boot with. Saved override wins; device locale
 * seeds the default on first launch; DEFAULT_LOCALE is the floor.
 * @returns {Promise<string>}
 */
export async function getActiveLanguage() {
  try {
    const saved = await AsyncStorage.getItem(STORAGE_KEY);
    if (saved && SUPPORTED_LOCALES.includes(saved)) return saved;
  } catch {
    // AsyncStorage read failed (rare) — fall through to device locale.
  }
  try {
    const device = getLocales()?.[0]?.languageCode;
    if (device && SUPPORTED_LOCALES.includes(device)) return device;
  } catch {
    // expo-localization not yet linked or stub — fall through.
  }
  return DEFAULT_LOCALE;
}

/**
 * Initialize i18next ONCE for the app process. Subsequent calls return the
 * cached instance so the provider can re-grab the same singleton.
 * @returns {Promise<import('i18next').i18n>}
 */
export async function initI18n() {
  if (_i18n) return _i18n;
  const lng = await getActiveLanguage();
  _i18n = await createI18nInstance({ lng, ns: NAMESPACES });
  // Eagerly load the default namespace so first render hits a resident bundle
  // (the others are looked up lazily on first useTranslation('<ns>')).
  await _i18n.loadNamespaces(["dashboard"]);
  return _i18n;
}

/**
 * Change the active language: validate against the whitelist, persist to
 * AsyncStorage, then apply via i18next.changeLanguage so every useTranslation
 * subscriber re-renders.
 *
 * @param {string} lng
 * @returns {Promise<void>}
 */
export async function changeLanguage(lng) {
  if (!SUPPORTED_LOCALES.includes(lng)) {
    throw new Error(`Unsupported locale: ${lng}`);
  }
  await AsyncStorage.setItem(STORAGE_KEY, lng);
  if (!_i18n) await initI18n();
  await _i18n.changeLanguage(lng);
}

/**
 * Return the cached i18next instance (or null if initI18n has not yet run).
 * Used by the I18nextProvider mount in app/_layout.jsx.
 * @returns {import('i18next').i18n | null}
 */
export function getI18n() {
  return _i18n;
}

/**
 * Test-only helper: clear the cached instance so initI18n() runs again under
 * a fresh AsyncStorage / getLocales mock state. Not used by production code.
 */
export function _resetForTests() {
  _i18n = null;
}
