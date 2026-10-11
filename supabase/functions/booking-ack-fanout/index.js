// booking-ack-fanout Edge Function — bookings status UPDATE → push to requester.
//
// Flow:
//   1. Trigger notify_push_on_booking_decision (fires on pending → approved /
//      rejected; migration 055) enqueues a push_outbox row and calls this
//      endpoint via pg_net with `x-webhook-secret` and an id-only body:
//      { type:'UPDATE', table:'bookings', record:{ id } }.
//   2. authorize() — constant-time secret (or service-role Bearer); fail closed.
//   3. claimEvent() — each decision is acknowledged at most once.
//   4. Re-read the booking: requester and status come from the DB, never from
//      the payload (the old version trusted record.requester_id).
//   5. Batch-send a generic body (never amenity / purpose / reason — T-05-09),
//      delete stale tokens.
//
// Booking acks are directed sends and are not counted in push_deliveries
// (the rolling cap is for broadcast notifications).
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
  tokensForUser,
} from "../_shared/fanout.js";

const TAG = "booking-ack-fanout";
const EVENT_KIND = "booking_decision";

const STATUS_BODIES = {
  approved: "Your booking was approved",
  rejected: "There's an update on your booking",
};

Deno.serve(async (req) => {
  const denied = authorize(req);
  if (denied) return denied;

  const { eventId, response: early } = await readEvent(req, { type: "UPDATE", table: "bookings" });
  if (early) return early;

  const svc = serviceClient();
  const claim = await claimEvent(svc, EVENT_KIND, eventId);
  if (claim.error) {
    console.error(`[${TAG}] outbox claim failed`, claim.error.message);
    return jsonResponse({ error: "claim_failed", sent: 0 });
  }
  if (!claim.claimed) return jsonResponse({ skipped: true, reason: "unknown_or_processed" });

  const { data: booking, error: bErr } = await svc
    .from("bookings")
    .select("id, society_id, requester_id, status")
    .eq("id", eventId)
    .maybeSingle();
  if (bErr || !booking) {
    await finishEvent(svc, EVENT_KIND, eventId, { error: "booking_not_found" }, TAG);
    return jsonResponse({ error: "booking_not_found", sent: 0 });
  }
  if (booking.status !== "approved" && booking.status !== "rejected") {
    await finishEvent(svc, EVENT_KIND, eventId, { skipped: "not_a_decision" }, TAG);
    return jsonResponse({ skipped: true, reason: "not_a_decision" });
  }

  const { tokens, error: tErr } = await tokensForUser(svc, booking.requester_id);
  if (tErr) {
    await finishEvent(svc, EVENT_KIND, eventId, { error: "token_fetch_failed" }, TAG);
    return jsonResponse({ error: "token_fetch_failed", sent: 0 });
  }
  if (tokens.length === 0) {
    await finishEvent(svc, EVENT_KIND, eventId, { sent: 0, reason: "no_tokens" }, TAG);
    return jsonResponse({ sent: 0, reason: "no_tokens" });
  }

  const body = STATUS_BODIES[booking.status] ?? "There's an update on your booking";
  const messages = tokens.map((t) => ({
    to: t.expo_token,
    sound: "default",
    title: "Parisar",
    body,
    data: { bookingId: booking.id, screen: "/(protected)/(tabs)/bookings" },
  }));

  const { sent, staleTokens } = await sendExpo(messages, TAG);
  await cleanupStaleTokens(svc, staleTokens, TAG);

  const result = { sent, stale_cleaned: staleTokens.length };
  await finishEvent(svc, EVENT_KIND, eventId, result, TAG);
  return jsonResponse(result);
});
