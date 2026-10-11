// apps/web/lib/i18n/date-locale.js
// Map the active i18next language to the BCP-47 locale used for
// Intl / toLocaleDateString, so dates follow the user's chosen language instead
// of always rendering in English.
//
// JavaScript only — no TypeScript per CLAUDE.md.

const DATE_LOCALES = Object.freeze({ en: "en-IN", hi: "hi-IN", mr: "mr-IN" });

/**
 * @param {string|null|undefined} lng  e.g. "hi", "mr-IN", "en"
 * @returns {string}
 */
export function dateLocaleFor(lng) {
  const base = String(lng ?? "en")
    .toLowerCase()
    .split("-")[0];
  return DATE_LOCALES[base] ?? DATE_LOCALES.en;
}

/**
 * Format a date for display in the given language. Returns "" for an invalid
 * or missing value rather than "Invalid Date".
 *
 * @param {string|number|Date|null|undefined} value
 * @param {string|null|undefined} lng
 * @param {Intl.DateTimeFormatOptions} [options]
 * @returns {string}
 */
export function formatDate(value, lng, options) {
  if (value == null) return "";
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString(dateLocaleFor(lng), options);
}
