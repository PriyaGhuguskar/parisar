// Phase 4 complaint isolation + behavior tests.
//
// Covers CMPL-01..07 and PUSH-01/02 per 04-VALIDATION.md.
// All tests run against the live local Supabase stack (no mock DB).
// File-parallelism is disabled by vitest.config.js so test files don't fight over OTP rate-limits.
//
// JavaScript only — no TypeScript syntax.

import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  adminClient,
  BOARD_A_PHONE,
  BOARD_A2_PHONE,
  clientForSession,
  MEMBER_A_PHONE,
  MEMBER_B_PHONE,
  seedTestSociety,
  signInAsBoard,
  signInAsMember,
  teardownPhase4,
  waitFor,
} from "./helpers/phase4.js";

const societyA = seedTestSociety("A");
const societyB = seedTestSociety("B");

let boardA; // Society A board member (will claim complaints)
let memberA; // Society A member (files complaints)
let boardA2; // Society A 2nd board member (for race test)
let memberB; // Society B member (cross-society)

beforeAll(async () => {
  // Clean Phase 4 state from prior runs before sign-in.
  // Use a wide list of historical user IDs — we cannot know them yet, so just clear by society.
  await teardownPhase4([societyA.societyId, societyB.societyId]);

  // Sign in all four users sequentially (avoids OTP rate-limit races on the same provider).
  // signInTestPhone deletes/recreates auth.users so each test run starts fresh.
  memberA = await signInAsMember(MEMBER_A_PHONE, societyA.societyId, societyA.flatId);
  boardA = await signInAsBoard(BOARD_A_PHONE, societyA.societyId, societyA.flat2Id);
  boardA2 = await signInAsBoard(BOARD_A2_PHONE, societyA.societyId, societyA.flat2Id);
  memberB = await signInAsMember(MEMBER_B_PHONE, societyB.societyId, societyB.flatId);
}, 120_000);

// 057 throttles file_complaint at 10 / hour / user; this file files more than
// that as memberA, so each test starts with a clean per-user counter.
beforeEach(async () => {
  const ids = [memberA?.userId, boardA?.userId, boardA2?.userId, memberB?.userId].filter(Boolean);
  if (ids.length > 0) {
    await adminClient()
      .from("edge_rate_events")
      .delete()
      .eq("bucket", "rpc:file_complaint")
      .in("subject", ids);
  }
});

afterAll(async () => {
  await teardownPhase4(
    [societyA.societyId, societyB.societyId],
    [memberA?.userId, boardA?.userId, boardA2?.userId, memberB?.userId].filter(Boolean),
  );
});

// ---------------------------------------------------------------------------
// CMPL-01: file_complaint RPC creates a complaint + (optional) attachment
// ---------------------------------------------------------------------------
describe("CMPL-01: file_complaint RPC", () => {
  it("inserts a complaint row with correct reporter_id and society_id", async () => {
    const { data, error } = await memberA.client.rpc("file_complaint", {
      p_kind: "society",
      p_description: "Lift on B wing not working since morning",
      p_reporter_flat_id: societyA.flatId,
      p_language_code: "en",
    });
    expect(error).toBeNull();
    expect(data).toBeDefined();
    expect(data.complaint_id).toBeTruthy();
    expect(data.society_id).toBe(societyA.societyId);

    // Verify the row landed via admin client (bypasses RLS — confirms actual storage).
    const admin = adminClient();
    const { data: row } = await admin
      .from("complaints")
      .select("id, society_id, reporter_id, kind, description, status")
      .eq("id", data.complaint_id)
      .single();
    expect(row.society_id).toBe(societyA.societyId);
    expect(row.reporter_id).toBe(memberA.userId);
    expect(row.kind).toBe("society");
    expect(row.status).toBe("open");
  });

  it("inserts an attachment row when storage_key is provided", async () => {
    // Since 054 the key must be exactly {society}/complaints/{p_complaint_id}/{file}
    // and the id in the path must be the one passed as p_complaint_id.
    const complaintId = randomUUID();
    const { data, error } = await memberA.client.rpc("file_complaint", {
      p_kind: "member",
      p_description: "Garbage not collected",
      p_reporter_flat_id: societyA.flatId,
      p_language_code: "en",
      p_complaint_id: complaintId,
      p_storage_key: `${societyA.societyId}/complaints/${complaintId}/photo.jpg`,
      p_mime_type: "image/jpeg",
      p_byte_size: 12345,
    });
    expect(error).toBeNull();
    expect(data.complaint_id).toBe(complaintId);

    const admin = adminClient();
    const { data: attachment } = await admin
      .from("attachments")
      .select("owner_kind, owner_id, mime_type, byte_size")
      .eq("owner_id", data.complaint_id)
      .single();
    expect(attachment.owner_kind).toBe("complaint");
    expect(attachment.mime_type).toBe("image/jpeg");
    expect(attachment.byte_size).toBe(12345);
  });
});

