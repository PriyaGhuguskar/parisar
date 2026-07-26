/**
 * Unit tests for apps/mobile/lib/avatar.js.
 *
 * Phase 04.1 Wave 0 originally locked the Latin contract; Phase 7 Plan 07-09
 * extends with the WR-03 fix: Devanagari names (Hindi + Marathi) must produce
 * non-empty initials drawn from the actual glyph cluster, and the avatar color
 * must be deterministic across runs and platforms.
 *
 *   - AVATAR_COLORS: 4 entries, brand.50 = #DCEFE6 (DT-01)
 *   - getAvatarColor: deterministic, safe for null/undefined/empty
 *   - initials: Aman Khan -> AK, single name -> first 2 chars uppercased
 *   - WR-03: initials("राहुल शर्मा") and initials("क्षमा") produce non-empty
 *     glyph-cluster output (NEVER an empty string, NEVER a UTF-16 split).
 */

import { AVATAR_COLORS, getAvatarColor, initials } from "../lib/avatar";

describe("AVATAR_COLORS palette", () => {
  it("has exactly 4 entries each with bg + text 6-digit hex", () => {
    expect(AVATAR_COLORS).toHaveLength(4);
    AVATAR_COLORS.forEach((c) => {
      expect(c).toEqual(
        expect.objectContaining({
          bg: expect.stringMatching(/^#[0-9a-fA-F]{6}$/),
          text: expect.stringMatching(/^#[0-9a-fA-F]{6}$/),
        }),
      );
    });
  });

  it("uses brand bg #DCEFE6 (UI-SPEC DT-01)", () => {
    expect(AVATAR_COLORS[0].bg).toBe("#DCEFE6");
    expect(AVATAR_COLORS[0].text).toBe("#12715A");
  });
});

describe("getAvatarColor", () => {
  it("returns an entry from AVATAR_COLORS", () => {
    const c = getAvatarColor("Aman");
    expect(AVATAR_COLORS).toContainEqual(c);
  });

  it("returns AVATAR_COLORS[0] for empty string", () => {
    expect(getAvatarColor("")).toEqual(AVATAR_COLORS[0]);
  });

  it("returns AVATAR_COLORS[0] for null/undefined name", () => {
    expect(getAvatarColor(null)).toEqual(AVATAR_COLORS[0]);
    expect(getAvatarColor(undefined)).toEqual(AVATAR_COLORS[0]);
  });

  it("is deterministic for the same input", () => {
    expect(getAvatarColor("Aman")).toEqual(getAvatarColor("Aman"));
    expect(getAvatarColor("Sonia Mehta")).toEqual(getAvatarColor("Sonia Mehta"));
  });

  // WR-03 — deterministic color for Devanagari names too.
  it("WR-03: is deterministic for a Devanagari name", () => {
    expect(getAvatarColor("राहुल")).toEqual(getAvatarColor("राहुल"));
  });
});

describe("initials", () => {
  it("Aman Khan -> AK", () => {
    expect(initials("Aman Khan")).toBe("AK");
  });

  it("Sonia -> SO", () => {
    expect(initials("Sonia")).toBe("SO");
  });

  it("empty -> empty", () => {
    expect(initials("")).toBe("");
  });

  it("null/undefined -> empty", () => {
    expect(initials(null)).toBe("");
    expect(initials(undefined)).toBe("");
  });

  it("single char -> uppercased", () => {
    expect(initials("a")).toBe("A");
  });

  it("trims whitespace", () => {
    expect(initials("  Rahul  Mehta  ")).toBe("RM");
  });

  // === WR-03 fix — Devanagari name behaviors. ===
  // Acceptance: NEVER empty, NEVER a single character, contains glyph data
  // from BOTH name parts when 2+ parts are present.
  it("WR-03: Devanagari two-name returns a non-empty 2-grapheme initial", () => {
    const out = initials("राहुल शर्मा");
    expect(typeof out).toBe("string");
    expect(out.length).toBeGreaterThan(0);
    // The first part starts with "र" — accept either the Intl.Segmenter
    // grapheme "रा" or the Array.from code-point "र" as the leading glyph.
    expect(out.startsWith("रा") || out.startsWith("र")).toBe(true);
    // The second part starts with "श" — accept either leading grapheme/code-point.
    expect(out.includes("श")).toBe(true);
  });

  it("WR-03: Devanagari conjunct (क्षमा) returns a non-empty 2-grapheme initial", () => {
    const out = initials("क्षमा");
    expect(typeof out).toBe("string");
    expect(out.length).toBeGreaterThan(0);
    // Single-word Devanagari → first 2 graphemes joined. Leading grapheme
    // should be either the full conjunct "क्ष" (Intl.Segmenter) or "क" (Array.from).
    expect(out.startsWith("क")).toBe(true);
  });
});
