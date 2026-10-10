import { describe, expect, it } from "vitest";
import { derivePinSecret } from "../index.js";

// The web and mobile apps must derive the SAME secret, and it must never change
// silently — a change would lock every resident out of their PIN.
describe("derivePinSecret", () => {
  it("is the fixed pk1.<digits>.<pin> format", () => {
    expect(derivePinSecret("+919812345678", "4821")).toBe("pk1.919812345678.4821");
  });

  it("ignores phone formatting", () => {
    expect(derivePinSecret("+91 98123 45678", "4821")).toBe(
      derivePinSecret("919812345678", "4821"),
    );
  });

  it("is at least 6 characters (GoTrue minimum)", () => {
    expect(derivePinSecret("+919000000001", "0000").length).toBeGreaterThanOrEqual(6);
  });

  it("rejects anything but exactly 4 digits", () => {
    for (const bad of ["123", "12345", "12a4", ""]) {
      expect(() => derivePinSecret("+919000000001", bad)).toThrow("INVALID_PIN");
    }
  });

  it("rejects a missing phone", () => {
    expect(() => derivePinSecret("", "1234")).toThrow("INVALID_PHONE");
  });
});
