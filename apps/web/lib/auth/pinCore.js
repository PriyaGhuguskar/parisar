// pin-core.js — the PIN credential logic, shared by the pin-login Edge Function
// and the website's server actions.
//
// KEEP IN SYNC: apps/web/lib/auth/pinCore.js is a byte-for-byte copy of this
// file (Next.js cannot import from supabase/functions, and the Edge Function
// bundle cannot import from apps/). apps/web/__tests__/pin-core-parity.test.js
// fails the build if the two drift apart.
//
// Rules: plain ES module, no imports, no Deno / Node globals beyond WebCrypto
// (globalThis.crypto.subtle), fetch, atob/btoa and TextEncoder — all available
// in both runtimes.
//
// WHY A PEPPER. A 4-digit PIN has 10,000 values. The old credential was
// `pk1.<phone>.<pin>`, computable by anyone, so anybody holding the public anon
// key could call signInWithPassword and walk all 10,000 PINs. The credential is
// now HMAC-SHA256(PIN_PEPPER, "<phone>:<pin>") — without the server-held pepper
// the password cannot be computed, so the ONLY way to try a PIN is through the
// server, which counts failures and locks the phone (runPinLogin below).
//
// JavaScript only — no TypeScript per CLAUDE.md.

export const PIN_SECRET_VERSION = "pk2";
export const LEGACY_PIN_SECRET_VERSION = "pk1";

export const PHONE_MAX_FAILURES = 5;
export const PHONE_WINDOW_SECONDS = 15 * 60;
export const PHONE_LOCK_SECONDS = 15 * 60;
// Per-IP: catches one client spraying guesses across many phones. Only failures
// count (successes are undone), so a society Wi-Fi / mobile CGNAT is not locked
// out by its residents signing in normally.
export const IP_MAX_FAILURES = 30;
export const IP_WINDOW_SECONDS = 15 * 60;
export const IP_LOCK_SECONDS = 15 * 60;

// "Recently verified by OTP" windows for writing a PIN. Resetting an existing PIN
// is stricter than choosing the first one (which may follow a long onboarding).
export const PIN_RESET_OTP_MAX_AGE_SECONDS = 10 * 60;
export const PIN_FIRST_SET_OTP_MAX_AGE_SECONDS = 30 * 60;

export const MIN_PEPPER_LENGTH = 32;
// Used ONLY when no PIN_PEPPER is configured AND the caller says it is running
// locally. Both the website and the Edge Function use this same value so a PIN
// set on one works on the other in local dev. Never valid in production.
export const DEV_PIN_PEPPER = "parisar-local-dev-pin-pepper-not-a-secret-0000";

const PHONE_DIGITS_RE = /^91[6-9]\d{9}$/;
const PIN_RE = /^\d{4}$/;
const OTP_AMR_METHODS = new Set(["otp", "sms"]);

/** Digits with the 91 country code ("919812345678"), or null if not an Indian mobile. */
export function normalizePhoneDigits(raw) {
  let d = String(raw ?? "").replace(/\D/g, "");
  if (d.length === 10) d = `91${d}`;
  return PHONE_DIGITS_RE.test(d) ? d : null;
}

/** For logs: never print a full phone number. */
export function maskPhone(raw) {
  const d = String(raw ?? "").replace(/\D/g, "");
  return d.length >= 4 ? `******${d.slice(-4)}` : "***";
}

export function isValidPin(pin) {
  return typeof pin === "string" && PIN_RE.test(pin);
}

/** 1234 or four identical digits — refused when CHOOSING a PIN. */
export function isWeakPin(pin) {
  return pin === "1234" || /^(\d)\1{3}$/.test(String(pin ?? ""));
}

/**
 * The pepper, or throw. Fails closed: an unset pepper is only tolerated when
 * the caller has established it is running locally.
 * @param {string|undefined|null} value configured PIN_PEPPER
 * @param {{ isDev: boolean }} opts
 */
export function resolvePepper(value, { isDev }) {
  const v = typeof value === "string" ? value.trim() : "";
  if (!v) {
    if (isDev) return DEV_PIN_PEPPER;
    throw new Error("PIN_PEPPER_MISSING");
  }
  if (v.length < MIN_PEPPER_LENGTH) throw new Error("PIN_PEPPER_WEAK");
  return v;
}

