// pin-login Edge Function — the only way the mobile app checks or writes a PIN.
//
// POST { action: "login", pin, phone? }
//   → 200 { access_token, refresh_token, expires_in, token_type }
//   → 401 { error: "PIN_INVALID", remaining }      wrong PIN / no such account
//   → 423 { error: "LOCKED", retry_after_seconds }  5 failures → 15 min lock
//   → 429 { error: "RATE_LIMITED", retry_after_seconds }
//   Phone: taken from the caller's session when a user access token is sent in
//   Authorization (the normal post-OTP case); otherwise from `phone`.
//
// POST { action: "set", pin }   (Authorization: Bearer <user access token>)
//   → 200 { ok: true }
//   → 401 { error: "AUTH_REQUIRED" } | 403 { error: "REAUTH_REQUIRED" }
//   → 400 { error: "INVALID_PIN" | "WEAK_PIN" }
//   The session must come from an OTP verified in the last 10 min (resetting a
//   PIN) / 30 min (first PIN). The phone is the verified user's own.
//
// verify_jwt = false: login must work with only the anon key; `set` verifies
// the user token itself against GoTrue.
//
// Secrets (supabase secrets set …): PIN_PEPPER (>= 32 chars, same value as the
// website's PIN_PEPPER). SUPABASE_URL / SUPABASE_ANON_KEY /
// SUPABASE_SERVICE_ROLE_KEY are injected by the platform.

import { readJsonObject } from "../_shared/http.js";
import {
  clientIpFrom,
  decodeJwtPayload,
  makeGoTrueDeps,
  maskPhone,
  resolvePepper,
  runPinLogin,
  runSetPin,
} from "./pin-core.js";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
// Local `supabase functions serve` talks to the stack through kong.
const IS_LOCAL = /^https?:\/\/(kong|localhost|127\.0\.0\.1|host\.docker\.internal)(:\d+)?/i.test(
  SUPABASE_URL,
);

const STATUS = {
  INVALID_INPUT: 400,
  INVALID_PIN: 400,
  WEAK_PIN: 400,
  PIN_INVALID: 401,
  AUTH_REQUIRED: 401,
  REAUTH_REQUIRED: 403,
  LOCKED: 423,
  RATE_LIMITED: 429,
  SERVER_ERROR: 500,
};

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

function fail(result) {
  const body = { error: result.error };
  if (result.retryAfterSeconds) body.retry_after_seconds = result.retryAfterSeconds;
  if (typeof result.remaining === "number") body.remaining = result.remaining;
  return json(body, STATUS[result.error] ?? 500);
}

function bearer(req) {
  const h = req.headers.get("Authorization") ?? "";
  const m = /^Bearer\s+(.+)$/i.exec(h);
  if (!m) return null;
  // The anon key is also a JWT; only a user (authenticated) token counts.
  const claims = decodeJwtPayload(m[1]);
  return claims?.role === "authenticated" && claims?.sub ? m[1] : null;
}

// { action, pin, phone } is well under 1 KiB.
const MAX_BODY_BYTES = 4 * 1024;

// Native-app only (no browser caller): no CORS headers, so a web page cannot
// read a response from this endpoint. Any unexpected exception becomes a
// generic SERVER_ERROR (no stack, no phone number in the response).
Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "METHOD_NOT_ALLOWED" }, 405);
  try {
    return await handlePinRequest(req);
  } catch (e) {
    console.error(`[pin-login] unexpected failure: ${e?.message ?? "unknown"}`);
    return json({ error: "SERVER_ERROR" }, 500);
  }
});

async function handlePinRequest(req) {
  if (!SUPABASE_URL || !ANON_KEY || !SERVICE_ROLE_KEY) return json({ error: "SERVER_ERROR" }, 500);

  let pepper;
  try {
    pepper = resolvePepper(Deno.env.get("PIN_PEPPER"), { isDev: IS_LOCAL });
  } catch (e) {
    console.error(`[pin-login] ${e?.message ?? "PIN_PEPPER invalid"} — refusing PIN operations`);
    return json({ error: "SERVER_ERROR" }, 500);
  }

  const parsed = await readJsonObject(req, MAX_BODY_BYTES);
  if ("error" in parsed) return json({ error: "INVALID_INPUT" }, 400);
  const body = parsed.body;
  const action = body.action ?? "login";
  const pin = typeof body.pin === "string" && body.pin.length <= 16 ? body.pin : "";

  const forwardedFor = req.headers.get("x-forwarded-for");
  const ip = clientIpFrom(forwardedFor, req.headers.get("x-real-ip"));
  const deps = makeGoTrueDeps({
    url: SUPABASE_URL,
    anonKey: ANON_KEY,
    serviceKey: SERVICE_ROLE_KEY,
    forwardedFor: ip,
  });
  const userToken = bearer(req);

  if (action === "set") {
    const result = await runSetPin({ accessToken: userToken, pin }, { ...deps, pepper });
    return result.ok ? json({ ok: true }) : fail(result);
  }

  if (action !== "login") return json({ error: "INVALID_INPUT" }, 400);

  let phone = typeof body.phone === "string" && body.phone.length <= 20 ? body.phone : "";
  if (userToken) {
    try {
      const user = await deps.getUser(userToken);
      if (user?.phone) phone = user.phone;
    } catch {
      return json({ error: "SERVER_ERROR" }, 500);
    }
  }

  const result = await runPinLogin(
    { phone, pin, ip },
    {
      ...deps,
      pepper,
      log: (msg) => console.warn(`[pin-login] ${msg}`),
    },
  );
  if (!result.ok) {
    if (result.error === "LOCKED") console.warn(`[pin-login] locked ${maskPhone(phone)}`);
    return fail(result);
  }
  const s = result.session ?? {};
  return json({
    access_token: s.access_token,
    refresh_token: s.refresh_token,
    expires_in: s.expires_in,
    token_type: s.token_type ?? "bearer",
  });
}
