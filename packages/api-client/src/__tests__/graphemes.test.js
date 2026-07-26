/**
 * Phase 7 WR-03 — graphemes() helper tests.
 *
 * Locks the shared cross-platform grapheme iteration contract that both
 * apps/mobile/lib/avatar.js and apps/web/lib/avatar.js depend on so that
 * Devanagari names (Hindi + Marathi) render correct initials and colors.
 *
 * The helper has two execution paths:
 *   - Modern V8 / Node 22 / RNTL JSDOM: Intl.Segmenter present → real
 *     grapheme clusters ("राहुल" → ["रा","हु","ल"]).
 *   - Hermes / older runtimes: Array.from(str) fallback → code-point
 *     iteration ("राहुल" → ["र","ा","ह","ु","ल"]).
 *
 * For the initials use case both outcomes are acceptable because the
 * concatenation in avatar.js keeps the glyph cluster visually intact even
 * when iterating by code points.
 */

import { describe, expect, it } from "vitest";
import { graphemes } from "../text/graphemes.js";

describe("graphemes()", () => {
  it("returns one entry per Latin character", () => {
    expect(graphemes("Rahul")).toEqual(["R", "a", "h", "u", "l"]);
  });

  it("returns an empty array for an empty string", () => {
    expect(graphemes("")).toEqual([]);
  });

  it("returns an empty array for null/undefined input (defensive)", () => {
    expect(graphemes(null)).toEqual([]);
    expect(graphemes(undefined)).toEqual([]);
  });

  it("segments a Devanagari name into at least 2 non-empty entries (matra-safe)", () => {
    // "राहुल" — depending on runtime:
    //   - Intl.Segmenter: ["रा", "हु", "ल"] (grapheme clusters, length 3)
    //   - Array.from fallback: ["र", "ा", "ह", "ु", "ल"] (code points, length 5)
    // Either path is acceptable for the avatar's downstream slice+join.
    const out = graphemes("राहुल");
    expect(out.length).toBeGreaterThanOrEqual(2);
    expect(out.every((g) => typeof g === "string" && g.length > 0)).toBe(true);
    // Whatever the segmentation, joining everything back must reproduce the input.
    expect(out.join("")).toBe("राहुल");
  });

  it("preserves the full Devanagari conjunct when joined back", () => {
    // "क्षमा" — contains a conjunct क्ष (KA + VIRAMA + SSA). Either segmentation
    // path must round-trip without losing characters.
    const out = graphemes("क्षमा");
    expect(out.length).toBeGreaterThanOrEqual(2);
    expect(out.join("")).toBe("क्षमा");
  });
});
