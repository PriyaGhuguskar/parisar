// Devanagari-capable font family names. Bundled at build time via the expo-font
// config plugin (app.config.js). UI-SPEC mandates Noto Sans + Noto Sans Devanagari.
//
// The expo-font config plugin registers fonts differently per platform:
//   - Android: by FILE NAME (NotoSans_400Regular.ttf → "NotoSans_400Regular")
//   - iOS: by the font's PostScript name ("NotoSans-Regular")
// The FONT_* constants below are the Android/file names (also used by the
// tailwind.config.js `font-*` utilities); resolveFontFamily() picks the right
// name for the running platform.
//
// JavaScript only — no TypeScript per CLAUDE.md.

import { Platform } from "react-native";

export const FONT_REGULAR = "NotoSans_400Regular";
export const FONT_SEMIBOLD = "NotoSans_600SemiBold";
export const FONT_DEVANAGARI_REGULAR = "NotoSansDevanagari_400Regular";
export const FONT_DEVANAGARI_SEMIBOLD = "NotoSansDevanagari_600SemiBold";

const IOS_NAMES = {
  [FONT_REGULAR]: "NotoSans-Regular",
  [FONT_SEMIBOLD]: "NotoSans-SemiBold",
  [FONT_DEVANAGARI_REGULAR]: "NotoSansDevanagari-Regular",
  [FONT_DEVANAGARI_SEMIBOLD]: "NotoSansDevanagari-SemiBold",
};

/** Languages written in Devanagari script (Hindi, Marathi). */
const DEVANAGARI_LANGUAGES = new Set(["hi", "mr"]);

/**
 * @param {string | null | undefined} lng
 * @returns {boolean}
 */
export function isDevanagariLanguage(lng) {
  if (!lng) return false;
  return DEVANAGARI_LANGUAGES.has(String(lng).slice(0, 2));
}

/**
 * Pick the bundled font family for the active UI language and weight.
 * Noto Sans Devanagari also carries Latin glyphs, so mixed text ("B-203",
 * digits) still renders correctly in hi/mr.
 *
 * @param {string | null | undefined} lng  i18next language code
 * @param {boolean} [semibold]  true for font-semibold / font-bold text
 * @returns {string}
 */
export function resolveFontFamily(lng, semibold = false) {
  const devanagari = isDevanagariLanguage(lng);
  let name;
  if (devanagari) name = semibold ? FONT_DEVANAGARI_SEMIBOLD : FONT_DEVANAGARI_REGULAR;
  else name = semibold ? FONT_SEMIBOLD : FONT_REGULAR;
  return Platform.OS === "ios" ? IOS_NAMES[name] : name;
}
