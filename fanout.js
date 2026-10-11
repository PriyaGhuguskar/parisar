// Shared helpers for the push fan-out Edge Functions (push-fanout,
// notification-fanout, booking-ack-fanout, flat-action-fanout).
//
// Security model (migration 20261011000055 §2):
//   * The notify_push_* triggers call these functions via pg_net with the header
//     `x-webhook-secret: <app_private.runtime_config.fanout_webhook_secret>`.
//     We compare it in constant time against env FANOUT_WEBHOOK_SECRET and FAIL
//     CLOSED when the env var is unset.
//   * The webhook body carries ids only. Every function re-reads the row with
//     the service role and derives society / recipients from the DB.
//   * Each event is claimed once in public.push_outbox (processed_at null →
//     now()). A forged, unknown or replayed event has nothing to claim → skip.
//
// JavaScript only — no TS annotations, no type imports, no generics.
import { createClient } from "npm:@supabase/supabase-js@2.103.3";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const EXPO_ACCESS_TOKEN = Deno.env.get("EXPO_ACCESS_TOKEN") ?? "";
const FANOUT_WEBHOOK_SECRET = Deno.env.get("FANOUT_WEBHOOK_SECRET") ?? "";

const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";
const BATCH_SIZE = 100;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    headers: { "Content-Type": "application/json" },
    status,
  });
}

export function isUuid(value) {
  return typeof value === "string" && UUID_RE.test(value);
}

/** Constant-time string comparison (length difference still costs a full pass). */
export function timingSafeEqual(a, b) {
  const enc = new TextEncoder();
  const x = enc.encode(String(a ?? ""));
  const y = enc.encode(String(b ?? ""));
  const len = Math.max(x.length, y.length);
  let diff = x.length ^ y.length;
  for (let i = 0; i < len; i++) {
    diff |= (x[i] ?? 0) ^ (y[i] ?? 0);
  }
  return diff === 0;
}

/**
 * Gate every fan-out request. Returns null when allowed, or a Response to send.
 * Accepts the trigger's shared secret, or a service-role Bearer (ops re-run).
 */
export function authorize(req) {
  if (!FANOUT_WEBHOOK_SECRET || !SERVICE_ROLE_KEY) {
    console.error("[fanout] FANOUT_WEBHOOK_SECRET / service role key not configured — refusing");
    return jsonResponse({ error: "Fan-out secret not configured" }, 500);
  }
  const secret = req.headers.get("x-webhook-secret");
  if (secret && timingSafeEqual(secret, FANOUT_WEBHOOK_SECRET)) return null;

  const auth = req.headers.get("authorization") ?? "";
  if (
    auth.startsWith("Bearer ") &&
    timingSafeEqual(auth.slice("Bearer ".length), SERVICE_ROLE_KEY)
  ) {
    return null;
  }
  return jsonResponse({ error: "Unauthorized" }, 401);
}

/**
 * Parse + shape-check the trigger payload. Returns { eventId } or { response }.
 * @param {Request} req
 * @param {{ type: string, table: string }} expected
 */
export async function readEvent(req, expected) {
  let payload;
  try {
    payload = await req.json();
  } catch (_err) {
    return { response: jsonResponse({ error: "Invalid JSON body" }, 400) };
  }
  const { type, table, record } = payload ?? {};
  if (type !== expected.type || table !== expected.table) {
    return { response: jsonResponse({ skipped: true }) };
  }
  if (!isUuid(record?.id)) {
    return { response: jsonResponse({ error: "bad event id" }, 400) };
  }
  return { eventId: record.id };
}

export function serviceClient() {
  return createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

/**
 * Claim the outbox row for this event. Returns { claimed: true } exactly once
 * per event; { claimed: false } for unknown/replayed events; { error } on DB failure.
 */
export async function claimEvent(svc, eventKind, eventId) {
  const { data, error } = await svc
    .from("push_outbox")
    .update({ processed_at: new Date().toISOString() })
    .eq("event_kind", eventKind)
    .eq("event_id", eventId)
    .is("processed_at", null)
    .select("id");
  if (error) return { error };
  return { claimed: Array.isArray(data) && data.length > 0 };
}

/** Record the outcome on the claimed outbox row (best effort). */
export async function finishEvent(svc, eventKind, eventId, result, tag) {
  const { error } = await svc
    .from("push_outbox")
    .update({ result })
    .eq("event_kind", eventKind)
    .eq("event_id", eventId);
  if (error) console.error(`[${tag}] outbox result write failed`, error.message);
}

/**
 * Send Expo push messages in batches of 100.
 * @returns {Promise<{ sent: number, okIndexes: number[], staleTokens: string[] }>}
 */
export async function sendExpo(messages, tag) {
  const headers = {
    "Content-Type": "application/json",
    ...(EXPO_ACCESS_TOKEN ? { Authorization: `Bearer ${EXPO_ACCESS_TOKEN}` } : {}),
  };
  const okIndexes = [];
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
      console.error(`[${tag}] Expo Push fetch failed`, err?.message ?? err);
      continue; // never retry forever
    }
    if (!Array.isArray(result?.data)) {
      console.warn(`[${tag}] Unexpected Expo response shape`);
      continue;
    }
    result.data.forEach((ticket, i) => {
      if (ticket?.status === "ok") {
        okIndexes.push(start + i);
      } else if (ticket?.details?.error === "DeviceNotRegistered") {
        staleTokens.push(batch[i].to);
      } else if (ticket?.status === "error") {
        console.warn(`[${tag}] Expo Push ticket error`, ticket.message, ticket.details);
      }
    });
  }
  return { sent: okIndexes.length, okIndexes, staleTokens };
}

/** Delete tokens Expo reported as DeviceNotRegistered (globally unique tokens). */
export async function cleanupStaleTokens(svc, staleTokens, tag) {
  if (staleTokens.length === 0) return;
  const { error } = await svc.from("push_tokens").delete().in("expo_token", staleTokens);
  if (error) console.error(`[${tag}] stale token cleanup failed`, error.message);
}

/** Load notification-enabled Expo tokens for one user. */
export async function tokensForUser(svc, userId) {
  const { data, error } = await svc
    .from("push_tokens")
    .select("expo_token")
    .eq("user_id", userId)
    .eq("notifications_enabled", true);
  return { tokens: data ?? [], error };
}
