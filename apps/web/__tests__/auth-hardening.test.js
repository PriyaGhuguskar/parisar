// Auth hardening (CODE-REVIEW C2, HIGH 4/7, MEDIUM 6/9, LOW 8): the server
// actions trust only the cookie session, the post-OTP mode is computed from
// my_login_state, OTP errors are coded, and the middleware denies by default.
//
// JavaScript only — no TypeScript per CLAUDE.md.

import { beforeEach, describe, expect, it, vi } from "vitest";

const mockGetUser = vi.fn();
const mockGetSession = vi.fn();
const mockSetSession = vi.fn();
const mockRpc = vi.fn();
const mockSignInWithOtp = vi.fn();
vi.mock("../lib/supabase/server", () => ({
  createSupabaseServerClient: async () => ({
    auth: {
      getUser: mockGetUser,
      getSession: mockGetSession,
      setSession: mockSetSession,
      signInWithOtp: mockSignInWithOtp,
    },
    rpc: (...a) => mockRpc(...a),
  }),
}));

vi.mock("next/headers", () => ({
  headers: async () => new Map([["x-forwarded-for", "203.0.113.5, 10.0.0.1"]]),
}));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));

const mockRunPinLogin = vi.fn();
const mockRunSetPin = vi.fn();
vi.mock("../lib/auth/pinCore", async (orig) => ({
  ...(await orig()),
  runPinLogin: (...a) => mockRunPinLogin(...a),
  runSetPin: (...a) => mockRunSetPin(...a),
}));
const mockPinServerDeps = vi.fn();
vi.mock("../lib/auth/pinSecret", () => ({
  pinServerDeps: (...a) => mockPinServerDeps(...a),
}));

import { sendOtpAction } from "../app/actions/auth";
import {
  claimAuthority,
  claimFamilyMember,
  claimGuard,
  pinLogin,
  setMyPin,
  setPin,
} from "../app/actions/codeLogin";
import { loginModeFromState, safeNextPath } from "../lib/auth/loginMode";
import { otpErrorCode, otpErrorKey } from "../lib/auth/otpErrors";
import { isPublicPath, sameOriginNext } from "../lib/supabase/middleware";

const USER = { id: "u-1", phone: "919812345678" };

beforeEach(() => {
  vi.clearAllMocks();
  mockGetUser.mockResolvedValue({ data: { user: USER } });
  mockGetSession.mockResolvedValue({ data: { session: { access_token: "cookie-token" } } });
  mockSetSession.mockResolvedValue({ error: null });
  mockPinServerDeps.mockReturnValue({ pepper: "p" });
});

describe("setPin / setMyPin (C2: no client-supplied identity)", () => {
  it("ignores the userId/phone arguments and uses the cookie session's token", async () => {
    mockRunSetPin.mockResolvedValue({ ok: true });
    const r = await setPin("victim-uuid", "+919000000001", "4821");
    expect(r).toEqual({ ok: true });
    expect(mockRunSetPin).toHaveBeenCalledWith(
      { accessToken: "cookie-token", pin: "4821" },
      expect.objectContaining({ pepper: "p" }),
    );
    expect(JSON.stringify(mockRunSetPin.mock.calls)).not.toContain("victim-uuid");
  });

  it("refuses without a session", async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } });
    await expect(setMyPin("4821")).resolves.toEqual({ error: "AUTH_REQUIRED" });
    expect(mockRunSetPin).not.toHaveBeenCalled();
  });

  it("fails closed when the PIN service is misconfigured (no pepper)", async () => {
    mockPinServerDeps.mockImplementation(() => {
      throw new Error("PIN_PEPPER_MISSING");
    });
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(setMyPin("4821")).resolves.toEqual({ error: "SERVER_ERROR" });
    spy.mockRestore();
  });
});

