// apps/web/__tests__/cookie-locale.test.js
// Phase 7 — Plan 07-04 Task 1 (TDD RED→GREEN).
//
// Locks the cookie contract from UI-SPEC §Screen 4 Web + RESEARCH.md §Web Persistence:
//   - LOCALE_COOKIE_NAME === "parisar_lang"
//   - LOCALE_COOKIE_ATTRS.sameSite === "lax", .maxAge === 31536000, .path === "/", .httpOnly === false
//   - validateLocale whitelists "en" / "hi" / "mr" and falls back to "en" for ANYTHING else
//     (T-07-12 mitigation — the cookie value is untrusted user input).

import { describe, expect, it } from "vitest";
import { LOCALE_COOKIE_ATTRS, LOCALE_COOKIE_NAME, validateLocale } from "../lib/i18n/cookie";

describe("LOCALE_COOKIE_NAME", () => {
  it("is the literal string 'parisar_lang'", () => {
    expect(LOCALE_COOKIE_NAME).toBe("parisar_lang");
  });
});

describe("LOCALE_COOKIE_ATTRS", () => {
  it("uses SameSite=Lax for CSRF safety", () => {
    expect(LOCALE_COOKIE_ATTRS.sameSite).toBe("lax");
  });

  it("expires in 1 year (31536000 seconds)", () => {
    expect(LOCALE_COOKIE_ATTRS.maxAge).toBe(31536000);
  });

  it("is scoped to the root path", () => {
    expect(LOCALE_COOKIE_ATTRS.path).toBe("/");
  });

  it("is NOT HttpOnly so the UI can read it for live changeLanguage", () => {
    expect(LOCALE_COOKIE_ATTRS.httpOnly).toBe(false);
  });
});

describe("validateLocale", () => {
  it("returns 'en' unchanged", () => {
    expect(validateLocale("en")).toBe("en");
  });

  it("returns 'hi' unchanged", () => {
    expect(validateLocale("hi")).toBe("hi");
  });

  it("returns 'mr' unchanged", () => {
    expect(validateLocale("mr")).toBe("mr");
  });

  it("falls back to 'en' for null", () => {
    expect(validateLocale(null)).toBe("en");
  });

  it("falls back to 'en' for undefined", () => {
    expect(validateLocale(undefined)).toBe("en");
  });

  it("falls back to 'en' for the empty string", () => {
    expect(validateLocale("")).toBe("en");
  });

  it("falls back to 'en' for an unsupported locale like 'de'", () => {
    expect(validateLocale("de")).toBe("en");
  });

  it("falls back to 'en' for an XSS-shaped payload (T-07-12)", () => {
    expect(validateLocale("<script>")).toBe("en");
  });

  it("falls back to 'en' for non-string inputs", () => {
    expect(validateLocale(42)).toBe("en");
    expect(validateLocale({})).toBe("en");
    expect(validateLocale([])).toBe("en");
  });
});
