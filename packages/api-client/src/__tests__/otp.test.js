import { describe, expect, it } from "vitest";
import { isNewUser, isValidIndianMobile, isValidOtp, toE164 } from "../otp.js";

describe("isValidIndianMobile", () => {
  it("accepts a valid number starting with 9", () => {
    expect(isValidIndianMobile("9876543210")).toBe(true);
  });

  it("accepts a valid number starting with 6", () => {
    expect(isValidIndianMobile("6000000000")).toBe(true);
  });

  it("accepts valid numbers starting with 7 and 8", () => {
    expect(isValidIndianMobile("7000000000")).toBe(true);
    expect(isValidIndianMobile("8000000000")).toBe(true);
  });

  it("rejects a number with a leading 0", () => {
    expect(isValidIndianMobile("0987654321")).toBe(false);
  });

  it("rejects a number with a leading 5", () => {
    expect(isValidIndianMobile("5876543210")).toBe(false);
  });

  it("rejects a number that is too short", () => {
    expect(isValidIndianMobile("98765")).toBe(false);
  });

  it("rejects a number that is too long", () => {
    expect(isValidIndianMobile("98765432100")).toBe(false);
  });

  it("rejects a number containing a space", () => {
    expect(isValidIndianMobile("98765 43210")).toBe(false);
  });

  it("rejects null", () => {
    expect(isValidIndianMobile(null)).toBe(false);
  });

  it("rejects undefined", () => {
    expect(isValidIndianMobile(undefined)).toBe(false);
  });

  it("rejects a non-string number", () => {
    expect(isValidIndianMobile(9876543210)).toBe(false);
  });
});

describe("toE164", () => {
  it("converts a valid Indian mobile number to E.164 format", () => {
    expect(toE164("9876543210")).toBe("+919876543210");
  });

  it("throws for an invalid phone number", () => {
    expect(() => toE164("0987654321")).toThrow("toE164: not a valid Indian mobile number");
  });

  it("throws for a too-short number", () => {
    expect(() => toE164("98765")).toThrow("toE164: not a valid Indian mobile number");
  });

  it("throws for null", () => {
    expect(() => toE164(null)).toThrow("toE164: not a valid Indian mobile number");
  });
});

describe("isValidOtp", () => {
  it("accepts a 6-digit numeric OTP", () => {
    expect(isValidOtp("123456")).toBe(true);
  });

  it("rejects a 5-digit OTP", () => {
    expect(isValidOtp("12345")).toBe(false);
  });

  it("rejects a 7-digit OTP", () => {
    expect(isValidOtp("1234567")).toBe(false);
  });

  it("rejects an alphabetic string", () => {
    expect(isValidOtp("abcdef")).toBe(false);
  });

  it("rejects a mixed alphanumeric string", () => {
    expect(isValidOtp("12345a")).toBe(false);
  });

  it("rejects null", () => {
    expect(isValidOtp(null)).toBe(false);
  });

  it("rejects undefined", () => {
    expect(isValidOtp(undefined)).toBe(false);
  });

  it("rejects a non-string number", () => {
    expect(isValidOtp(123456)).toBe(false);
  });
});

describe("isNewUser", () => {
  it("returns true for null (no profile row)", () => {
    expect(isNewUser(null)).toBe(true);
  });

  it("returns true for undefined", () => {
    expect(isNewUser(undefined)).toBe(true);
  });

  it("returns false for an object with a user_id (profile exists)", () => {
    expect(isNewUser({ user_id: "abc-123" })).toBe(false);
  });

  it("returns false for an empty object (profile row exists but empty)", () => {
    expect(isNewUser({})).toBe(false);
  });
});