// ---------------------------------------------------------------------------
// CMPL-02: visibility RLS — board sees all society complaints; member sees own;
//          cross-society sees zero rows.
// ---------------------------------------------------------------------------
describe("CMPL-02: complaint visibility RLS", () => {
  let complaintAId;

  beforeAll(async () => {
    const { data } = await memberA.client.rpc("file_complaint", {
      p_kind: "society",
      p_description: "Water leak in basement",
      p_reporter_flat_id: societyA.flatId,
      p_language_code: "en",
    });
    complaintAId = data.complaint_id;
  });

  it("Society A board member sees Society A complaint", async () => {
    const { data, error } = await boardA.client
      .from("complaints")
      .select("id, society_id")
      .eq("id", complaintAId);
    expect(error).toBeNull();
    expect(data).toHaveLength(1);
    expect(data[0].society_id).toBe(societyA.societyId);
  });

  it("Society A member sees only their own complaints", async () => {
    const { data, error } = await memberA.client
      .from("complaints")
      .select("id, society_id, reporter_id");
    expect(error).toBeNull();
    // All rows visible to memberA must have reporter_id = memberA.userId
    for (const row of data ?? []) {
      expect(row.reporter_id).toBe(memberA.userId);
    }
  });

  it("Society B member sees zero Society A complaints (cross-society isolation)", async () => {
    const { data, error } = await memberB.client
      .from("complaints")
      .select("id, society_id")
      .eq("society_id", societyA.societyId);
    expect(error).toBeNull();
    expect(data ?? []).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// CMPL-03 + CMPL-04: atomic claim race — exactly one winner.
// ---------------------------------------------------------------------------
describe("CMPL-03/04: claim_complaint atomic race", () => {
  it("two concurrent claim_complaint calls — exactly one wins, the other returns null", async () => {
    // File a fresh complaint for this test (member A → society A).
    const { data: filed } = await memberA.client.rpc("file_complaint", {
      p_kind: "society",
      p_description: "Race-test complaint",
      p_reporter_flat_id: societyA.flatId,
    });
    const complaintId = filed.complaint_id;

    // Two board members race to claim the same complaint.
    const [r1, r2] = await Promise.all([
      boardA.client.rpc("claim_complaint", {
        p_complaint_id: complaintId,
        p_response_kind: "checking",
        p_free_text: null,
      }),
      boardA2.client.rpc("claim_complaint", {
        p_complaint_id: complaintId,
        p_response_kind: "checking",
        p_free_text: null,
      }),
    ]);

    const results = [r1.data, r2.data];
    const winners = results.filter((d) => d !== null);
    const losers = results.filter((d) => d === null);
    expect(winners).toHaveLength(1);
    expect(losers).toHaveLength(1);

    // Verify DB state: owner_id matches one of the two board users.
    const admin = adminClient();
    const { data: row } = await admin
      .from("complaints")
      .select("owner_id, status, claimed_at")
      .eq("id", complaintId)
      .single();
    expect([boardA.userId, boardA2.userId]).toContain(row.owner_id);
    expect(row.status).toBe("checking");
    expect(row.claimed_at).toBeTruthy();
  });

  it("regular member cannot claim (INSUFFICIENT_ROLE)", async () => {
    const { data: filed } = await memberA.client.rpc("file_complaint", {
      p_kind: "society",
      p_description: "Member-cannot-claim test",
      p_reporter_flat_id: societyA.flatId,
    });
    const { data, error } = await memberA.client.rpc("claim_complaint", {
      p_complaint_id: filed.complaint_id,
      p_response_kind: "checking",
    });
    expect(data).toBeNull();
    expect(error).not.toBeNull();
    expect(String(error.message)).toContain("INSUFFICIENT_ROLE");
  });
});

// ---------------------------------------------------------------------------
// CMPL-06: response trail — complaint_responses row with responder_flat_id.
// ---------------------------------------------------------------------------
describe("CMPL-06: complaint response trail with attribution", () => {
  it("claim_complaint inserts complaint_responses row with responder_flat_id", async () => {
    const { data: filed } = await memberA.client.rpc("file_complaint", {
      p_kind: "member",
      p_description: "Trail-test complaint",
      p_reporter_flat_id: societyA.flatId,
    });

    const { data: claimed, error } = await boardA.client.rpc("claim_complaint", {
      p_complaint_id: filed.complaint_id,
      p_response_kind: "will_resolve",
      p_free_text: "Will fix by evening",
    });
    expect(error).toBeNull();
    expect(claimed).not.toBeNull();

    const admin = adminClient();
    const { data: responses } = await admin
      .from("complaint_responses")
      .select("responder_id, response_kind, free_text, responder_flat_id, society_id")
      .eq("complaint_id", filed.complaint_id);
    expect(responses).toHaveLength(1);
    expect(responses[0].responder_id).toBe(boardA.userId);
    expect(responses[0].response_kind).toBe("will_resolve");
    expect(responses[0].free_text).toBe("Will fix by evening");
    expect(responses[0].responder_flat_id).toBe(societyA.flat2Id);
    expect(responses[0].society_id).toBe(societyA.societyId);
  });

  it("add_complaint_response only allows the owner to add follow-ups", async () => {
    const { data: filed } = await memberA.client.rpc("file_complaint", {
      p_kind: "society",
      p_description: "Owner-only follow-up",
      p_reporter_flat_id: societyA.flatId,
    });
    // boardA claims it first
    await boardA.client.rpc("claim_complaint", {
      p_complaint_id: filed.complaint_id,
      p_response_kind: "checking",
    });
    // boardA2 (not owner) tries to add a response → should fail with NOT_OWNER
    const { error: notOwnerErr } = await boardA2.client.rpc("add_complaint_response", {
      p_complaint_id: filed.complaint_id,
      p_response_kind: "resolved",
    });
    expect(notOwnerErr).not.toBeNull();
    expect(String(notOwnerErr.message)).toContain("NOT_OWNER");

    // boardA (owner) can add a response
    const { data: respId, error: ownerErr } = await boardA.client.rpc("add_complaint_response", {
      p_complaint_id: filed.complaint_id,
      p_response_kind: "resolved",
      p_free_text: "Done",
    });
    expect(ownerErr).toBeNull();
    expect(respId).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// CMPL-07: Realtime — Society A subscriber receives INSERT; cross-society receives 0.
// ---------------------------------------------------------------------------
describe("CMPL-07: Realtime subscription with RLS", () => {
  /**
   * Build a subscribed channel for a given user. Returns { client, channel, received }.
   * Throws if subscription doesn't reach SUBSCRIBED in 15s.
   */
  async function subscribeAsBoardA(channelSuffix) {
    const received = [];
    // Fresh client with the JWT bound to BOTH REST and Realtime layers.
    const subClient = await clientForSession(boardA.accessToken, boardA.refreshToken);

    const channel = subClient.channel(`complaints-test-${channelSuffix}-${Date.now()}`).on(
      "postgres_changes",
      {
        event: "INSERT",
        schema: "public",
        table: "complaints",
        filter: `society_id=eq.${societyA.societyId}`,
      },
      (payload) => {
        received.push(payload.new);
      },
    );

    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error("SUBSCRIBE timeout (15s)")), 15_000);
      channel.subscribe((status, err) => {
        if (status === "SUBSCRIBED") {
          clearTimeout(timeout);
          resolve();
        } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
          clearTimeout(timeout);
          reject(new Error(`subscribe status: ${status} ${err?.message ?? ""}`));
        }
      });
    });

    // Give Realtime a beat to fully register the subscription + RLS check.
    await new Promise((r) => setTimeout(r, 1000));

    return { subClient, channel, received };
  }

  it("Society A board subscriber receives INSERT event for Society A complaint", async () => {
    const { subClient, channel, received } = await subscribeAsBoardA("A");

    // Member A inserts a complaint → Society A subscriber should see it.
    const { data: filed, error: fileErr } = await memberA.client.rpc("file_complaint", {
      p_kind: "society",
      p_description: "Realtime-test complaint A",
      p_reporter_flat_id: societyA.flatId,
    });
    expect(fileErr).toBeNull();

    try {
      await waitFor(() => received.some((r) => r.id === filed.complaint_id), 10_000, 200);
    } finally {
      await subClient.removeChannel(channel);
    }
    expect(received.some((r) => r.id === filed.complaint_id)).toBe(true);
  }, 45_000);

  it("Society A subscriber receives 0 events for Society B complaint INSERT (cross-society isolation)", async () => {
    const { subClient, channel, received } = await subscribeAsBoardA("A-iso");

    try {
      // Member B inserts a complaint in SOCIETY B → A's subscriber must NOT receive it.
      const { data: filedB, error: errB } = await memberB.client.rpc("file_complaint", {
        p_kind: "society",
        p_description: "Cross-society test complaint B",
        p_reporter_flat_id: societyB.flatId,
      });
      expect(errB).toBeNull();

      // Control event: a Society A complaint filed AFTER B's. Receiving it proves
      // the channel is live, so "no B event" cannot pass vacuously.
      const { data: filedA, error: errA } = await memberA.client.rpc("file_complaint", {
        p_kind: "society",
        p_description: "Isolation control complaint A",
        p_reporter_flat_id: societyA.flatId,
      });
      expect(errA).toBeNull();

      await waitFor(() => received.some((r) => r.id === filedA.complaint_id), 10_000, 200);
      // Give any (wrongly delivered) B event the same window to arrive.
      await new Promise((r) => setTimeout(r, 1500));

      expect(received.some((r) => r.id === filedA.complaint_id)).toBe(true);
      expect(received.find((r) => r.id === filedB.complaint_id)).toBeUndefined();
      expect(received.every((r) => r.society_id === societyA.societyId)).toBe(true);
    } finally {
      await subClient.removeChannel(channel);
    }
  }, 45_000);

  it("the reporter receives an UPDATE event when a board member changes the status", async () => {
    // File as memberA (the reporter).
    const { data: filed, error: fileErr } = await memberA.client.rpc("file_complaint", {
      p_kind: "society",
      p_description: "Realtime status-change complaint",
      p_reporter_flat_id: societyA.flatId,
    });
    expect(fileErr).toBeNull();

    // Subscribe as the REPORTER (member RLS: own complaints only) to UPDATEs.
    const updates = [];
    const subClient = await clientForSession(memberA.accessToken, memberA.refreshToken);
    const channel = subClient.channel(`complaints-update-${Date.now()}`).on(
      "postgres_changes",
      {
        event: "UPDATE",
        schema: "public",
        table: "complaints",
        filter: `id=eq.${filed.complaint_id}`,
      },
      (payload) => updates.push(payload.new),
    );
    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error("SUBSCRIBE timeout (15s)")), 15_000);
      channel.subscribe((status, err) => {
        if (status === "SUBSCRIBED") {
          clearTimeout(timeout);
          resolve();
        } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
          clearTimeout(timeout);
          reject(new Error(`subscribe status: ${status} ${err?.message ?? ""}`));
        }
      });
    });
    await new Promise((r) => setTimeout(r, 1000));

    try {
      const { error: claimErr } = await boardA.client.rpc("claim_complaint", {
        p_complaint_id: filed.complaint_id,
        p_response_kind: "checking",
      });
      expect(claimErr).toBeNull();

      await waitFor(() => updates.some((r) => r.status === "checking"), 10_000, 200);
      const update = updates.find((r) => r.status === "checking");
      expect(update.id).toBe(filed.complaint_id);
      expect(update.owner_id).toBe(boardA.userId);
    } finally {
      await subClient.removeChannel(channel);
    }
  }, 45_000);
});