describe("pinLogin (server-side PIN check)", () => {
  it("checks the session's own phone with the caller IP and adopts the session", async () => {
    mockRunPinLogin.mockResolvedValue({
      ok: true,
      session: { access_token: "a", refresh_token: "r", user: { id: "u-1" } },
    });
    await expect(pinLogin("4821")).resolves.toEqual({ ok: true });
    expect(mockRunPinLogin).toHaveBeenCalledWith(
      { phone: USER.phone, pin: "4821", ip: "203.0.113.5" },
      expect.any(Object),
    );
    expect(mockSetSession).toHaveBeenCalledWith({ access_token: "a", refresh_token: "r" });
  });

  it("passes lockout details through", async () => {
    mockRunPinLogin.mockResolvedValue({ error: "LOCKED", retryAfterSeconds: 600 });
    await expect(pinLogin("4821")).resolves.toEqual({ error: "LOCKED", retryAfterSeconds: 600 });
    expect(mockSetSession).not.toHaveBeenCalled();
  });

  it("never adopts a session for a different user", async () => {
    mockRunPinLogin.mockResolvedValue({
      ok: true,
      session: { access_token: "a", refresh_token: "r", user: { id: "other" } },
    });
    await expect(pinLogin("4821")).resolves.toEqual({ error: "SERVER_ERROR" });
    expect(mockSetSession).not.toHaveBeenCalled();
  });

  it("validates input and requires a session", async () => {
    await expect(pinLogin("12")).resolves.toEqual({ error: "INVALID_INPUT" });
    mockGetUser.mockResolvedValue({ data: { user: null } });
    await expect(pinLogin("4821")).resolves.toEqual({ error: "AUTH_REQUIRED" });
  });
});

describe("claim actions (MEDIUM 7: cookie session, not a client token)", () => {
  it("claimAuthority runs the RPC on the cookie-bound client", async () => {
    mockRpc.mockResolvedValue({ data: { society_id: "s1", needs_setup: true }, error: null });
    await expect(claimAuthority("attacker-supplied-token")).resolves.toEqual({
      ok: true,
      societyId: "s1",
      needsSetup: true,
      needsFlat: false,
    });
    expect(mockRpc).toHaveBeenCalledWith("claim_society_authority");
  });

  it("claimFamilyMember / claimGuard map coded errors", async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: "NOT_A_FAMILY_MEMBER" } });
    await expect(claimFamilyMember()).resolves.toEqual({ error: "NOT_A_FAMILY_MEMBER" });
    mockRpc.mockResolvedValue({ data: null, error: { message: "boom" } });
    await expect(claimGuard()).resolves.toEqual({ error: "SERVER_ERROR" });
  });

  it("require a session", async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } });
    await expect(claimGuard()).resolves.toEqual({ error: "AUTH_REQUIRED" });
    expect(mockRpc).not.toHaveBeenCalled();
  });
});

describe("sendOtpAction (MEDIUM 6: coded errors)", () => {
  it("rejects a malformed phone without calling GoTrue", async () => {
    await expect(sendOtpAction("12345")).resolves.toEqual({ error: "invalid_phone" });
    expect(mockSignInWithOtp).not.toHaveBeenCalled();
  });
  it("maps a 429 to rate_limited, never the raw message", async () => {
    mockSignInWithOtp.mockResolvedValue({
      error: {
        status: 429,
        message: "For security purposes, you can only request this after 9 seconds.",
      },
    });
    await expect(sendOtpAction("+919812345678")).resolves.toEqual({ error: "rate_limited" });
  });
  it("succeeds", async () => {
    mockSignInWithOtp.mockResolvedValue({ error: null });
    await expect(sendOtpAction("+919812345678")).resolves.toEqual({ success: true });
  });
});

