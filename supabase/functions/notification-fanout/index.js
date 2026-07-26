// notification-fanout Edge Function — Database Webhook handler for notifications INSERT.
//
// Society-wide push fan-out (NOTF-03/05/06/07). Flow:
//   1. Postgres trigger `notify_push_on_notification` (Phase 5 migration) calls
//      net.http_post → this endpoint with the new notifications row payload and the
//      sentinel header `x-push-trigger: true`.
//   2. We resolve the eligible recipients via the SQL helper
//      `eligible_push_recipients(p_notification_id)`, which ALREADY applies, server-side:
//        - category mute (mute_<category> column),
//        - IST quiet-hours wrap-around (Asia/Kolkata),
//        - rolling-24h frequency cap (counts prior push_deliveries rows).
//      The Edge Function stays thin — it just consumes the filtered token list.
//   3. We batch-send to Expo Push (≤100 messages per HTTP call) with a GENERIC,
//      lock-screen-safe English body (NEVER the notice title/body — T-05-09).
//   4. After the batch loop, we INSERT one push_deliveries row per successful send so
//      the rolling-24h cap tightens for the next notification (NOTF-07 source of truth).
//   5. We delete any stale tokens that Expo returns DeviceNotRegistered for.
//
// Auth surface: either the sentinel header `x-push-trigger: true` OR an
// `Authorization: Bearer {SUPABASE_SERVICE_ROLE_KEY}` header. Anything else → 401 (T-05-05).
//
// Failure mode: errors during fan-out are logged + returned as a 200 with an
// `error` field so that pg_net does NOT retry forever (T-05-12). The trigger is
// fire-and-forget; the originating notifications INSERT is already committed.
//
// JavaScript only — no TS annotations, no type imports, no generics.
import { createClient } from "npm:@supabase/supabase-js@2.103.3";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const EXPO_ACCESS_TOKEN = Deno.env.get("EXPO_ACCESS_TOKEN") ?? "";

const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";
const BATCH_SIZE = 100;

// Generic push bodies by notification kind. English only for v1; full i18n lands
// in Phase 7. Body intentionally generic — NEVER include record.title/record.body
// (lock-screen privacy, T-05-09 / DD-10). The data payload carries IDs only.
const PUSH_BODIES = {
  notice: "New notice in your society",
  poll: "New poll in your society",
};

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    headers: { "Content-Type": "application/json" },
    status,
  });
}

function isAuthorized(req) {
  // Sentinel header set by the Postgres trigger (notify_push_on_notification).
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

  // 3. Only handle notifications INSERT events. Anything else is a no-op.
  if (type !== "INSERT" || table !== "notifications" || !record) {
    return jsonResponse({ skipped: true });
  }

  // 4. Build the service-role client (bypasses RLS — intentional for the helper +
  //    push_deliveries write + token cleanup).
  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // 5. Resolve eligible recipients. The SQL helper scopes to the notification's own
  //    society (T-05-10 — no broad token scan) and applies mute/quiet-hours/cap
  //    server-side (T-05-06), returning [{ user_id, expo_token }].
  const { data: recipients, error: rErr } = await supabase.rpc(
    "eligible_push_recipients",
    { p_notification_id: record.id },
  );

  if (rErr) {
    console.error("[notification-fanout] recipients lookup failed", rErr);
    // 200 (not 500) so pg_net does not retry forever — see "Failure mode" note above.
    return jsonResponse({ error: "recipients_failed", sent: 0 }, 200);
  }

  if (!recipients || recipients.length === 0) {
    return jsonResponse({ sent: 0, reason: "no_recipients" });
  }

  // 6. Build one Expo push message per eligible recipient. Keep a parallel index of
  //    each message's user_id so a successful ticket can be logged to push_deliveries.
  const pushBody =
    record.kind === "poll" ? PUSH_BODIES.poll : PUSH_BODIES.notice;

  const messages = recipients.map((r) => ({
    to: r.expo_token,
    sound: "default",
    title: "Parisar",
    body: pushBody,
    data: {
      notificationId: record.id,
      // Expo Router deep-link path — mirrors the real (tabs)-nested notices route
      // (see Plan 05-04). Payload carries IDs only, never content.
      screen: `/(protected)/(tabs)/notices/${record.id}`,
    },
  }));
  // userIdByIndex[i] is the recipient.user_id for messages[i] — used for the delivery log.
  const userIdByIndex = recipients.map((r) => r.user_id);

  // 7. Batch (Expo Push API limit: 100 messages per HTTP request — Pitfall 4 at scale).
  const headers = {
    "Content-Type": "application/json",
    // EXPO_ACCESS_TOKEN is only set when running against the Expo Enhanced Security
    // tier (EAS). Local dev omits the header gracefully.
    ...(EXPO_ACCESS_TOKEN
      ? { Authorization: `Bearer ${EXPO_ACCESS_TOKEN}` }
      : {}),
  };

  let totalSent = 0;
  const staleTokens = [];
  // Collected on each `ok` ticket → one push_deliveries row per successful send.
  const deliveredUserIds = [];

  for (let start = 0; start < messages.length; start += BATCH_SIZE) {
    const batch = messages.slice(start, start + BATCH_SIZE);

    let result;
    try {
      const res = await fetch(EXPO_PUSH_URL, {
        method: "POST",
        headers,
        body: JSON.stringify(batch),
      });
      result = await res.json();
    } catch (err) {
      console.error("[notification-fanout] Expo Push fetch failed", err);
      continue; // move to next batch; do not retry forever
    }

    // Expo returns { data: [ { status, id, message, details } ] }
    if (Array.isArray(result?.data)) {
      for (let i = 0; i < result.data.length; i++) {
        const ticket = result.data[i];
        const globalIndex = start + i;
        if (ticket?.status === "ok") {
          totalSent++;
          deliveredUserIds.push(userIdByIndex[globalIndex]);
        } else if (ticket?.details?.error === "DeviceNotRegistered") {
          // Device uninstalled the app — token is dead. Collect for cleanup.
          staleTokens.push(batch[i].to);
        } else if (ticket?.status === "error") {
          console.warn(
            "[notification-fanout] Expo Push ticket error",
            ticket.message,
            ticket.details,
          );
        }
      }
    } else {
      console.warn("[notification-fanout] Unexpected Expo response shape", result);
    }
  }

  // 8. Log deliveries (NOTF-07 rolling-cap source of truth). One push_deliveries row
  //    per successful send, batched into a single insert. Uses the notice's own
  //    society_id + category so the next cap check counts these sends.
  if (deliveredUserIds.length > 0) {
    const deliveryRows = deliveredUserIds.map((uid) => ({
      society_id: record.society_id,
      user_id: uid,
      category: record.category,
    }));
    const { error: lErr } = await supabase
      .from("push_deliveries")
      .insert(deliveryRows);
    if (lErr) {
      console.error("[notification-fanout] push_deliveries log failed", lErr);
    }
  }

  // 9. Clean up stale tokens. Filter by expo_token (globally unique) so only the
  //    matching rows are deleted — never another user's tokens (T-05-11).
  if (staleTokens.length > 0) {
    const { error: dErr } = await supabase
      .from("push_tokens")
      .delete()
      .in("expo_token", staleTokens);
    if (dErr) {
      console.error("[notification-fanout] stale token cleanup failed", dErr);
    }
  }

  return jsonResponse({
    sent: totalSent,
    stale_cleaned: staleTokens.length,
  });
});
