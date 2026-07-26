// Phase 5 notifications isolation + behavior tests (NOTF-01..04, RLS, Realtime).
//
// Runs against the live local Supabase stack (no mock DB).
//
// Covers:
//   - file_notification attribution (author_flat_id) + optional attachment (NOTF-01/04)
//   - poll creation in the same transaction; 2..4 option CHECK (NOTF-02)
//   - board-role gate: a member cannot post (INSUFFICIENT_ROLE)
//   - RLS: all society members read notices; cross-society sees 0 (NOTF-03)
//   - Realtime: Society A subscriber receives INSERT; Society B subscriber receives 0
//
// JavaScript only. Never chain .catch()/.then() on .rpc() (Pitfall 6).

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  adminClient,
  signInAsBoard,
  signInAsMember,
  seedTestSociety,
  clientForSession,
  waitFor,
  teardownPhase5,
  BOARD_A_PHONE,
  MEMBER_A_PHONE,
  BOARD_A2_PHONE,
  MEMBER_B_PHONE,
} from "./helpers/phase5.js";

const societyA = seedTestSociety("A");
const societyB = seedTestSociety("B");

let boardA; // Society A board member (posts notices)
let memberA; // Society A member (reads, votes)
let boardB; // Society B board member (posts in B)
let memberB; // Society B member (cross-society)

beforeAll(async () => {
  await teardownPhase5([societyA.societyId, societyB.societyId]);

  memberA = await signInAsMember(MEMBER_A_PHONE, societyA.societyId, societyA.flatId);
  boardA = await signInAsBoard(BOARD_A_PHONE, societyA.societyId, societyA.flat2Id);
  boardB = await signInAsBoard(BOARD_A2_PHONE, societyB.societyId, societyB.flatId);
  memberB = await signInAsMember(MEMBER_B_PHONE, societyB.societyId, societyB.flat2Id);
}, 120_000);

afterAll(async () => {
  await teardownPhase5(
    [societyA.societyId, societyB.societyId],
    [memberA?.userId, boardA?.userId, boardB?.userId, memberB?.userId].filter(Boolean),
  );
});

// ---------------------------------------------------------------------------
// NOTF-01/04: file_notification creates a notice with attribution + attachment.
// ---------------------------------------------------------------------------
describe("NOTF-01/04: file_notification attribution + attachment", () => {
  it("inserts a notification with author_id + denormalized author_flat_id", async () => {
    const { data, error } = await boardA.client.rpc("file_notification", {
      p_title: "Water supply interruption",
      p_body: "Water off 10am-2pm tomorrow for tank cleaning.",
      p_category: "general",
    });
    expect(error).toBeNull();
    expect(data.notification_id).toBeTruthy();
    expect(data.society_id).toBe(societyA.societyId);
    expect(data.poll_id).toBeNull();

    const admin = adminClient();
    const { data: row } = await admin
      .from("notifications")
      .select("society_id, author_id, author_flat_id, kind, category, title")
      .eq("id", data.notification_id)
      .single();
    expect(row.society_id).toBe(societyA.societyId);
    expect(row.author_id).toBe(boardA.userId);
    expect(row.author_flat_id).toBe(societyA.flat2Id);
    expect(row.kind).toBe("general");
    expect(row.category).toBe("general");
  });

  it("inserts an attachment row (owner_kind='notification') when storage_key is provided", async () => {
    const { data, error } = await boardA.client.rpc("file_notification", {
      p_title: "AGM minutes",
      p_body: "Please find attached the AGM minutes.",
      p_category: "general",
      p_storage_key: `${societyA.societyId}/notifications/test/minutes.pdf`,
      p_mime_type: "application/pdf",
      p_byte_size: 54321,
    });
    expect(error).toBeNull();

    const admin = adminClient();
    const { data: attachment } = await admin
      .from("attachments")
      .select("owner_kind, owner_id, mime_type, byte_size")
      .eq("owner_id", data.notification_id)
      .single();
    expect(attachment.owner_kind).toBe("notification");
    expect(attachment.mime_type).toBe("application/pdf");
    expect(attachment.byte_size).toBe(54321);
  });

  it("a regular member cannot post a notification (INSUFFICIENT_ROLE)", async () => {
    const { error } = await memberA.client.rpc("file_notification", {
      p_title: "Member trying to post",
      p_body: "Should be rejected",
      p_category: "general",
    });
    expect(error).not.toBeNull();
    expect(String(error.message)).toContain("INSUFFICIENT_ROLE");
  });
});

