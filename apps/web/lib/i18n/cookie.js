// apps/web/lib/i18n/cookie.js
// Phase 7 — Plan 07-04: locale cookie contract.
//
// Source-of-truth references:
//   - UI-SPEC §Screen 4 Web Cookie security
//   - RESEARCH.md §Web Persistence (cookie not localStorage — SSR-safe)
//   - Threat model T-07-12 / T-07-14 / T-07-17 (whitelist on every read AND write,
//     non-HttpOnly accepted because the cookie carries no auth material)
//
// NOTE: SUPPORTED_LOCALES / DEFAULT_LOCALE are inlined (not imported from
// @parisar/i18n) so this module never transitively pulls react-i18next into
// the Server Component bundle (which would trip createContext at Next 15
// page-data collection — Plan 07-04 Rule 1 deviation, verified locally).
// The Phase 1 source of truth — packages/i18n/src/index.js — declares the same
// 3-locale set; any drift is caught by the matching constant below.

// Mirrors packages/i18n/src/index.js SUPPORTED_LOCALES + DEFAULT_LOCALE.
const SUPPORTED_LOCALES = ["en", "hi", "mr"];
const DEFAULT_LOCALE = "en";

export const LOCALE_COOKIE_NAME = "parisar_lang";

export const LOCALE_COOKIE_ATTRS = {
  path: "/",
  maxAge: 60 * 60 * 24 * 365, // 1 year (31_536_000 seconds)
  sameSite: "lax",
  secure: process.env.NODE_ENV === "production",
  // Non-HttpOnly is intentional — the UI reads this cookie on the client to flip
  // i18next.language without a round-trip. The cookie value is a 2-char locale
  // code (validated below) and carries NO authentication material; T-07-14
  // accepts the trade-off because SameSite=Lax + the no-secret guarantee close
  // the meaningful attack surface.
  httpOnly: false,
};

/**
 * Whitelist-validate a cookie value. Returns the locale unchanged when it is
 * one of SUPPORTED_LOCALES; falls back to DEFAULT_LOCALE for anything else
 * (null, undefined, empty, unsupported, non-string).
 *
 * Called on every server read (readLocaleFromCookies) AND every server write
 * (setLanguageAction) — T-07-12 / T-07-17 mitigation: no untrusted value can
 * ever flow into the i18next runtime or into a cookie write.
 *
 * @param {unknown} value
 * @returns {string}
 */
export function validateLocale(value) {
  if (typeof value !== "string") return DEFAULT_LOCALE;
  return SUPPORTED_LOCALES.includes(value) ? value : DEFAULT_LOCALE;
}
