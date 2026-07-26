// apps/mobile/__tests__/code-rotation-badge.test.js
// D-05 — pure-function helpers for the Code Rotation days-until-rotation badge.
//
// These helpers are forward-compatible: society_codes has no rotates_at column
// today (Wave 0 audit §4), so the Home screen passes null and the badge is
// hidden (graceful degradation). The helpers are nevertheless fully covered so
// that when a future phase adds a rotates_at timestamp, the badge lights up
// with zero logic change.

import { computeDaysUntilRotation, daysUntilRotationToBadge } from "../lib/role-tiles";

describe("computeDaysUntilRotation", () => {
  const NOW = new Date("2026-05-26T00:00:00.000Z").getTime();

  it("CR-1: returns 5 when rotatesAt is 5 days in the future", () => {
    const rotatesAt = new Date(NOW + 5 * 86400000).toISOString();
    expect(computeDaysUntilRotation(rotatesAt, NOW)).toBe(5);
  });

  it("CR-2: returns 0 when rotatesAt is in the past", () => {
    const rotatesAt = new Date(NOW - 2 * 86400000).toISOString();
    expect(computeDaysUntilRotation(rotatesAt, NOW)).toBe(0);
  });

  it("CR-3: rounds UP partial days (4.3 days -> 5)", () => {
    const rotatesAt = new Date(NOW + 4.3 * 86400000).toISOString();
    expect(computeDaysUntilRotation(rotatesAt, NOW)).toBe(5);
  });

  it("CR-4: returns null on null/undefined input", () => {
    expect(computeDaysUntilRotation(null)).toBeNull();
    expect(computeDaysUntilRotation(undefined)).toBeNull();
  });

  it("CR-4: returns null on invalid date string", () => {
    expect(computeDaysUntilRotation("not-a-date")).toBeNull();
  });

  it("CR-5: returns 7 when rotatesAt is exactly 7 days in the future", () => {
    const rotatesAt = new Date(NOW + 7 * 86400000).toISOString();
    expect(computeDaysUntilRotation(rotatesAt, NOW)).toBe(7);
  });

  it("accepts numeric timestamp input", () => {
    expect(computeDaysUntilRotation(NOW + 3 * 86400000, NOW)).toBe(3);
  });
});

describe("daysUntilRotationToBadge", () => {
  it("CR-6: returns '5d' for 5 days", () => {
    expect(daysUntilRotationToBadge(5)).toBe("5d");
  });

  it("CR-6: returns '0d' for 0 days (rotation today)", () => {
    expect(daysUntilRotationToBadge(0)).toBe("0d");
  });

  it("CR-6: returns '6d' for 6 days (boundary, badge still shown)", () => {
    expect(daysUntilRotationToBadge(6)).toBe("6d");
  });

  it("CR-6: returns null for 7 days (boundary, badge hidden — < 7 only)", () => {
    expect(daysUntilRotationToBadge(7)).toBeNull();
  });

  it("CR-8: returns null for 10 days", () => {
    expect(daysUntilRotationToBadge(10)).toBeNull();
  });

  it("CR-9: returns null on null input (no active code / no rotates_at column)", () => {
    expect(daysUntilRotationToBadge(null)).toBeNull();
  });
});
