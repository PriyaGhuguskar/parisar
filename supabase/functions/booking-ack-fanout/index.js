// booking-ack-fanout Edge Function — Database Webhook handler for bookings status UPDATE.
//
// Single-recipient booking acknowledgement (BOOK-04/06). Resolves Assumption A3:
// a dedicated thin path rather than overloading the complaint-specific `push-fanout`
// (which hard-codes RESPONSE_LABELS + a complaints-table lookup). Each function stays
// single-responsibility.
//
// Flow:
//   1. Postgres trigger `notify_push_on_booking_decision` (Phase 5 migration) fires
//      AFTER UPDATE OF status WHEN (new.status in ('approved','rejected') and
//      old.status='pending') → net.http_post to this endpoint with the bookings row
//      payload and the sentinel header `x-push-trigger: true`.
//   2. The recipient is the requester ONLY (record.requester_id, denormalized on the
//      bookings row). No society-wide query (T-05-10).
//   3. We load the requester's push_tokens where notifications_enabled = true.
//   4. We batch-send to Expo Push (≤100/HTTP call — a requester rarely has >2 devices,
//      but reuse the loop for consistency) with a GENERIC, lock-screen-safe English
//      body (NEVER the amenity / purpose / rejection_reason — T-05-09).
//   5. We delete any stale tokens that Expo returns DeviceNotRegistered for.
//
// NOTE: booking acks are single, directed sends and are NOT subject to the society-wide
// rolling cap (NOTF-07 is for broadcast notifications), so this function does NOT write
// push_deliveries. (Counting booking acks against the cap is deferred to a future phase.)
//
// Auth surface: either the sentinel header `x-push-trigger: true` OR an
// `Authorization: Bearer {SUPABASE_SERVICE_ROLE_KEY}` header. Anything else → 401 (T-05-05).
//
// Failure mode: errors during fan-out are logged + returned as a 200 with an
// `error` field so that pg_net does NOT retry forever (T-05-12). The trigger is
// fire-and-forget; the originating bookings UPDATE is already committed.
//
// JavaScript only — no TS annotations, no type imports, no generics.
import { createClient } from "npm:@supabase/supabase-js@2.103.3";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const EXPO_ACCESS_TOKEN = Deno.env.get("EXPO_ACCESS_TOKEN") ?? "";

const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";
const BATCH_SIZE = 100;

// Generic push bodies by booking status. English only for v1; full i18n lands in
// Phase 7. Body intentionally generic — NEVER include the amenity name, purpose, or
// rejection_reason (lock-screen privacy, T-05-09 / DD-10). Payload carries IDs only.
const STATUS_BODIES = {
  approved: "Your booking was approved",
  rejected: "There's an update on your booking",
};

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    headers: { "Content-Type": "application/json" },
    status,
  });
}

function isAuthorized(req) {
  // Sentinel header set by the Postgres trigger (notify_push_on_booking_decision).
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

  // 3. Only handle bookings UPDATE events whose status is a decision. The trigger
  //    already gates this via its WHEN clause; double-check defensively here.
  if (type !== "UPDATE" || table !== "bookings" || !record) {
    return jsonResponse({ skipped: true });
  }
  if (record.status !== "approved" && record.status !== "rejected") {
    return jsonResponse({ skipped: true, reason: "not_a_decision" });
  }
  if (!record.requester_id) {
    return jsonResponse({ skipped: true, reason: "no_requester" });
  }

  // 4. Build the service-role client (bypasses RLS — intentional for token fetch +
  //    stale-token cleanup).
  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // 5. Load the requester's push tokens (the single recipient — no society-wide query).
  const { data: tokens, error: tErr } = await supabase
    .from("push_tokens")
    .select("expo_token")
    .eq("user_id", record.requester_id)
    .eq("notifications_enabled", true);

  if (tErr) {
    console.error("[booking-ack-fanout] token fetch error", tErr);
    // 200 (not 500) so pg_net does not retry forever — see "Failure mode" note above.
    return jsonResponse({ error: "token_fetch_failed", sent: 0 }, 200);
  }

  if (!tokens || tokens.length === 0) {
    return jsonResponse({ sent: 0, reason: "no_tokens" });
  }

  // 6. Build one Expo push message per requester device. Generic body by status;
  //    NEVER leak amenity / purpose / rejection_reason (T-05-09). Payload = IDs only.
  const pushBody =
    STATUS_BODIES[record.status] ?? "There's an update on your booking";

  const messages = tokens.map((t) => ({
    to: t.expo_token,
    sound: "default",
    title: "Parisar",
    body: pushBody,
    data: {
      bookingId: record.id,
      // Expo Router deep-link path — root layout listener routes on tap.
      screen: "/(protected)/(tabs)/bookings",
    },
  }));

  // 7. Batch (Expo Push API limit: 100 messages per HTTP request).
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
      console.error("[booking-ack-fanout] Expo Push fetch failed", err);
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
            "[booking-ack-fanout] Expo Push ticket error",
            ticket.message,
            ticket.details,
          );
        }
      }
    } else {
      console.warn("[booking-ack-fanout] Unexpected Expo response shape", result);
    }
  }

  // 8. Clean up stale tokens. Filter by expo_token (globally unique) so only the
  //    matching rows are deleted — never another user's tokens (T-05-11).
  if (staleTokens.length > 0) {
    const { error: dErr } = await supabase
      .from("push_tokens")
      .delete()
      .in("expo_token", staleTokens);
    if (dErr) {
      console.error("[booking-ack-fanout] stale token cleanup failed", dErr);
    }
  }

  return jsonResponse({
    sent: totalSent,
    stale_cleaned: staleTokens.length,
  });
});
