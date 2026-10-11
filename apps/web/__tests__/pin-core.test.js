// Unit tests for the shared PIN credential logic (lib/auth/pinCore.js, a copy
// of supabase/functions/pin-login/pin-core.js). CODE-REVIEW C2 + HIGH 2.
//
// JavaScript only — no TypeScript per CLAUDE.md.

import { createHmac } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";
import {
  clientIpFrom,
  DEV_PIN_PEPPER,
  decodeJwtPayload,
  derivePinSecret,
  hasRecentOtp,
  isWeakPin,
  legacyPinSecret,
  maskPhone,
  normalizePhoneDigits,
  PHONE_MAX_FAILURES,
  PIN_FIRST_SET_OTP_MAX_AGE_SECONDS,
  PIN_RESET_OTP_MAX_AGE_SECONDS,
  resolvePepper,
  runPinLogin,
  runSetPin,
} from "../lib/auth/pinCore";

const here = path.dirname(fileURLToPath(import.meta.url));
const PEPPER = "a-test-pepper-that-is-long-enough-123456";

function jwt(payload) {
  const enc = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
  return `${enc({ alg: "HS256" })}.${enc(payload)}.sig`;
}

describe("pinCore parity", () => {
  it("web copy is byte-identical to the Edge Function's pin-core.js", () => {
    const web = readFileSync(path.join(here, "../lib/auth/pinCore.js"), "utf8");
    const edge = readFileSync(
      path.join(here, "../../../supabase/functions/pin-login/pin-core.js"),
      "utf8",
    );
    expect(web.replace(/\r\n/g, "\n")).toBe(edge.replace(/\r\n/g, "\n"));
  });
});

describe("derivePinSecret (peppered)", () => {
  it("is HMAC-SHA256(pepper, '<91phone>:<pin>') in base64url with a pk2 prefix", async () => {
    const expected = `pk2.${createHmac("sha256", PEPPER).update("919812345678:4821").digest("base64url")}`;
    await expect(derivePinSecret(PEPPER, "+919812345678", "4821")).resolves.toBe(expected);
  });

  it("normalises phone formatting", async () => {
    const a = await derivePinSecret(PEPPER, "+91 98123 45678", "4821");
    const b = await derivePinSecret(PEPPER, "9812345678", "4821");
    expect(a).toBe(b);
  });

  it("depends on the pepper (not computable without it)", async () => {
    const a = await derivePinSecret(PEPPER, "9812345678", "4821");
    const b = await derivePinSecret(`${PEPPER}x`, "9812345678", "4821");
    expect(a).not.toBe(b);
    expect(a).not.toContain("4821");
    expect(a).not.toContain("9812345678");
  });

  it("rejects bad input and a missing pepper", async () => {
    await expect(derivePinSecret("", "9812345678", "4821")).rejects.toThrow("PIN_PEPPER_MISSING");
    await expect(derivePinSecret(PEPPER, "12345", "4821")).rejects.toThrow("INVALID_PHONE");
    await expect(derivePinSecret(PEPPER, "9812345678", "48a1")).rejects.toThrow("INVALID_PIN");
  });

  it("legacy secret keeps the old pk1 format for upgrade detection only", () => {
    expect(legacyPinSecret("+919812345678", "4821")).toBe("pk1.919812345678.4821");
  });
});

describe("resolvePepper (fail closed)", () => {
  it("throws when unset outside dev", () => {
    expect(() => resolvePepper(undefined, { isDev: false })).toThrow("PIN_PEPPER_MISSING");
    expect(() => resolvePepper("  ", { isDev: false })).toThrow("PIN_PEPPER_MISSING");
  });
  it("uses the dev pepper only in dev", () => {
    expect(resolvePepper(undefined, { isDev: true })).toBe(DEV_PIN_PEPPER);
  });
  it("rejects a short pepper even in dev", () => {
    expect(() => resolvePepper("short", { isDev: true })).toThrow("PIN_PEPPER_WEAK");
  });
  it("returns a configured pepper", () => {
    expect(resolvePepper(PEPPER, { isDev: false })).toBe(PEPPER);
  });
});

