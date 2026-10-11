// notification-fanout Edge Function — notifications INSERT → society-wide push.
//
// Flow:
//   1. Trigger notify_push_on_notification (migration 055) enqueues a push_outbox
//      row and calls this endpoint via pg_net with `x-webhook-secret` and an
//      id-only body: { type:'INSERT', table:'notifications', record:{ id } }.
//   2. authorize() — constant-time secret (or service-role Bearer); fail closed.
//   3. claimEvent() — each notification is fanned out at most once.
//   4. Re-read the notification row (society / kind / category from the DB).
//      eligible_push_recipients(id) applies mute, IST quiet hours and the
//      rolling-24h cap server-side.
//   5. Batch-send a generic body (never the notice content — T-05-09), log one
//      push_deliveries row per successful send, delete stale tokens.
//
// Failure mode: handled errors return 200 with an `error` field (no pg_net retry).
//
// JavaScript only — no TS annotations, no type imports, no generics.
import {
  authorize,
  claimEvent,
  cleanupStaleTokens,
  finishEvent,
  jsonResponse,
  readEvent,
  sendExpo,
  serviceClient,
} from "../_shared/fanout.js";

const TAG = "notification-fanout";
const EVENT_KIND = "notification";

const PUSH_BODIES = {
  notice: "New notice in your society",
  poll: "New poll in your society",
};

Deno.serve(async (req) => {
  const denied = authorize(req);
  if (denied) return denied;

  const { eventId, response: early } = await readEvent(req, {
    type: "INSERT",
    table: "notifications",
  });
  if (early) return early;

  const svc = serviceClient();
  const claim = await claimEvent(svc, EVENT_KIND, eventId);
  if (claim.error) {
    console.error(`[${TAG}] outbox claim failed`, claim.error.message);
    return jsonResponse({ error: "claim_failed", sent: 0 });
  }
  if (!claim.claimed) return jsonResponse({ skipped: true, reason: "unknown_or_processed" });

  const { data: notification, error: nErr } = await svc
    .from("notifications")
    .select("id, society_id, kind, category")
    .eq("id", eventId)
    .maybeSingle();
  if (nErr || !notification) {
    await finishEvent(svc, EVENT_KIND, eventId, { error: "notification_not_found" }, TAG);
    return jsonResponse({ error: "notification_not_found", sent: 0 });
  }

  const { data: recipients, error: rErr } = await svc.rpc("eligible_push_recipients", {
    p_notification_id: notification.id,
  });
  if (rErr) {
    console.error(`[${TAG}] recipients lookup failed`, rErr.message);
    await finishEvent(svc, EVENT_KIND, eventId, { error: "recipients_failed" }, TAG);
    return jsonResponse({ error: "recipients_failed", sent: 0 });
  }
  if (!recipients || recipients.length === 0) {
    await finishEvent(svc, EVENT_KIND, eventId, { sent: 0, reason: "no_recipients" }, TAG);
    return jsonResponse({ sent: 0, reason: "no_recipients" });
  }

  const body = notification.kind === "poll" ? PUSH_BODIES.poll : PUSH_BODIES.notice;
  const messages = recipients.map((r) => ({
    to: r.expo_token,
    sound: "default",
    title: "Parisar",
    body,
    data: {
      notificationId: notification.id,
      screen: `/(protected)/(tabs)/notices/${notification.id}`,
    },
  }));

  const { sent, okIndexes, staleTokens } = await sendExpo(messages, TAG);

  // Rolling-cap source of truth: one push_deliveries row per successful send,
  // using the DB row's society + category (never the payload's).
  if (okIndexes.length > 0) {
    const rows = okIndexes.map((i) => ({
      society_id: notification.society_id,
      user_id: recipients[i].user_id,
      category: notification.category,
    }));
    const { error: lErr } = await svc.from("push_deliveries").insert(rows);
    if (lErr) console.error(`[${TAG}] push_deliveries log failed`, lErr.message);
  }

  await cleanupStaleTokens(svc, staleTokens, TAG);

  const result = { sent, stale_cleaned: staleTokens.length };
  await finishEvent(svc, EVENT_KIND, eventId, result, TAG);
  return jsonResponse(result);
});
