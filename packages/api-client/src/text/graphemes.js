// packages/api-client/src/text/graphemes.js
// Phase 7 WR-03 — single source of grapheme iteration for both apps.
//
// Web/V8: Intl.Segmenter (real grapheme clusters, keeps Devanagari base+matra
//         together: "राहुल" → ["रा","हु","ल"]).
// Hermes (RN): Array.from fallback (code-point iteration; matras stay
//              adjacent in the string but iterate as separate entries:
//              "राहुल" → ["र","ा","ह","ु","ल"]).
//
// For initials, both paths yield acceptable results — see
// apps/{mobile,web}/lib/avatar.js which slices and concatenates the first N
// graphemes; concatenation keeps the glyph clusters visually intact even with
// code-point iteration.
//
// Why this lives in @parisar/api-client: WR-03 must be fixed in ONE place. The
// previous per-app charCodeAt(0) implementations broke every hi/mr name across
// 161 avatar surfaces. Both apps now import { graphemes } from this module.
//
// JavaScript only — no TypeScript per CLAUDE.md.

/**
 * Split a string into an array of user-perceived characters (graphemes).
 *
 * Uses Intl.Segmenter when available (modern V8 + Node 22 + JSDOM); falls back
 * to Array.from(str) for runtimes without Intl.Segmenter (Hermes / older RN).
 *
 * Returns an empty array for null/undefined/empty input (defensive — callers
 * should never have to null-check the result).
 *
 * @param {string|null|undefined} str
 * @returns {string[]}
 */
export function graphemes(str) {
  if (str == null) return [];
  const s = String(str);
  if (s.length === 0) return [];
  if (typeof Intl !== "undefined" && typeof Intl.Segmenter === "function") {
    try {
      const seg = new Intl.Segmenter(undefined, { granularity: "grapheme" });
      return Array.from(seg.segment(s), (entry) => entry.segment);
    } catch {
      // Fall through to Array.from on any Intl.Segmenter construction failure.
    }
  }
  return Array.from(s);
}
