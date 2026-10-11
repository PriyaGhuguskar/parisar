// send-sms Auth Hook — the OTP-adapter seam.
// Supabase Auth POSTs here for any phone NOT in [auth.sms.test_otp].
// Responsibilities:
//   1. (prod only) verify the StandardWebhooks signature
//   2. enforce the per-phone rate limit (AUTH-06) via svc_otp_request_try (atomic)
//   3. dispatch to the provider adapter selected by OTP_PROVIDER

import { createClient } from "npm:@supabase/supabase-js@2.103.3";
import { StandardWebhooks } from "npm:standard-webhooks@1.0.0";
import { readBodyText } from "../_shared/http.js";
import { maskPhone } from "./mask.js";

const OTP_PROVIDER = Deno.env.get("OTP_PROVIDER") ?? "stub";
const SEND_SMS_HOOK_SECRETS = Deno.env.get("SEND_SMS_HOOK_SECRETS") ?? "";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

// Per-phone limit: max 5 OTP requests per rolling hour. See RESEARCH.md Pitfall 6.
const MAX_OTP_PER_HOUR = 5;
const WINDOW_SECONDS = 60 * 60;
// The hook payload is a small JSON document (user + sms objects).
const MAX_BODY_BYTES = 64 * 1024;
const E164_RE = /^\+?[1-9][0-9]{7,14}$/;
const OTP_RE = /^[0-9]{4,10}$/;

async function loadAdapter(provider) {
  switch (provider) {
    case "msg91":
      return (await import("./adapters/msg91.js")).default;
    case "twilio":
      return (await import("./adapters/twilio.js")).default;
    case "stub":
    default:
      return (await import("./adapters/stub.js")).default;
  }
}

function jsonResponse(body, status) {
  return new Response(JSON.stringify(body), {
    headers: { "Content-Type": "application/json" },
    status,
  });
}

Deno.serve(async (req) => {
  // Server-to-server (Supabase Auth → this hook): POST only, no CORS headers.
  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }
  let payload;

  // 1. Parse + verify signature.
  // PAR-006: Supabase Auth signs every send_sms hook call with
  // SEND_SMS_HOOK_SECRETS regardless of provider. Verify the StandardWebhooks
  // signature UNCONDITIONALLY and FAIL CLOSED when the secret is unset — never
  // process an unsigned request (prevents OTP-flooding / victim lockout via a
  // public, unauthenticated endpoint). test_otp numbers skip this hook entirely.
  if (!SEND_SMS_HOOK_SECRETS) {
    return jsonResponse({ error: "Hook secret not configured" }, 500);
  }
  {
    const read = await readBodyText(req, MAX_BODY_BYTES);
    if ("tooLarge" in read) {
      return jsonResponse({ error: "Payload too large" }, 413);
    }
    const rawBody = read.text;
    try {
      const wh = new StandardWebhooks(SEND_SMS_HOOK_SECRETS);
      wh.verify(rawBody, Object.fromEntries(req.headers));
    } catch {
      return jsonResponse({ error: "Invalid webhook signature" }, 401);
    }
    try {
      payload = JSON.parse(rawBody);
    } catch {
      return jsonResponse({ error: "Malformed hook payload" }, 400);
    }
  }

  const phone = payload?.user?.phone;
  const otp = payload?.sms?.otp;
  if (
    typeof phone !== "string" ||
    typeof otp !== "string" ||
    !E164_RE.test(phone) ||
    !OTP_RE.test(otp)
  ) {
    return jsonResponse({ error: "Malformed hook payload" }, 400);
  }

  // 2. Per-phone rate limit (AUTH-06). Atomic check-and-record in one RPC
  //    (advisory-locked per phone, migration 055 §4) — the old count-then-insert
  //    raced and ignored insert errors. FAIL CLOSED on any error.
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data: allowed, error: rlError } = await admin.rpc("svc_otp_request_try", {
    p_phone: phone,
    p_max: MAX_OTP_PER_HOUR,
    p_window_seconds: WINDOW_SECONDS,
  });
  if (rlError) {
    console.error(`[send-sms] rate-limit check failed for ${maskPhone(phone)}:`, rlError.message);
    return jsonResponse({ error: "Rate-limit check failed" }, 500);
  }
  if (allowed !== true) {
    return jsonResponse({ error: "Too many OTP requests for this number. Try again later." }, 429);
  }

  // 3. Dispatch to the adapter.
  const adapter = await loadAdapter(OTP_PROVIDER);
  try {
    await adapter.send({ phone, otp });
  } catch (err) {
    console.error(
      `[send-sms] adapter '${adapter.name}' failed for ${maskPhone(phone)}:`,
      err?.message,
    );
    return jsonResponse({ error: "SMS delivery failed" }, 502);
  }

  // Supabase docs: empty 200 body on success.
  return jsonResponse({}, 200);
});
