// send-sms Auth Hook — the OTP-adapter seam.
// Supabase Auth POSTs here for any phone NOT in [auth.sms.test_otp].
// Responsibilities:
//   1. (prod only) verify the StandardWebhooks signature
//   2. enforce the per-phone rate limit (AUTH-06) via the otp_requests table
//   3. dispatch to the provider adapter selected by OTP_PROVIDER
import { StandardWebhooks } from "npm:standard-webhooks@1.0.0";
import { createClient } from "npm:@supabase/supabase-js@2.103.3";

const OTP_PROVIDER = Deno.env.get("OTP_PROVIDER") ?? "stub";
const SEND_SMS_HOOK_SECRETS = Deno.env.get("SEND_SMS_HOOK_SECRETS") ?? "";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

// Per-phone limit: max 5 OTP requests per rolling hour. See RESEARCH.md Pitfall 6.
const MAX_OTP_PER_HOUR = 5;
const WINDOW_MS = 60 * 60 * 1000;

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
    const rawBody = await req.text();
    try {
      const wh = new StandardWebhooks(SEND_SMS_HOOK_SECRETS);
      wh.verify(rawBody, Object.fromEntries(req.headers));
    } catch {
      return jsonResponse({ error: "Invalid webhook signature" }, 401);
    }
    payload = JSON.parse(rawBody);
  }

  const phone = payload?.user?.phone;
  const otp = payload?.sms?.otp;
  if (!phone || !otp) {
    return jsonResponse({ error: "Malformed hook payload" }, 400);
  }

  // 2. Per-phone rate limit (AUTH-06). The hook has a service-role client.
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const since = new Date(Date.now() - WINDOW_MS).toISOString();
  const { count, error: countError } = await admin
    .from("otp_requests")
    .select("*", { count: "exact", head: true })
    .eq("phone", phone)
    .gte("requested_at", since);

  if (countError) {
    return jsonResponse({ error: "Rate-limit check failed" }, 500);
  }
  if ((count ?? 0) >= MAX_OTP_PER_HOUR) {
    return jsonResponse(
      { error: "Too many OTP requests for this number. Try again later." },
      429,
    );
  }
  await admin.from("otp_requests").insert({ phone });

  // 3. Dispatch to the adapter.
  const adapter = await loadAdapter(OTP_PROVIDER);
  try {
    await adapter.send({ phone, otp });
  } catch (err) {
    console.error(`[send-sms] adapter '${adapter.name}' failed:`, err.message);
    return jsonResponse({ error: "SMS delivery failed" }, 502);
  }

  // Supabase docs: empty 200 body on success.
  return jsonResponse({}, 200);
});