// ---------------------------------------------------------------------------
// PUSH-01: push token registration goes through register_push_token (055).
// Since 057 a direct push_tokens INSERT/UPDATE by a user is refused.
// ---------------------------------------------------------------------------
describe("PUSH-01: push_tokens registration", () => {
  it("register_push_token stores the token with notifications_enabled=true", async () => {
    const expoToken = `ExpoPushToken[test-${Date.now()}-${memberA.userId.slice(0, 8)}]`;
    const { data: reg, error } = await memberA.client.rpc("register_push_token", {
      p_token: expoToken,
      p_platform: "android",
      p_device_label: "test-device",
    });
    expect(error).toBeNull();
    expect(reg.user_id).toBe(memberA.userId);

    const admin = adminClient();
    const { data } = await admin
      .from("push_tokens")
      .select("user_id, expo_token, notifications_enabled, last_seen_at")
      .eq("expo_token", expoToken)
      .single();
    expect(data.user_id).toBe(memberA.userId);
    expect(data.notifications_enabled).toBe(true);
  });

  it("registering the same token again updates last_seen_at", async () => {
    const expoToken = `ExpoPushToken[test-update-${Date.now()}-${memberA.userId.slice(0, 8)}]`;

    const first = await memberA.client.rpc("register_push_token", {
      p_token: expoToken,
      p_platform: "android",
    });
    expect(first.error).toBeNull();

    const admin = adminClient();
    const { data: before } = await admin
      .from("push_tokens")
      .select("last_seen_at")
      .eq("expo_token", expoToken)
      .single();

    // Wait 1.1s to ensure last_seen_at delta is visible at ms granularity.
    await new Promise((r) => setTimeout(r, 1100));

    const second = await memberA.client.rpc("register_push_token", {
      p_token: expoToken,
      p_platform: "android",
    });
    expect(second.error).toBeNull();

    const { data: after } = await admin
      .from("push_tokens")
      .select("last_seen_at")
      .eq("expo_token", expoToken)
      .single();
    expect(new Date(after.last_seen_at).getTime()).toBeGreaterThan(
      new Date(before.last_seen_at).getTime(),
    );
  });
});

