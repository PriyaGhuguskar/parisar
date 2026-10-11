"use server";

// Sign-in actions that need the server: PIN check, PIN write, and the
// post-OTP claim steps.
//
// SHAPE OF THE FLOW
//   every login   phone -> OTP (always) -> my_login_state() decides the next step
//                 (lib/auth/loginMode.js, computed AFTER the OTP as the user)
//   returning     OTP -> PIN (pinLogin, server-side, locked after 5 failures)
//   first time    OTP -> society code -> onboarding -> set PIN (setMyPin)
//   forgot PIN    OTP -> set a new PIN (needs an OTP from the last 10 minutes)
//
// SECURITY PROPERTIES (CODE-REVIEW C2, HIGH 2/3/4/5/7):
//   · Nothing here trusts a user id, phone or token sent by the browser. Every
//     action reads the caller from the cookie-bound session (getUser()).
//   · The PIN credential is HMAC(PIN_PEPPER, phone:pin) and is computed only on
//     the server (lib/auth/pinCore.js). Browsers cannot compute it, so PINs can
//     only be tried through pinLogin, which counts failures per phone and IP.
//   · The society code is never a credential — it only says which society a
//     person who has ALREADY passed OTP is joining (onboard_resident).
//   · No pre-OTP lookup: the old lookupPhone told anonymous callers whether a
//     number was staff / guard / authority, and startCodeClaim was an
//     unthrottled code-validity oracle. Both are gone.
//
// JavaScript only — no TypeScript per CLAUDE.md.

import { headers } from "next/headers";
import { clientIpFrom, runPinLogin, runSetPin } from "../../lib/auth/pinCore";
import { pinServerDeps } from "../../lib/auth/pinSecret";
import { createSupabaseServerClient } from "../../lib/supabase/server";

async function callerIp() {
  try {
    const h = await headers();
    return clientIpFrom(h.get("x-forwarded-for"), h.get("x-real-ip"));
  } catch {
    return null;
  }
}

/** The cookie-bound client and its verified user, or null. */
async function signedIn() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user ? { supabase, user } : null;
}

function serverDeps(ip) {
  try {
    return pinServerDeps({ forwardedFor: ip });
  } catch (e) {
    // Fail closed: no pepper (or no service key) in a production build.
    console.error(`[codeLogin] PIN service unavailable: ${e?.message ?? "misconfigured"}`);
    return null;
  }
}

/**
 * Check the signed-in user's PIN (the second step after OTP). The phone is the
 * session's own; on success the session cookies are replaced with the PIN
 * session.
 *
 * @param {string} pin 4 digits
 * @returns {Promise<{ok: true} | {error: "AUTH_REQUIRED"|"INVALID_INPUT"|"PIN_INVALID"|"LOCKED"|"RATE_LIMITED"|"SERVER_ERROR", retryAfterSeconds?: number, remaining?: number}>}
 */
export async function pinLogin(pin) {
  if (typeof pin !== "string" || !/^\d{4}$/.test(pin)) return { error: "INVALID_INPUT" };
  const ctx = await signedIn();
  if (!ctx) return { error: "AUTH_REQUIRED" };

  const ip = await callerIp();
  const deps = serverDeps(ip);
  if (!deps) return { error: "SERVER_ERROR" };

  const result = await runPinLogin(
    { phone: ctx.user.phone, pin, ip },
    { ...deps, log: (m) => console.warn(`[codeLogin] ${m}`) },
  );
  if (!result.ok) {
    const out = { error: result.error };
    if (result.retryAfterSeconds) out.retryAfterSeconds = result.retryAfterSeconds;
    if (typeof result.remaining === "number") out.remaining = result.remaining;
    return out;
  }

  const s = result.session ?? {};
  if (s.user?.id && s.user.id !== ctx.user.id) return { error: "SERVER_ERROR" };
  const { error } = await ctx.supabase.auth.setSession({
    access_token: s.access_token,
    refresh_token: s.refresh_token,
  });
  if (error) return { error: "SERVER_ERROR" };
  return { ok: true };
}

/**
 * Set (or reset) the signed-in user's PIN. Requires that this session came
 * from an OTP verified recently — see pinCore.js runSetPin.
 *
 * @param {string} pin 4 digits, not 1234 / four identical
 * @returns {Promise<{ok: true} | {error: "AUTH_REQUIRED"|"REAUTH_REQUIRED"|"INVALID_PIN"|"WEAK_PIN"|"SERVER_ERROR"}>}
 */
export async function setMyPin(pin) {
  const ctx = await signedIn();
  if (!ctx) return { error: "AUTH_REQUIRED" };
  const {
    data: { session },
  } = await ctx.supabase.auth.getSession();
  if (!session?.access_token) return { error: "AUTH_REQUIRED" };

  const deps = serverDeps(await callerIp());
  if (!deps) return { error: "SERVER_ERROR" };

  // runSetPin re-validates the token with GoTrue and checks sub === user.id,
  // so the cookie session (not any argument) decides whose PIN this is.
  return runSetPin({ accessToken: session.access_token, pin: String(pin ?? "") }, deps);
}

/**
 * @deprecated Use setMyPin(pin). Kept so existing callers keep compiling: the
 * user id and phone arguments are IGNORED — the session decides whose PIN this
 * is (CODE-REVIEW C2). Only the last argument (the PIN) is used.
 */
export async function setPin(...args) {
  return setMyPin(args.length ? args[args.length - 1] : "");
}

/** Run a claim RPC as the cookie-session user; map its coded errors. */
async function claimAsCaller(fn, knownError) {
  const ctx = await signedIn();
  if (!ctx) return { error: "AUTH_REQUIRED" };
  const { data, error } = await ctx.supabase.rpc(fn);
  if (error) {
    return { error: error.message?.includes(knownError) ? knownError : "SERVER_ERROR" };
  }
  return { ok: true, data };
}

/**
 * Family member's FIRST login (after OTP): turn the entry a resident pre-made
 * for them into their own membership. Arguments are ignored — the cookie
 * session is the caller.
 *
 * @returns {Promise<{ok:true, societyId:string|null} | {error:string}>}
 */
export async function claimFamilyMember() {
  const r = await claimAsCaller("claim_family_membership", "NOT_A_FAMILY_MEMBER");
  return r.ok ? { ok: true, societyId: r.data?.society_id ?? null } : r;
}

/**
 * Society authority's sign-in (after OTP): link their authority entry.
 * Idempotent. Arguments are ignored — the cookie session is the caller.
 *
 * @returns {Promise<{ok:true, societyId:string|null, needsSetup:boolean, needsFlat:boolean} | {error:string}>}
 */
export async function claimAuthority() {
  const r = await claimAsCaller("claim_society_authority", "NOT_AN_AUTHORITY");
  if (!r.ok) return r;
  return {
    ok: true,
    societyId: r.data?.society_id ?? null,
    needsSetup: Boolean(r.data?.needs_setup),
    needsFlat: Boolean(r.data?.needs_flat),
  };
}

/**
 * Guard's first login (after OTP): link their auth user to the pre-created
 * society_guards row. Arguments are ignored — the cookie session is the caller.
 *
 * @returns {Promise<{ok:true, societyId:string|null} | {error:string}>}
 */
export async function claimGuard() {
  const r = await claimAsCaller("claim_guard", "NOT_A_GUARD");
  return r.ok ? { ok: true, societyId: r.data?.society_id ?? null } : r;
}