describe("small helpers", () => {
  it("normalizePhoneDigits", () => {
    expect(normalizePhoneDigits("9812345678")).toBe("919812345678");
    expect(normalizePhoneDigits("+91 98123-45678")).toBe("919812345678");
    expect(normalizePhoneDigits("5812345678")).toBeNull();
    expect(normalizePhoneDigits(null)).toBeNull();
  });
  it("maskPhone never prints the full number", () => {
    expect(maskPhone("+919812345678")).toBe("******5678");
    expect(maskPhone("")).toBe("***");
  });
  it("isWeakPin", () => {
    expect(isWeakPin("1234")).toBe(true);
    expect(isWeakPin("7777")).toBe(true);
    expect(isWeakPin("4821")).toBe(false);
  });
  it("clientIpFrom takes the first forwarded hop and rejects junk", () => {
    expect(clientIpFrom("203.0.113.9, 10.0.0.1", null)).toBe("203.0.113.9");
    expect(clientIpFrom(null, "2001:db8::1")).toBe("2001:db8::1");
    expect(clientIpFrom("<script>", null)).toBeNull();
  });
  it("decodeJwtPayload", () => {
    expect(decodeJwtPayload(jwt({ sub: "u1" }))).toEqual({ sub: "u1" });
    expect(decodeJwtPayload("garbage")).toBeNull();
  });
  it("hasRecentOtp reads the amr claim", () => {
    const now = 1_000_000;
    expect(hasRecentOtp({ amr: [{ method: "otp", timestamp: now - 60 }] }, now, 600)).toBe(true);
    expect(hasRecentOtp({ amr: [{ method: "otp", timestamp: now - 601 }] }, now, 600)).toBe(false);
    expect(hasRecentOtp({ amr: [{ method: "password", timestamp: now }] }, now, 600)).toBe(false);
    expect(hasRecentOtp({}, now, 600)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// runPinLogin
// ---------------------------------------------------------------------------

/** In-memory stand-in for app_private.auth_throttle (same semantics as 056). */
function memoryThrottle() {
  const rows = new Map();
  let now = 0;
  return {
    rows,
    tick: (s) => {
      now += s * 1000;
    },
    now: () => now,
    throttleAttempt: vi.fn(async (key, max, windowS, lockS) => {
      const r = rows.get(key) ?? { failures: 0, windowStart: now, lockedUntil: null };
      if (r.lockedUntil && r.lockedUntil > now) {
        return {
          allowed: false,
          failures: r.failures,
          locked_until: new Date(r.lockedUntil).toISOString(),
        };
      }
      if (r.lockedUntil || r.windowStart < now - windowS * 1000) {
        r.failures = 0;
        r.windowStart = now;
        r.lockedUntil = null;
      }
      r.failures += 1;
      if (r.failures >= max) r.lockedUntil = now + lockS * 1000;
      rows.set(key, r);
      return { allowed: true, failures: r.failures, locked_until: null };
    }),
    throttleSuccess: vi.fn(async (key, mode) => {
      if (mode === "undo") {
        const r = rows.get(key);
        if (r) {
          r.failures = Math.max(0, r.failures - 1);
          if (r.failures === 0) r.lockedUntil = null;
        }
      } else rows.delete(key);
    }),
  };
}

function loginDeps(overrides = {}) {
  const t = memoryThrottle();
  const accounts = overrides.accounts ?? {};
  const passwordGrant = vi.fn(async (phone, password) => {
    const acct = accounts[phone];
    if (acct && acct.password === password) {
      return {
        ok: true,
        session: { access_token: "at", refresh_token: "rt", user: { id: acct.id } },
      };
    }
    return { ok: false, invalid: true, status: 400 };
  });
  const upgradePassword = vi.fn(async (userId, password) => {
    for (const a of Object.values(accounts)) if (a.id === userId) a.password = password;
  });
  return {
    t,
    deps: {
      pepper: PEPPER,
      throttleAttempt: t.throttleAttempt,
      throttleSuccess: t.throttleSuccess,
      passwordGrant: overrides.passwordGrant ?? passwordGrant,
      upgradePassword: overrides.upgradePassword ?? upgradePassword,
      now: t.now,
    },
    passwordGrant,
    upgradePassword,
  };
}

describe("runPinLogin", () => {
  const PHONE = "+919812345678";

  it("signs in with the peppered secret and clears the phone counter", async () => {
    const secret = await derivePinSecret(PEPPER, PHONE, "4821");
    const { deps, t } = loginDeps({ accounts: { [PHONE]: { id: "u1", password: secret } } });
    const r = await runPinLogin({ phone: PHONE, pin: "4821", ip: "203.0.113.9" }, deps);
    expect(r.ok).toBe(true);
    expect(r.session.access_token).toBe("at");
    expect(t.rows.has("pin:phone:919812345678")).toBe(false);
    expect(t.rows.get("pin:ip:203.0.113.9").failures).toBe(0);
  });

  it("returns a uniform PIN_INVALID for a wrong PIN and for an unknown phone", async () => {
    const secret = await derivePinSecret(PEPPER, PHONE, "4821");
    const { deps } = loginDeps({ accounts: { [PHONE]: { id: "u1", password: secret } } });
    const wrong = await runPinLogin({ phone: PHONE, pin: "0000" }, deps);
    const unknown = await runPinLogin({ phone: "+919000000099", pin: "0000" }, deps);
    expect(wrong.error).toBe("PIN_INVALID");
    expect(unknown.error).toBe("PIN_INVALID");
  });

  it(`locks the phone after ${PHONE_MAX_FAILURES} failures for 15 minutes`, async () => {
    const secret = await derivePinSecret(PEPPER, PHONE, "4821");
    const { deps, t, passwordGrant } = loginDeps({
      accounts: { [PHONE]: { id: "u1", password: secret } },
    });
    for (let i = 0; i < PHONE_MAX_FAILURES; i += 1) {
      const r = await runPinLogin({ phone: PHONE, pin: "0000" }, deps);
      expect(r.error).toBe("PIN_INVALID");
    }
    const calls = passwordGrant.mock.calls.length;
    // Even the correct PIN is refused while locked, without touching GoTrue.
    const locked = await runPinLogin({ phone: PHONE, pin: "4821" }, deps);
    expect(locked.error).toBe("LOCKED");
    expect(locked.retryAfterSeconds).toBeGreaterThan(0);
    expect(passwordGrant.mock.calls.length).toBe(calls);

    t.tick(15 * 60 + 1);
    const after = await runPinLogin({ phone: PHONE, pin: "4821" }, deps);
    expect(after.ok).toBe(true);
  });

  it("upgrades a legacy pk1 password to the peppered secret on success", async () => {
    const accounts = { [PHONE]: { id: "u1", password: legacyPinSecret(PHONE, "4821") } };
    const { deps, upgradePassword } = loginDeps({ accounts });
    const r = await runPinLogin({ phone: PHONE, pin: "4821" }, deps);
    expect(r.ok).toBe(true);
    expect(r.upgraded).toBe(true);
    const peppered = await derivePinSecret(PEPPER, PHONE, "4821");
    expect(upgradePassword).toHaveBeenCalledWith("u1", peppered);
    expect(accounts[PHONE].password).toBe(peppered);
  });

  it("counts a failed legacy fallback as ONE attempt", async () => {
    const accounts = { [PHONE]: { id: "u1", password: legacyPinSecret(PHONE, "4821") } };
    const { deps, t } = loginDeps({ accounts });
    await runPinLogin({ phone: PHONE, pin: "0000" }, deps);
    expect(t.rows.get("pin:phone:919812345678").failures).toBe(1);
  });

  it("does not try the legacy secret when disabled", async () => {
    const accounts = { [PHONE]: { id: "u1", password: legacyPinSecret(PHONE, "4821") } };
    const { deps } = loginDeps({ accounts });
    const r = await runPinLogin({ phone: PHONE, pin: "4821" }, { ...deps, allowLegacy: false });
    expect(r.error).toBe("PIN_INVALID");
  });

  it("an upstream outage is SERVER_ERROR and does not count against the user", async () => {
    const { deps, t } = loginDeps({
      passwordGrant: vi.fn(async () => ({ ok: false, invalid: false, status: 503 })),
    });
    const r = await runPinLogin({ phone: PHONE, pin: "4821" }, deps);
    expect(r.error).toBe("SERVER_ERROR");
    expect(t.rows.get("pin:phone:919812345678").failures).toBe(0);
  });

  it("maps a GoTrue 429 to RATE_LIMITED", async () => {
    const { deps } = loginDeps({
      passwordGrant: vi.fn(async () => ({ ok: false, invalid: false, status: 429 })),
    });
    const r = await runPinLogin({ phone: PHONE, pin: "4821" }, deps);
    expect(r.error).toBe("RATE_LIMITED");
  });

  it("rate-limits one IP spraying many phones", async () => {
    const { deps } = loginDeps();
    let last;
    for (let i = 0; i < 31; i += 1) {
      const phone = `+9190000${String(10000 + i).slice(-5)}`;
      last = await runPinLogin({ phone, pin: "0000", ip: "198.51.100.7" }, deps);
    }
    expect(last.error).toBe("RATE_LIMITED");
  });

  it("fails closed when the throttle is unavailable", async () => {
    const { deps } = loginDeps();
    const r = await runPinLogin(
      { phone: PHONE, pin: "4821" },
      { ...deps, throttleAttempt: vi.fn(async () => Promise.reject(new Error("db down"))) },
    );
    expect(r.error).toBe("SERVER_ERROR");
  });

  it("rejects malformed input before counting anything", async () => {
    const { deps, t } = loginDeps();
    expect((await runPinLogin({ phone: "123", pin: "4821" }, deps)).error).toBe("INVALID_INPUT");
    expect((await runPinLogin({ phone: PHONE, pin: "12" }, deps)).error).toBe("INVALID_INPUT");
    expect(t.rows.size).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// runSetPin
// ---------------------------------------------------------------------------

describe("runSetPin", () => {
  const NOW = 2_000_000_000_000;
  const nowS = NOW / 1000;

  function setDeps({ user = { id: "u1", phone: "919812345678" }, pinSet = false } = {}) {
    return {
      pepper: PEPPER,
      now: () => NOW,
      getUser: vi.fn(async () => user),
      getPinSet: vi.fn(async () => pinSet),
      setPassword: vi.fn(async () => {}),
      markPinSet: vi.fn(async () => {}),
    };
  }

  it("writes the peppered secret for the session's own phone", async () => {
    const deps = setDeps();
    const token = jwt({ sub: "u1", amr: [{ method: "otp", timestamp: nowS - 30 }] });
    await expect(runSetPin({ accessToken: token, pin: "4821" }, deps)).resolves.toEqual({
      ok: true,
    });
    expect(deps.setPassword).toHaveBeenCalledWith(
      "u1",
      await derivePinSecret(PEPPER, "919812345678", "4821"),
    );
    expect(deps.markPinSet).toHaveBeenCalledWith("u1");
  });

  it("requires a session", async () => {
    const deps = setDeps({ user: null });
    expect((await runSetPin({ accessToken: "", pin: "4821" }, deps)).error).toBe("AUTH_REQUIRED");
    const token = jwt({ sub: "u1", amr: [{ method: "otp", timestamp: nowS }] });
    expect((await runSetPin({ accessToken: token, pin: "4821" }, deps)).error).toBe(
      "AUTH_REQUIRED",
    );
  });

  it("rejects a token whose subject is not the verified user", async () => {
    const deps = setDeps();
    const token = jwt({ sub: "someone-else", amr: [{ method: "otp", timestamp: nowS }] });
    expect((await runSetPin({ accessToken: token, pin: "4821" }, deps)).error).toBe(
      "AUTH_REQUIRED",
    );
    expect(deps.setPassword).not.toHaveBeenCalled();
  });

  it("requires a recent OTP — stricter for a reset than a first PIN", async () => {
    const firstOk = jwt({
      sub: "u1",
      amr: [{ method: "otp", timestamp: nowS - (PIN_FIRST_SET_OTP_MAX_AGE_SECONDS - 5) }],
    });
    expect((await runSetPin({ accessToken: firstOk, pin: "4821" }, setDeps())).ok).toBe(true);

    const tooOldForReset = jwt({
      sub: "u1",
      amr: [{ method: "otp", timestamp: nowS - (PIN_RESET_OTP_MAX_AGE_SECONDS + 5) }],
    });
    expect(
      (await runSetPin({ accessToken: tooOldForReset, pin: "4821" }, setDeps({ pinSet: true })))
        .error,
    ).toBe("REAUTH_REQUIRED");

    const passwordSession = jwt({ sub: "u1", amr: [{ method: "password", timestamp: nowS }] });
    expect((await runSetPin({ accessToken: passwordSession, pin: "4821" }, setDeps())).error).toBe(
      "REAUTH_REQUIRED",
    );
  });

  it("refuses weak and malformed PINs", async () => {
    const token = jwt({ sub: "u1", amr: [{ method: "otp", timestamp: nowS }] });
    expect((await runSetPin({ accessToken: token, pin: "1234" }, setDeps())).error).toBe(
      "WEAK_PIN",
    );
    expect((await runSetPin({ accessToken: token, pin: "12a4" }, setDeps())).error).toBe(
      "INVALID_PIN",
    );
  });

  it("SERVER_ERROR when the credential write fails", async () => {
    const deps = setDeps();
    deps.setPassword.mockRejectedValue(new Error("boom"));
    const token = jwt({ sub: "u1", amr: [{ method: "otp", timestamp: nowS }] });
    expect((await runSetPin({ accessToken: token, pin: "4821" }, deps)).error).toBe("SERVER_ERROR");
    expect(deps.markPinSet).not.toHaveBeenCalled();
  });
});
