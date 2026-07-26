import { isSupportedLocale, SUPPORTED_LOCALES } from "@parisar/i18n";
import { MEMBERSHIP_ROLE } from "@parisar/shared-types";
import { describe, expect, it } from "vitest";

describe("Foundation smoke", () => {
  it("exports the three supported locales", () => {
    expect(SUPPORTED_LOCALES).toEqual(["en", "hi", "mr"]);
  });

  it("rejects unsupported locales", () => {
    expect(isSupportedLocale("de")).toBe(false);
    expect(isSupportedLocale("hi")).toBe(true);
  });

  it("declares all four membership roles", () => {
    expect(MEMBERSHIP_ROLE).toContain("secretary");
    expect(MEMBERSHIP_ROLE).toContain("co_secretary");
    expect(MEMBERSHIP_ROLE).toContain("board_member");
    expect(MEMBERSHIP_ROLE).toContain("member");
    expect(MEMBERSHIP_ROLE).toHaveLength(4);
  });
});
