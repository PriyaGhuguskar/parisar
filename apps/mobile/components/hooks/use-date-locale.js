// useDateLocale — date-fns locale for the active UI language.
//
// Every date-fns format()/formatDistanceToNow() call in the UI passes
// `{ locale }` from this hook so month names and relative times follow the
// selected language. date-fns v4 ships `hi` and `enIN` but no Marathi locale;
// Marathi falls back to the Hindi (Devanagari) locale until one exists.
//
// JavaScript only — no TypeScript per CLAUDE.md.

import { enIN, hi } from "date-fns/locale";
import { useAppLanguage } from "./use-app-language";

const LOCALES = { en: enIN, hi, mr: hi };

/**
 * @param {string | null | undefined} lng
 * @returns {import("date-fns").Locale}
 */
export function dateLocaleFor(lng) {
  return LOCALES[String(lng ?? "").slice(0, 2)] ?? enIN;
}

/** @returns {import("date-fns").Locale} */
export function useDateLocale() {
  return dateLocaleFor(useAppLanguage());
}