function base64url(bytes) {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/**
 * The peppered PIN credential: "pk2." + base64url(HMAC-SHA256(pepper, phone:pin)).
 * Server-only — the pepper must never reach a client.
 */
export async function derivePinSecret(pepper, rawPhone, pin) {
  if (!pepper) throw new Error("PIN_PEPPER_MISSING");
  const phone = normalizePhoneDigits(rawPhone);
  if (!phone) throw new Error("INVALID_PHONE");
  if (!isValidPin(pin)) throw new Error("INVALID_PIN");
  const enc = new TextEncoder();
  const key = await globalThis.crypto.subtle.importKey(
    "raw",
    enc.encode(pepper),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await globalThis.crypto.subtle.sign("HMAC", key, enc.encode(`${phone}:${pin}`));
  return `${PIN_SECRET_VERSION}.${base64url(new Uint8Array(sig))}`;
}

/** The pre-pepper credential, used ONLY to recognise and upgrade old accounts. */
export function legacyPinSecret(rawPhone, pin) {
  const phone = normalizePhoneDigits(rawPhone);
  if (!phone) throw new Error("INVALID_PHONE");
  if (!isValidPin(pin)) throw new Error("INVALID_PIN");
  return `${LEGACY_PIN_SECRET_VERSION}.${phone}.${pin}`;
}

/** Decode (NOT verify) a JWT payload. Only use on a token GoTrue already validated. */
export function decodeJwtPayload(token) {
  try {
    const part = String(token ?? "").split(".")[1];
    if (!part) return null;
    const b64 = part.replace(/-/g, "+").replace(/_/g, "/");
    const padded = b64 + "=".repeat((4 - (b64.length % 4)) % 4);
    const bin = atob(padded);
    const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
    return JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    return null;
  }
}

/**
 * Was this session established by an OTP within maxAgeSeconds? Reads the `amr`
 * claim GoTrue writes into every access token (it survives token refresh).
 */
export function hasRecentOtp(claims, nowSeconds, maxAgeSeconds) {
  const amr = Array.isArray(claims?.amr) ? claims.amr : [];
  return amr.some(
    (e) =>
      e &&
      OTP_AMR_METHODS.has(e.method) &&
      Number.isFinite(e.timestamp) &&
      nowSeconds - e.timestamp <= maxAgeSeconds &&
      e.timestamp <= nowSeconds + 60,
  );
}

function retryAfter(lockedUntil, nowMs) {
  const t = Date.parse(lockedUntil ?? "");
  if (!Number.isFinite(t)) return PHONE_LOCK_SECONDS;
  return Math.max(1, Math.ceil((t - nowMs) / 1000));
}

/**
 * PIN sign-in. Never reveals whether the phone has an account: a missing
 * account and a wrong PIN both return PIN_INVALID and both count a failure.
 *
 * @param {{ phone: string, pin: string, ip?: string|null }} input
 * @param {{
 *   pepper: string,
 *   throttleAttempt: (key: string, max: number, windowS: number, lockS: number) =>
 *     Promise<{ allowed: boolean, failures: number, locked_until: string|null }>,
 *   throttleSuccess: (key: string, mode: "clear"|"undo") => Promise<void>,
 *   passwordGrant: (phoneE164: string, password: string) =>
 *     Promise<{ ok: true, session: object } | { ok: false, invalid: boolean, status: number }>,
 *   upgradePassword: (userId: string, password: string) => Promise<void>,
 *   allowLegacy?: boolean,
 *   now?: () => number,
 *   log?: (msg: string) => void,
 * }} deps
 * @returns {Promise<{ ok: true, session: object, upgraded: boolean }
 *   | { error: "INVALID_INPUT"|"PIN_INVALID"|"LOCKED"|"RATE_LIMITED"|"SERVER_ERROR",
 *       retryAfterSeconds?: number, remaining?: number }>}
 */
export async function runPinLogin(input, deps) {
  const now = deps.now ?? (() => Date.now());
  const log = deps.log ?? (() => {});
  const digits = normalizePhoneDigits(input?.phone);
  const pin = typeof input?.pin === "string" ? input.pin : "";
  if (!digits || !isValidPin(pin)) return { error: "INVALID_INPUT" };

  const phoneKey = `pin:phone:${digits}`;
  const ip = typeof input?.ip === "string" ? input.ip.trim().slice(0, 64) : "";
  const ipKey = ip ? `pin:ip:${ip}` : null;

  // Undo the pessimistic counts when the failure was ours, not the user's.
  const undoAll = async () => {
    await deps.throttleSuccess(phoneKey, "undo").catch(() => {});
    if (ipKey) await deps.throttleSuccess(ipKey, "undo").catch(() => {});
  };

  let phoneState;
  try {
    if (ipKey) {
      const ipState = await deps.throttleAttempt(
        ipKey,
        IP_MAX_FAILURES,
        IP_WINDOW_SECONDS,
        IP_LOCK_SECONDS,
      );
      if (!ipState?.allowed) {
        return {
          error: "RATE_LIMITED",
          retryAfterSeconds: retryAfter(ipState?.locked_until, now()),
        };
      }
    }
    phoneState = await deps.throttleAttempt(
      phoneKey,
      PHONE_MAX_FAILURES,
      PHONE_WINDOW_SECONDS,
      PHONE_LOCK_SECONDS,
    );
  } catch {
    log("pin-login: throttle unavailable");
    return { error: "SERVER_ERROR" };
  }
  if (!phoneState?.allowed) {
    return { error: "LOCKED", retryAfterSeconds: retryAfter(phoneState?.locked_until, now()) };
  }

  const phoneE164 = `+${digits}`;
  let secret;
  try {
    secret = await derivePinSecret(deps.pepper, digits, pin);
  } catch {
    await undoAll();
    return { error: "SERVER_ERROR" };
  }

  const succeed = async (session, upgraded) => {
    await deps.throttleSuccess(phoneKey, "clear").catch(() => {});
    if (ipKey) await deps.throttleSuccess(ipKey, "undo").catch(() => {});
    return { ok: true, session, upgraded };
  };
  const notOurFault = async (r) => {
    await undoAll();
    return r?.status === 429
      ? { error: "RATE_LIMITED", retryAfterSeconds: 60 }
      : { error: "SERVER_ERROR" };
  };

  const first = await deps
    .passwordGrant(phoneE164, secret)
    .catch(() => ({ ok: false, invalid: false, status: 0 }));
  if (first.ok) return succeed(first.session, false);
  if (!first.invalid) return notOurFault(first);

  // Legacy account (password still `pk1.<phone>.<pin>`): one server-side try,
  // inside the same counted attempt, then upgrade to the peppered secret.
  if (deps.allowLegacy !== false) {
    const legacy = await deps
      .passwordGrant(phoneE164, legacyPinSecret(digits, pin))
      .catch(() => ({ ok: false, invalid: false, status: 0 }));
    if (legacy.ok) {
      const userId = legacy.session?.user?.id;
      let upgraded = false;
      if (userId) {
        try {
          await deps.upgradePassword(userId, secret);
          upgraded = true;
        } catch {
          log(`pin-login: legacy upgrade failed for ${maskPhone(digits)}`);
        }
      }
      return succeed(legacy.session, upgraded);
    }
    if (!legacy.invalid) return notOurFault(legacy);
  }

  const remaining = Math.max(0, PHONE_MAX_FAILURES - (phoneState.failures ?? PHONE_MAX_FAILURES));
  return { error: "PIN_INVALID", remaining };
}

/**
 * Write a PIN for the user who owns `accessToken`. The phone comes from the
 * verified user, never from the caller, and the session must have been minted
 * by an OTP recently.
 *
 * @param {{ accessToken: string, pin: string }} input
 * @param {{
 *   pepper: string,
 *   getUser: (accessToken: string) => Promise<{ id: string, phone: string|null } | null>,
 *   getPinSet: (userId: string) => Promise<boolean>,
 *   setPassword: (userId: string, password: string) => Promise<void>,
 *   markPinSet: (userId: string) => Promise<void>,
 *   now?: () => number,
 * }} deps
 * @returns {Promise<{ ok: true } | { error: "AUTH_REQUIRED"|"REAUTH_REQUIRED"|"INVALID_PIN"|"WEAK_PIN"|"SERVER_ERROR" }>}
 */
export async function runSetPin(input, deps) {
  const now = deps.now ?? (() => Date.now());
  const pin = typeof input?.pin === "string" ? input.pin : "";
  if (!isValidPin(pin)) return { error: "INVALID_PIN" };
  if (isWeakPin(pin)) return { error: "WEAK_PIN" };
  const token = input?.accessToken;
  if (!token) return { error: "AUTH_REQUIRED" };

  let user;
  try {
    user = await deps.getUser(token);
  } catch {
    return { error: "SERVER_ERROR" };
  }
  if (!user?.id) return { error: "AUTH_REQUIRED" };
  const claims = decodeJwtPayload(token);
  if (!claims || claims.sub !== user.id) return { error: "AUTH_REQUIRED" };
  const phone = normalizePhoneDigits(user.phone);
  if (!phone) return { error: "AUTH_REQUIRED" };

  let pinSet;
  try {
    pinSet = await deps.getPinSet(user.id);
  } catch {
    return { error: "SERVER_ERROR" };
  }
  const maxAge = pinSet ? PIN_RESET_OTP_MAX_AGE_SECONDS : PIN_FIRST_SET_OTP_MAX_AGE_SECONDS;
  if (!hasRecentOtp(claims, Math.floor(now() / 1000), maxAge)) return { error: "REAUTH_REQUIRED" };

  try {
    const secret = await derivePinSecret(deps.pepper, phone, pin);
    await deps.setPassword(user.id, secret);
    await deps.markPinSet(user.id);
  } catch {
    return { error: "SERVER_ERROR" };
  }
  return { ok: true };
}

// ---------------------------------------------------------------------------
// HTTP adapters (plain fetch — usable from Deno and Node alike)
// ---------------------------------------------------------------------------

/**
 * @param {{ url: string, anonKey: string, serviceKey: string, fetchImpl?: typeof fetch,
 *           forwardedFor?: string|null }} cfg
 */
export function makeGoTrueDeps(cfg) {
  const f = cfg.fetchImpl ?? globalThis.fetch;
  const base = String(cfg.url ?? "").replace(/\/+$/, "");
  const svcHeaders = {
    apikey: cfg.serviceKey,
    Authorization: `Bearer ${cfg.serviceKey}`,
    "Content-Type": "application/json",
  };

  async function rpc(fn, args) {
    const res = await f(`${base}/rest/v1/rpc/${fn}`, {
      method: "POST",
      headers: svcHeaders,
      body: JSON.stringify(args),
    });
    if (!res.ok) throw new Error(`RPC_${fn}_${res.status}`);
    const text = await res.text();
    return text ? JSON.parse(text) : null;
  }

  async function setPassword(userId, password) {
    const res = await f(`${base}/auth/v1/admin/users/${encodeURIComponent(userId)}`, {
      method: "PUT",
      headers: svcHeaders,
      body: JSON.stringify({ password }),
    });
    if (!res.ok) throw new Error(`ADMIN_UPDATE_${res.status}`);
  }

  return {
    throttleAttempt: (key, max, windowS, lockS) =>
      rpc("auth_throttle_attempt", {
        p_key: key,
        p_max: max,
        p_window_seconds: windowS,
        p_lock_seconds: lockS,
      }),
    throttleSuccess: async (key, mode) => {
      await rpc("auth_throttle_success", { p_key: key, p_mode: mode });
    },
    passwordGrant: async (phoneE164, password) => {
      const headers = { apikey: cfg.anonKey, "Content-Type": "application/json" };
      if (cfg.forwardedFor) headers["X-Forwarded-For"] = cfg.forwardedFor;
      const res = await f(`${base}/auth/v1/token?grant_type=password`, {
        method: "POST",
        headers,
        body: JSON.stringify({ phone: phoneE164, password }),
      });
      if (res.ok) return { ok: true, session: await res.json() };
      return { ok: false, invalid: [400, 401, 422].includes(res.status), status: res.status };
    },
    upgradePassword: (userId, password) => setPassword(userId, password),
    setPassword: (userId, password) => setPassword(userId, password),
    getUser: async (accessToken) => {
      const res = await f(`${base}/auth/v1/user`, {
        headers: { apikey: cfg.anonKey, Authorization: `Bearer ${accessToken}` },
      });
      if (res.status === 401 || res.status === 403) return null;
      if (!res.ok) throw new Error(`GET_USER_${res.status}`);
      const u = await res.json();
      return u?.id ? { id: u.id, phone: u.phone ?? null } : null;
    },
    getPinSet: async (userId) => {
      const res = await f(
        `${base}/rest/v1/profiles?select=pin_set&user_id=eq.${encodeURIComponent(userId)}`,
        { headers: svcHeaders },
      );
      if (!res.ok) throw new Error(`PROFILE_${res.status}`);
      const rows = await res.json();
      return Boolean(rows?.[0]?.pin_set);
    },
    markPinSet: async (userId) => {
      await rpc("service_mark_pin_set", { p_user_id: userId });
    },
  };
}

/** First client IP from X-Forwarded-For / X-Real-IP style header values. */
export function clientIpFrom(forwardedFor, realIp) {
  const first = String(forwardedFor ?? "")
    .split(",")[0]
    .trim();
  const ip = first || String(realIp ?? "").trim();
  return /^[0-9a-fA-F:.]{2,64}$/.test(ip) ? ip : null;
}
