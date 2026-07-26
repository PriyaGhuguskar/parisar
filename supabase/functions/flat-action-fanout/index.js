// flat-action-fanout Edge Function — Database Webhook handler for flat_actions INSERT.
//
// Flat-SCOPED push fan-out (FLAT-03, OQ3). Mirrors notification-fanout, but the
// recipient set is "all account-holding members of action.flat_id" — NOT the whole
// society (T-06-11: never over-broadcast a disciplinary action to other flats).
//
// Flow:
//   1. Postgres trigger `notify_push_on_flat_action` (Plan 01 migration) fires
//      AFTER INSERT on flat_actions → net.http_post to this endpoint with the new
//      flat_actions row payload and the sentinel header `x-push-trigger: true`.
//   2. We resolve recipients via the SQL helper `flat_action_recipients(record.id)`,
//      which ALREADY applies, server-side:
//        - per-FLAT scope (only the target flat's active account-holding members —
//          family members are contact-only, no auth user / no token),
//        - OQ3 category mute (fine → mute_fines, warning/notify → mute_general),
//        - IST quiet-hours wrap-around (Asia/Kolkata),
//        - rolling-24h frequency cap (counts prior push_deliveries rows).
//      The Edge Function stays thin — it just consumes the filtered token list.
//   3. We batch-send to Expo Push (≤100 messages per HTTP call) with a SINGLE
//      GENERIC, lock-screen-safe English body across ALL kinds — "Your flat has a
//      new notice" — NEVER the kind / amount / reason (lock-screen privacy, T-06-10).
//      The data payload carries `flatActionId` only (deep-link target).
//   4. After the batch loop, we INSERT one push_deliveries row per successful send
//      (category 'fines' for a fine, else 'general' — matching OQ3) so the rolling
//      cap tightens for the next push.
//   5. We delete any stale tokens that Expo returns DeviceNotRegistered for.
//
// Auth surface: either the sentinel header `x-push-trigger: true` OR an
// `Authorization: Bearer {SUPABASE_SERVICE_ROLE_KEY}` header. Anything else → 401.
//
// Failure mode: errors during fan-out are logged + returned as a 200 with an
// `error` field so that pg_net does NOT retry forever (T-06-12 — retry-storm guard).
// The trigger is fire-and-forget; the originating flat_actions INSERT is already
// committed.
//
// JavaScript only — no TS annotations, no type imports, no generics.
import { createClient } from "npm:@supabase/supabase-js@2.103.3";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const EXPO_ACCESS_TOKEN = Deno.env.get("EXPO_ACCESS_TOKEN") ?? "";

const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";
const BATCH_SIZE = 100;

// SINGLE generic body across ALL flat-action kinds (warning / fine / notify).
// English only for v1; full i18n lands in Phase 7. Body intentionally generic —
// NEVER include record.kind / record.amount / record.body / record.due_date
// (lock-screen privacy, T-06-10). The data payload carries the ID only.
const FLAT_ACTION_PUSH_BODY = "Your flat has a new notice";

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    headers: { "Content-Type": "application/json" },
    status,
  });
}

function isAuthorized(req) {
  // Sentinel header set by the Postgres trigger (notify_push_on_flat_action).
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

  // 3. Only handle flat_actions INSERT events. Anything else is a no-op.
  if (type !== "INSERT" || table !== "flat_actions" || !record) {
    return jsonResponse({ skipped: true });
  }
  if (!record.id) {
    return jsonResponse({ skipped: true, reason: "no_flat_action_id" });
  }

  // 4. Build the service-role client (bypasses RLS — intentional for the helper +
  //    push_deliveries write + token cleanup).
  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // 5. Resolve flat-scoped recipients. The SQL helper scopes to the action's own
  //    flat (T-06-11 — no society-wide broadcast) and applies the OQ3 category
  //    mute / quiet-hours / cap server-side, returning [{ user_id, expo_token }].
  const { data: recipients, error: rErr } = await supabase.rpc(
    "flat_action_recipients",
    { p_flat_action_id: record.id },
  );

  if (rErr) {
    console.error("[flat-action-fanout] recipients lookup failed", rErr);
    // 200 (not 500) so pg_net does not retry forever — see "Failure mode" note above.
    return jsonResponse({ error: "recipients_failed", sent: 0 }, 200);
  }

  if (!recipients || recipients.length === 0) {
    return jsonResponse({ sent: 0, reason: "no_recipients" });
  }

  // 6. Build one Expo push message per eligible recipient. Generic body for ALL
  //    kinds; payload carries flatActionId only (T-06-10). Keep a parallel index of
  //    each message's user_id so a successful ticket can be logged to push_deliveries.
  const messages = recipients.map((r) => ({
    to: r.expo_token,
    sound: "default",
    title: "Parisar",
    body: FLAT_ACTION_PUSH_BODY,
    data: {
      flatActionId: record.id,
      // Expo Router deep-link path — root layout listener routes on tap. IDs only.
      screen: `/(protected)/(tabs)/flat-actions/${record.id}`,
    },
  }));
  // userIdByIndex[i] is the recipient.user_id for messages[i] — used for the delivery log.
  const userIdByIndex = recipients.map((r) => r.user_id);

  // 7. Push delivery category for the rolling-cap log: a fine counts against the
  //    'fines' category, everything else against 'general' (OQ3, mirrors the
  //    flat_action_recipients mute mapping).
  const deliveryCategory = record.kind === "fine" ? "fines" : "general";

  // 8. Batch (Expo Push API limit: 100 messages per HTTP request).
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
      console.error("[flat-action-fanout] Expo Push fetch failed", err);
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
            "[flat-action-fanout] Expo Push ticket error",
            ticket.message,
            ticket.details,
          );
        }
      }
    } else {
      console.warn("[flat-action-fanout] Unexpected Expo response shape", result);
    }
  }

  // 9. Log deliveries (rolling-cap source of truth). One push_deliveries row per
  //    successful send, batched into a single insert, using the action's society_id
  //    + the OQ3-mapped category so the next cap check counts these sends.
  if (deliveredUserIds.length > 0) {
    const deliveryRows = deliveredUserIds.map((uid) => ({
      society_id: record.society_id,
      user_id: uid,
      category: deliveryCategory,
    }));
    const { error: lErr } = await supabase
      .from("push_deliveries")
      .insert(deliveryRows);
    if (lErr) {
      console.error("[flat-action-fanout] push_deliveries log failed", lErr);
    }
  }

  // 10. Clean up stale tokens. Filter by expo_token (globally unique) so only the
  //     matching rows are deleted — never another user's tokens.
  if (staleTokens.length > 0) {
    const { error: dErr } = await supabase
      .from("push_tokens")
      .delete()
      .in("expo_token", staleTokens);
    if (dErr) {
      console.error("[flat-action-fanout] stale token cleanup failed", dErr);
    }
  }

  return jsonResponse({
    sent: totalSent,
    stale_cleaned: staleTokens.length,
  });
});
