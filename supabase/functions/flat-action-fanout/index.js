// flat-action-fanout Edge Function — flat_actions INSERT → push to that flat only.
//
// Flow:
//   1. Trigger notify_push_on_flat_action (migration 055) enqueues a push_outbox
//      row and calls this endpoint via pg_net with `x-webhook-secret` and an
//      id-only body: { type:'INSERT', table:'flat_actions', record:{ id } }.
//   2. authorize() — constant-time secret (or service-role Bearer); fail closed.
//   3. claimEvent() — each action is fanned out at most once.
//   4. Re-read the flat_actions row: society_id and kind come from the DB (the
//      old version logged push_deliveries with the payload's society_id).
//      flat_action_recipients(id) scopes to the target flat and applies mute /
//      IST quiet hours / rolling cap server-side (T-06-11).
//   5. One generic body for every kind (T-06-10), push_deliveries row per
//      successful send ('fines' for a fine, else 'general'), stale-token cleanup.
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

const TAG = "flat-action-fanout";
const EVENT_KIND = "flat_action";
const FLAT_ACTION_PUSH_BODY = "Your flat has a new notice";

Deno.serve(async (req) => {
  const denied = authorize(req);
  if (denied) return denied;

  const { eventId, response: early } = await readEvent(req, {
    type: "INSERT",
    table: "flat_actions",
  });
  if (early) return early;

  const svc = serviceClient();
  const claim = await claimEvent(svc, EVENT_KIND, eventId);
  if (claim.error) {
    console.error(`[${TAG}] outbox claim failed`, claim.error.message);
    return jsonResponse({ error: "claim_failed", sent: 0 });
  }
  if (!claim.claimed) return jsonResponse({ skipped: true, reason: "unknown_or_processed" });

  const { data: action, error: aErr } = await svc
    .from("flat_actions")
    .select("id, society_id, kind")
    .eq("id", eventId)
    .maybeSingle();
  if (aErr || !action) {
    await finishEvent(svc, EVENT_KIND, eventId, { error: "flat_action_not_found" }, TAG);
    return jsonResponse({ error: "flat_action_not_found", sent: 0 });
  }

  const { data: recipients, error: rErr } = await svc.rpc("flat_action_recipients", {
    p_flat_action_id: action.id,
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

  const messages = recipients.map((r) => ({
    to: r.expo_token,
    sound: "default",
    title: "Parisar",
    body: FLAT_ACTION_PUSH_BODY,
    data: {
      flatActionId: action.id,
      screen: `/(protected)/(tabs)/flat-actions/${action.id}`,
    },
  }));

  const { sent, okIndexes, staleTokens } = await sendExpo(messages, TAG);

  if (okIndexes.length > 0) {
    const category = action.kind === "fine" ? "fines" : "general";
    const rows = okIndexes.map((i) => ({
      society_id: action.society_id,
      user_id: recipients[i].user_id,
      category,
    }));
    const { error: lErr } = await svc.from("push_deliveries").insert(rows);
    if (lErr) console.error(`[${TAG}] push_deliveries log failed`, lErr.message);
  }

  await cleanupStaleTokens(svc, staleTokens, TAG);

  const result = { sent, stale_cleaned: staleTokens.length };
  await finishEvent(svc, EVENT_KIND, eventId, result, TAG);
  return jsonResponse(result);
});