describe("otpErrorCode / otpErrorKey", () => {
  it.each([
    [{ status: 429 }, "rate_limited"],
    [{ code: "over_sms_send_rate_limit", status: 400 }, "rate_limited"],
    [{ status: 400, message: "Invalid phone number format" }, "invalid_phone"],
    [{ status: 0, name: "AuthRetryableFetchError", message: "Failed to fetch" }, "network"],
    [{ status: 500, message: "Database error" }, "unknown"],
  ])("%j → %s", (err, code) => {
    expect(otpErrorCode(err)).toBe(code);
  });
  it("maps codes to localized keys", () => {
    expect(otpErrorKey("rate_limited")).toBe("auth.rateLimited");
    expect(otpErrorKey("invalid_phone")).toBe("auth.invalidPhone");
    expect(otpErrorKey("unknown")).toBe("auth.networkError");
  });
});

describe("loginModeFromState (mode decided AFTER OTP)", () => {
  const base = {
    staff: false,
    guard: null,
    authority: false,
    membership: null,
    flats_in_society: null,
    family: false,
    pin_set: false,
  };
  const resident = { membership: { role: "member", flat_id: "f1" }, flats_in_society: 10 };
  it.each([
    [{ staff: true }, "staff"],
    [{ authority: true }, "authority"],
    [{ guard: "unclaimed" }, "guardclaim"],
    [{ guard: "claimed", pin_set: false }, "guardclaim"],
    [{ guard: "claimed", pin_set: true }, "guardpin"],
    [{ membership: { role: "secretary", flat_id: null }, flats_in_society: 0 }, "authority"],
    [{ membership: { role: "secretary", flat_id: null }, flats_in_society: 4 }, "authority"],
    [
      { membership: { role: "secretary", flat_id: null }, flats_in_society: 4, pin_set: true },
      "pin",
    ],
    [{ ...resident, pin_set: true }, "pin"],
    [resident, "setpin"],
    [{ family: true }, "family"],
    [{}, "code"],
  ])("%j → %s", (s, mode) => {
    expect(loginModeFromState({ ...base, ...s })).toBe(mode);
  });
  it("treats a missing state as a brand-new resident", () => {
    expect(loginModeFromState(null)).toBe("code");
  });
});

describe("safeNextPath (LOW 8: no open redirect)", () => {
  it.each([
    ["/community", "/community"],
    ["/dashboard?x=1", "/dashboard?x=1"],
    ["//evil.com", "/dashboard"],
    ["/\\evil.com", "/dashboard"],
    ["https://evil.com", "/dashboard"],
    [null, "/dashboard"],
  ])("%s → %s", (input, out) => {
    expect(safeNextPath(input)).toBe(out);
  });
});

describe("isPublicPath (MEDIUM 9: deny by default)", () => {
  it.each(["/", "/login", "/verify", "/enroll", "/work-with-us", "/api/health"])(
    "%s is public",
    (p) => {
      expect(isPublicPath(p)).toBe(true);
    },
  );
  it.each(["/parisar-logo.png", "/manifest.webmanifest", "/_next/static/chunk.js", "/login/"])(
    "%s is public (static / normalised)",
    (p) => {
      expect(isPublicPath(p)).toBe(true);
    },
  );
  // /join/* requires a session so the middleware redirect carries ?next= (with
  // the share code) through sign-in.
  it.each([
    "/dashboard",
    "/c/abc123",
    "/admin",
    "/guard",
    "/onboarding",
    "/setup/structure",
    "/join/code",
    "/join",
  ])("%s requires a session", (p) => {
    expect(isPublicPath(p)).toBe(false);
  });
  it("dev-only routes are public only in development", () => {
    expect(isPublicPath("/dev-login")).toBe(false);
    expect(isPublicPath("/dev-login", { isDev: true })).toBe(true);
    expect(isPublicPath("/dev-preview", { isDev: true })).toBe(true);
  });
});

describe("sameOriginNext (sign-in redirect keeps the path + query)", () => {
  it.each([
    ["/join/code?code=PAR7-XKM2", "/join/code?code=PAR7-XKM2"],
    ["/community/abc", "/community/abc"],
    ["//evil.com/x", "/dashboard"],
    ["/\\evil.com", "/dashboard"],
    ["https://evil.com", "/dashboard"],
  ])("%s → %s", (input, out) => {
    expect(sameOriginNext(input)).toBe(out);
  });
});
