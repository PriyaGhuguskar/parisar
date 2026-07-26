// push-fanout Edge Function — Database Webhook handler for complaint_responses INSERT.
//
// Flow:
//   1. Postgres trigger `notify_push_on_response` (Phase 4 migration) calls
//      net.http_post → this endpoint with the row payload and the sentinel
//      header `x-push-trigger: true`.
//   2. We load the parent complaint to find reporter_id.
//   3. We load all push_tokens for the reporter where notifications_enabled = true.
//   4. We batch-send to Expo Push (≤100 messages per HTTP call).
//   5. We delete any stale tokens that Expo returns DeviceNotRegistered for.
//
// Auth surface: either the sentinel header `x-push-trigger: true` OR an
// `Authorization: Bearer {SUPABASE_SERVICE_ROLE_KEY}` header. Anything else → 401.
//
// Failure mode: errors during fan-out are logged + returned as a 200 with an
// `error` field so that pg_net does NOT retry forever. The trigger is
// fire-and-forget; the originating complaint_response INSERT is already committed.
//
// JavaScript only — no TS annotations, no type imports, no generics.
import { createClient } from "npm:@supabase/supabase-js@2.103.3";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const EXPO_ACCESS_TOKEN = Deno.env.get("EXPO_ACCESS_TOKEN") ?? "";

const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";
const BATCH_SIZE = 100;

// Predefined response-kind → push body labels. English only for v1; full
// i18n lands in Phase 7. Body intentionally generic — never include the
// complaint description (lock-screen privacy, T-04-10).
const RESPONSE_LABELS = {
  checking: "Someone is checking your complaint",
  will_resolve: "Your complaint will be resolved soon",
  need_info: "More information needed for your complaint",
  resolved: "Your complaint has been resolved",
};

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    headers: { "Content-Type": "application/json" },
    status,
  });
}

function isAuthorized(req) {
  // Sentinel header set by the Postgres trigger (notify_push_on_response).
  if (req.headers.get("x-push-trigger") === "true") return true;

  // Fallback: service-role Bearer (lets ops re-trigger from a script).
  const auth = req.headers.get("authorization") ?? "";
  if (
    SERVICE_ROLE_KEY &&
    auth.startsWith("Bearer ") &&
    auth.slice("Bearer ".length) === SERVICE_ROLE_KEY
  ) {
    return true;
  }
  return false;
}

Deno.serve(async (req) => {
  // 1. Gate: only the DB trigger (sentinel) or service-role caller may invoke.
  if (!isAuthorized(req)) {
    return jsonResponse({ error: "Unauthorized" }, 401);
  }

  // 2. Parse the webhook payload.
  let payload;
  try {
    payload = await req.json();
  } catch (_err) {
    return jsonResponse({ error: "Invalid JSON body" }, 400);
  }

  const { type, table, record } = payload ?? {};

  // 3. Only handle complaint_responses INSERT events. Anything else is a no-op.
  if (type !== "INSERT" || table !== "complaint_responses" || !record) {
    return jsonResponse({ skipped: true });
  }

  // 4. Build the service-role client (bypasses RLS — intentional for cleanup).
  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // 5. Load the parent complaint to find the reporter_id.
  const { data: complaint, error: cErr } = await supabase
    .from("complaints")
    .select("reporter_id, society_id, description")
    .eq("id", record.complaint_id)
    .single();

  if (cErr || !complaint) {
    console.error(
      "[push-fanout] complaint not found",
      record.complaint_id,
      cErr,
    );
    // 200 (not 500) so pg_net does not retry forever — see "Failure mode" note above.
    return jsonResponse({ error: "complaint_not_found", sent: 0 }, 200);
  }

  // 6. Load all push tokens for the reporter that have notifications enabled.
  const { data: tokens, error: tErr } = await supabase
    .from("push_tokens")
    .select("expo_token")
    .eq("user_id", complaint.reporter_id)
    .eq("notifications_enabled", true);

  if (tErr) {
    console.error("[push-fanout] token fetch error", tErr);
    return jsonResponse({ error: "token_fetch_failed", sent: 0 }, 200);
  }

  if (!tokens || tokens.length === 0) {
    return jsonResponse({ sent: 0, reason: "no_tokens" });
  }

  // 7. Build one Expo push message per token.
  const pushBody =
    RESPONSE_LABELS[record.response_kind] ?? "Your complaint has a new update";

  const messages = tokens.map((t) => ({
    to: t.expo_token,
    sound: "default",
    title: "Complaint Update",
    body: pushBody,
    data: {
      complaintId: record.complaint_id,
      // Expo Router deep-link path — root layout listener routes on tap.
      screen: `/complaints/${record.complaint_id}`,
    },
  }));

  // 8. Batch (Expo Push API limit: 100 messages per HTTP request).
  const batches = [];
  for (let i = 0; i < messages.length; i += BATCH_SIZE) {
    batches.push(messages.slice(i, i + BATCH_SIZE));
  }

  const headers = {
    "Content-Type": "application/json",
    // EXPO_ACCESS_TOKEN is only set when running against the Expo Enhanced
    // Security tier (EAS). Local dev omits the header gracefully.
    ...(EXPO_ACCESS_TOKEN
      ? { Authorization: `Bearer ${EXPO_ACCESS_TOKEN}` }
      : {}),
  };

  let totalSent = 0;
  const staleTokens = [];

  for (const batch of batches) {
    let result;
    try {
      const res = await fetch(EXPO_PUSH_URL, {
        method: "POST",
        headers,
        body: JSON.stringify(batch),
      });
      result = await res.json();
    } catch (err) {
      console.error("[push-fanout] Expo Push fetch failed", err);
      continue; // move to next batch; do not retry forever
    }

    // Expo returns { data: [ { status, id, message, details } ] }
    if (Array.isArray(result?.data)) {
      for (let i = 0; i < result.data.length; i++) {
        const ticket = result.data[i];
        if (ticket?.status === "ok") {
          totalSent++;
        } else if (ticket?.details?.error === "DeviceNotRegistered") {
          // Device uninstalled the app — token is dead. Collect for cleanup.
          staleTokens.push(batch[i].to);
        } else if (ticket?.status === "error") {
          console.warn(
            "[push-fanout] Expo Push ticket error",
            ticket.message,
            ticket.details,
          );
        }
      }
    } else {
      console.warn("[push-fanout] Unexpected Expo response shape", result);
    }
  }

  // 9. Clean up stale tokens. Filter by expo_token (globally unique) so only
  // the matching rows are deleted — never another user's tokens (T-04-12).
  if (staleTokens.length > 0) {
    const { error: dErr } = await supabase
      .from("push_tokens")
      .delete()
      .in("expo_token", staleTokens);
    if (dErr) {
      console.error("[push-fanout] stale token cleanup failed", dErr);
    }
  }

  return jsonResponse({
    sent: totalSent,
    stale_cleaned: staleTokens.length,
  });
});
