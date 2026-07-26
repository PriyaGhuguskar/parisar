import { isSupportedLocale, SUPPORTED_LOCALES } from "@parisar/i18n";
import { MEMBERSHIP_ROLE } from "@parisar/shared-types";

describe("Foundation smoke (mobile)", () => {
  it("exports the three supported locales", () => {
    expect(SUPPORTED_LOCALES).toEqual(["en", "hi", "mr"]);
  });

  it("rejects unsupported locales", () => {
    expect(isSupportedLocale("de")).toBe(false);
    expect(isSupportedLocale("mr")).toBe(true);
  });

  it("declares all four membership roles", () => {
    expect(MEMBERSHIP_ROLE).toHaveLength(4);
  });
});