// ---------------------------------------------------------------------------
// NOTF-02: poll creation in the same transaction; 2..4 option range enforced.
// ---------------------------------------------------------------------------
describe("NOTF-02: file_notification with a poll", () => {
  it("creates a poll + options in the same transaction (kind='poll')", async () => {
    const { data, error } = await boardA.client.rpc("file_notification", {
      p_title: "Diwali decoration budget",
      p_body: "Vote on the budget for this year's decorations.",
      p_category: "polls",
      p_poll_question: "What budget?",
      p_poll_options: ["10k", "20k", "30k"],
    });
    expect(error).toBeNull();
    expect(data.poll_id).toBeTruthy();

    const admin = adminClient();
    const { data: notif } = await admin
      .from("notifications")
      .select("kind, category")
      .eq("id", data.notification_id)
      .single();
    expect(notif.kind).toBe("poll");
    expect(notif.category).toBe("polls");

    const { data: options } = await admin
      .from("poll_options")
      .select("label, position")
      .eq("poll_id", data.poll_id)
      .order("position");
    expect(options).toHaveLength(3);
    expect(options.map((o) => o.label)).toEqual(["10k", "20k", "30k"]);
  });

  it("rejects fewer than 2 options (POLL_OPTIONS_RANGE)", async () => {
    const { error } = await boardA.client.rpc("file_notification", {
      p_title: "Bad poll",
      p_body: "one option only",
      p_category: "polls",
      p_poll_question: "Yes?",
      p_poll_options: ["Yes"],
    });
    expect(error).not.toBeNull();
    expect(String(error.message)).toContain("POLL_OPTIONS_RANGE");
  });

  it("rejects more than 4 options (POLL_OPTIONS_RANGE)", async () => {
    const { error } = await boardA.client.rpc("file_notification", {
      p_title: "Bad poll",
      p_body: "five options",
      p_category: "polls",
      p_poll_question: "Which?",
      p_poll_options: ["a", "b", "c", "d", "e"],
    });
    expect(error).not.toBeNull();
    expect(String(error.message)).toContain("POLL_OPTIONS_RANGE");
  });
});

// ---------------------------------------------------------------------------
// NOTF-03: RLS — all society members read notices; cross-society sees 0.
// ---------------------------------------------------------------------------
describe("NOTF-03: notification visibility RLS", () => {
  let notifAId;

  beforeAll(async () => {
    const { data } = await boardA.client.rpc("file_notification", {
      p_title: "Society A RLS notice",
      p_body: "Visible to A members only.",
      p_category: "general",
    });
    notifAId = data.notification_id;
  });

  it("Society A member sees the Society A notice", async () => {
    const { data, error } = await memberA.client
      .from("notifications")
      .select("id, society_id")
      .eq("id", notifAId);
    expect(error).toBeNull();
    expect(data).toHaveLength(1);
  });

  it("Society B member sees 0 Society A notices (cross-society isolation)", async () => {
    const { data, error } = await memberB.client
      .from("notifications")
      .select("id, society_id")
      .eq("society_id", societyA.societyId);
    expect(error).toBeNull();
    expect(data ?? []).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// NOTF-03: Realtime — Society A subscriber receives INSERT; Society B sees 0.
// ---------------------------------------------------------------------------
describe("NOTF-03: Realtime subscription with RLS isolation", () => {
  async function subscribeAsMemberA(channelSuffix) {
    const received = [];
    const subClient = await clientForSession(memberA.accessToken, memberA.refreshToken);

    const channel = subClient
      .channel(`notifications-test-${channelSuffix}-${Date.now()}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "notifications",
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

    await new Promise((r) => setTimeout(r, 1000));
    return { subClient, channel, received };
  }

  it("Society A member subscriber receives INSERT for a Society A notice", async () => {
    const { subClient, channel, received } = await subscribeAsMemberA("A");

    const { data: filed, error } = await boardA.client.rpc("file_notification", {
      p_title: "Realtime notice A",
      p_body: "Should arrive via Realtime",
      p_category: "general",
    });
    expect(error).toBeNull();

    try {
      await waitFor(() => received.some((r) => r.id === filed.notification_id), 10_000, 200);
    } finally {
      await subClient.removeChannel(channel);
    }
    expect(received.some((r) => r.id === filed.notification_id)).toBe(true);
  }, 45_000);

  it("Society A subscriber receives 0 events for a Society B notice (cross-society isolation)", async () => {
    const { subClient, channel, received } = await subscribeAsMemberA("A-iso");

    const { data: filedB } = await boardB.client.rpc("file_notification", {
      p_title: "Realtime notice B",
      p_body: "Must NOT reach A's subscriber",
      p_category: "general",
    });

    await new Promise((r) => setTimeout(r, 3000));
    await subClient.removeChannel(channel);

    expect(received.find((r) => r.id === filedB.notification_id)).toBeUndefined();
  }, 30_000);
});
