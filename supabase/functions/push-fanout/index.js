// push-fanout Edge Function — complaint_responses INSERT → push to the reporter.
//
// Flow:
//   1. Trigger notify_push_on_response (migration 055) enqueues a push_outbox row
//      and calls this endpoint via pg_net with `x-webhook-secret` and an id-only
//      body: { type:'INSERT', table:'complaint_responses', record:{ id } }.
//   2. authorize() — constant-time secret (or service-role Bearer); fail closed.
//   3. claimEvent() — each event is processed at most once (replay → skipped).
//   4. Re-read the response + parent complaint with the service role; the
//      recipient (reporter) comes from the DB, never from the payload.
//   5. Batch-send to Expo Push; delete DeviceNotRegistered tokens.
//
// Failure mode: handled errors return 200 with an `error` field so pg_net never
// retries; the originating INSERT is already committed.
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

const TAG = "push-fanout";
const EVENT_KIND = "complaint_response";

// Generic, lock-screen-safe bodies — never the complaint description (T-04-10).
const RESPONSE_LABELS = {
  checking: "Someone is checking your complaint",
  will_resolve: "Your complaint will be resolved soon",
  need_info: "More information needed for your complaint",
  resolved: "Your complaint has been resolved",
};

async function loadTarget(svc, responseId) {
  const { data: response, error: rErr } = await svc
    .from("complaint_responses")
    .select("id, complaint_id, society_id, response_kind")
    .eq("id", responseId)
    .maybeSingle();
  if (rErr || !response) return { error: "response_not_found" };

  const { data: complaint, error: cErr } = await svc
    .from("complaints")
    .select("id, reporter_id, society_id")
    .eq("id", response.complaint_id)
    .maybeSingle();
  if (cErr || !complaint || complaint.society_id !== response.society_id) {
    return { error: "complaint_not_found" };
  }
  return { response, complaint };
}

Deno.serve(async (req) => {
  const denied = authorize(req);
  if (denied) return denied;

  const { eventId, response: early } = await readEvent(req, {
    type: "INSERT",
    table: "complaint_responses",
  });
  if (early) return early;

  const svc = serviceClient();
  const claim = await claimEvent(svc, EVENT_KIND, eventId);
  if (claim.error) {
    console.error(`[${TAG}] outbox claim failed`, claim.error.message);
    return jsonResponse({ error: "claim_failed", sent: 0 });
  }
  if (!claim.claimed) return jsonResponse({ skipped: true, reason: "unknown_or_processed" });

  const target = await loadTarget(svc, eventId);
  if (target.error) {
    await finishEvent(svc, EVENT_KIND, eventId, { error: target.error }, TAG);
    return jsonResponse({ error: target.error, sent: 0 });
  }

  const { tokens, error: tErr } = await tokensForUser(svc, target.complaint.reporter_id);
  if (tErr) {
    await finishEvent(svc, EVENT_KIND, eventId, { error: "token_fetch_failed" }, TAG);
    return jsonResponse({ error: "token_fetch_failed", sent: 0 });
  }
  if (tokens.length === 0) {
    await finishEvent(svc, EVENT_KIND, eventId, { sent: 0, reason: "no_tokens" }, TAG);
    return jsonResponse({ sent: 0, reason: "no_tokens" });
  }

  const complaintId = target.complaint.id;
  const body = RESPONSE_LABELS[target.response.response_kind] ?? "Your complaint has a new update";
  const messages = tokens.map((t) => ({
    to: t.expo_token,
    sound: "default",
    title: "Complaint Update",
    body,
    data: { complaintId, screen: `/complaints/${complaintId}` },
  }));

  const { sent, staleTokens } = await sendExpo(messages, TAG);
  await cleanupStaleTokens(svc, staleTokens, TAG);

  const result = { sent, stale_cleaned: staleTokens.length };
  await finishEvent(svc, EVENT_KIND, eventId, result, TAG);
  return jsonResponse(result);
});
