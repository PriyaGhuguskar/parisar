// apps/web/lib/avatar.js
// Phase 7 WR-03 — grapheme-aware initials + color. Mirror of apps/mobile/lib/avatar.js.
//
// Calls the shared @parisar/api-client `graphemes` helper so mobile and web
// stay in sync. The previous UTF-16 indexing implementation was a trap:
// while it happened to produce a leading codepoint for short Devanagari
// strings, the rule was unsound (UTF-16 code unit access returns a code
// unit, not a code point; `parts[0][0]` slices on code units) and would
// have broken on surrogate pairs (emoji-as-initial) and combining sequences
// that span multiple code points.
//
// The single source of truth for grapheme iteration lives in
// packages/api-client/src/text/graphemes.js so both apps cannot drift again.
//
// Color values match the EXISTING dashboard palette (UI-SPEC DT-01:
// #DCEFE6 for tile/avatar tints, not packages/ui-tokens' #f5f7ff).
// JavaScript only — no TypeScript per CLAUDE.md.

import { graphemes } from "@parisar/api-client";

export const AVATAR_COLORS = [
  { bg: "#DCEFE6", text: "#12715A" }, // brand
  { bg: "#f0fdf4", text: "#16a34a" }, // green
  { bg: "#fef3c7", text: "#d97706" }, // amber
  { bg: "#fdf2f8", text: "#db2777" }, // pink
];

/**
 * Deterministic color picker based on the first two graphemes of `name`.
 * @param {string} name
 * @returns {{bg: string, text: string}}
 */
export function getAvatarColor(name = "") {
  const safe = (name ?? "").trim();
  if (!safe) return AVATAR_COLORS[0];
  const g = graphemes(safe);
  if (g.length === 0) return AVATAR_COLORS[0];
  let sum = 0;
  for (const ch of g.slice(0, 2)) {
    sum += ch.codePointAt(0) ?? 0;
  }
  return AVATAR_COLORS[sum % AVATAR_COLORS.length];
}

/**
 * Initials from a name. Empty string returns empty string.
 * Uses grapheme iteration so Devanagari names produce visually-intact glyph
 * clusters (Hindi + Marathi) rather than UTF-16 splits.
 * @param {string} name
 * @returns {string}
 */
export function initials(name = "") {
  const trimmed = (name ?? "").trim();
  if (!trimmed) return "";
  const parts = trimmed.split(/\s+/);
  if (parts.length >= 2) {
    const first = graphemes(parts[0])[0] ?? "";
    const second = graphemes(parts[1])[0] ?? "";
    return (first + second).toLocaleUpperCase();
  }
  return graphemes(trimmed).slice(0, 2).join("").toLocaleUpperCase();
}
