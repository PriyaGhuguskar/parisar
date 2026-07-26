// Phase 1 shipped the locale skeleton + supported-locale list.
// Phase 7 (Plan 07-01) wires i18next + react-i18next runtime via the factory.

export const SUPPORTED_LOCALES = ["en", "hi", "mr"];
export const DEFAULT_LOCALE = "en";

/**
 * @param {string} value
 * @returns {boolean}
 */
export function isSupportedLocale(value) {
  return SUPPORTED_LOCALES.includes(value);
}

export { createBackend } from "./backend.js";
// Phase 7 runtime exports.
export { createI18nInstance } from "./create-instance.js";
export { AUTH_NAMESPACE, DEFAULT_NS, NAMESPACES } from "./namespaces.js";