// ---------------------------------------------------------------------------
// PUSH-02: notify_push_on_response trigger enqueues the push.
// Since migration 055 the trigger writes a public.push_outbox row (service-role
// readable) and stores the pg_net request id on it, so the test asserts the push
// was actually queued for the reporter's response — not just that the INSERT
// did not raise.
//
// Note: net.http_post is fire-and-forget — it queues the HTTP request to the
// pg_net background worker, then returns immediately. No transactional blocking.
// ---------------------------------------------------------------------------
describe("PUSH-02: notify_push_on_response trigger fires", () => {
  it("complaint_responses INSERT via claim_complaint succeeds (trigger does not raise)", async () => {
    // File a fresh complaint as memberA.
    const { data: filed, error: fileErr } = await memberA.client.rpc("file_complaint", {
      p_kind: "society",
      p_description: "Trigger-test complaint",
      p_reporter_flat_id: societyA.flatId,
    });
    expect(fileErr).toBeNull();
    expect(filed.complaint_id).toBeTruthy();

    // Claim it as boardA. This inserts a row into complaint_responses, which
    // fires the AFTER INSERT trigger notify_push_on_response → net.http_post.
    // If the trigger fails (pg_net missing, syntax error, etc.) the INSERT
    // rolls back and claim_complaint returns an error.
    const { data: claimed, error: claimErr } = await boardA.client.rpc("claim_complaint", {
      p_complaint_id: filed.complaint_id,
      p_response_kind: "checking",
    });
    expect(claimErr).toBeNull();
    expect(claimed).not.toBeNull();

    // Verify the complaint_responses row landed (admin bypasses RLS).
    const admin = adminClient();
    const { data: responses } = await admin
      .from("complaint_responses")
      .select("id, response_kind")
      .eq("complaint_id", filed.complaint_id);
    expect(responses).toHaveLength(1);
    expect(responses[0].response_kind).toBe("checking");

    // The trigger enqueued exactly one push for THIS response: a push_outbox row
    // (migration 055) carrying the pg_net request id. A missing secret or a
    // broken trigger leaves no row / no request id.
    const { data: outbox, error: outboxErr } = await admin
      .from("push_outbox")
      .select("event_kind, event_id, society_id, request_id, result")
      .eq("event_kind", "complaint_response")
      .eq("event_id", responses[0].id);
    expect(outboxErr).toBeNull();
    expect(outbox).toHaveLength(1);
    expect(outbox[0].society_id).toBe(societyA.societyId);
    expect(outbox[0].request_id).not.toBeNull();
    expect(outbox[0].result?.skipped).not.toBe("no_webhook_secret");
  });

  it("each response enqueues its own push (one outbox row per event)", async () => {
    const { data: filed } = await memberA.client.rpc("file_complaint", {
      p_kind: "society",
      p_description: "Two-response push complaint",
      p_reporter_flat_id: societyA.flatId,
    });
    await boardA.client.rpc("claim_complaint", {
      p_complaint_id: filed.complaint_id,
      p_response_kind: "checking",
    });
    const { error: respErr } = await boardA.client.rpc("add_complaint_response", {
      p_complaint_id: filed.complaint_id,
      p_response_kind: "resolved",
    });
    expect(respErr).toBeNull();

    const admin = adminClient();
    const { data: responses } = await admin
      .from("complaint_responses")
      .select("id")
      .eq("complaint_id", filed.complaint_id);
    expect(responses).toHaveLength(2);

    const { data: outbox } = await admin
      .from("push_outbox")
      .select("event_id")
      .eq("event_kind", "complaint_response")
      .in(
        "event_id",
        responses.map((r) => r.id),
      );
    expect((outbox ?? []).length).toBe(2);
  });
});
