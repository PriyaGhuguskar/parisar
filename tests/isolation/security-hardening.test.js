// Migration 057 (security hardening) — isolation tests.
//
// Proves, against the real local stack:
//   §2  anon can no longer EXECUTE app RPCs; signed-in users still can;
//   §4  push_tokens has no direct INSERT/UPDATE for users (RPC only);
//   §6  the attachments bucket refuses non-image/PDF content types;
//   §1a per-user throttles on file_complaint / file_notification / add_comment;
//   §1b length caps on free text.
//
// Every negative assertion checks that `error` is NON-NULL, never just that
// data came back empty.
//
// JavaScript only — no TypeScript.

import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { anonClient } from "./helpers/phase3.js";
import {
  adminClient,
  FLAT_A_101,
  FLAT_A_102,
  SOCIETY_A_ID,
  seedPost,
  signInAsBoard,
  signInAsMember,
} from "./helpers/phase6.js";

// Phones from [auth.sms.test_otp]; signInTestPhone recreates the auth user, so
// the per-user throttle counters start from zero on every run.
const MEMBER_PHONE = "+919000000010";
const BOARD_PHONE = "+919000000011";
const BUCKET = "parisar-attachments";

let member;
let board;

const cleanup = { storageKeys: [], postIds: [], pushTokens: [] };

/** True when a supabase-js error looks like a privilege / RLS refusal. */
function isPermissionError(error) {
  if (!error) return false;
  const msg = String(error.message ?? "").toLowerCase();
  return (
    error.code === "42501" ||
    msg.includes("permission denied") ||
    msg.includes("row-level security")
  );
}

function errText(error) {
  return String(error?.message ?? "");
}

async function clearThrottle(userId) {
  await adminClient()
    .from("edge_rate_events")
    .delete()
    .like("bucket", "rpc:%")
    .eq("subject", userId);
}

beforeAll(async () => {
  member = await signInAsMember(MEMBER_PHONE, SOCIETY_A_ID, FLAT_A_101);
  board = await signInAsBoard(BOARD_PHONE, SOCIETY_A_ID, FLAT_A_102);
}, 120_000);

afterAll(async () => {
  const admin = adminClient();
  if (cleanup.storageKeys.length > 0) await admin.storage.from(BUCKET).remove(cleanup.storageKeys);
  if (cleanup.pushTokens.length > 0) {
    await admin.from("push_tokens").delete().in("expo_token", cleanup.pushTokens);
  }
  const userIds = [member?.userId, board?.userId].filter(Boolean);
  if (userIds.length > 0) {
    await admin.from("post_comments").delete().in("author_id", userIds);
    await admin.from("complaints").delete().in("reporter_id", userIds);
    await admin.from("notifications").delete().in("author_id", userIds);
    await admin.from("edge_rate_events").delete().like("bucket", "rpc:%").in("subject", userIds);
  }
  if (cleanup.postIds.length > 0) await admin.from("posts").delete().in("id", cleanup.postIds);
});

// ---------------------------------------------------------------------------
// §2 — EXECUTE grants
// ---------------------------------------------------------------------------
describe("057 §2: anon cannot execute app RPCs", () => {
  const anonCalls = [
    ["get_poll_results", { p_poll_id: "00000000-0000-0000-0000-000000000000" }],
    [
      "vote_on_poll",
      {
        p_poll_id: "00000000-0000-0000-0000-000000000000",
        p_option_id: "00000000-0000-0000-0000-000000000000",
      },
    ],
    ["admin_stats", {}],
    ["my_society_service_status", {}],
    ["get_grievance_officer", {}],
    ["claim_society_authority", {}],
  ];

  for (const [fn, args] of anonCalls) {
    it(`anon → ${fn} is refused with a permission error`, async () => {
      const { data, error } = await anonClient().rpc(fn, args);
      expect(data).toBeNull();
      expect(error).not.toBeNull();
      expect(isPermissionError(error)).toBe(true);
    });
  }

  it("a signed-in member still reaches get_poll_results (business error, not permission)", async () => {
    const { error } = await member.client.rpc("get_poll_results", { p_poll_id: randomUUID() });
    expect(error).not.toBeNull();
    expect(isPermissionError(error)).toBe(false);
    expect(errText(error)).toContain("POLL_NOT_FOUND");
  });

  it("a signed-in member still calls my_society_service_status", async () => {
    const { error } = await member.client.rpc("my_society_service_status");
    expect(error).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// §4 — push_tokens writes only through the RPC
// ---------------------------------------------------------------------------
describe("057 §4: push_tokens direct writes", () => {
  it("a member cannot INSERT a push_tokens row directly", async () => {
    const token = `ExpoPushToken[harden-direct-${Date.now()}]`;
    cleanup.pushTokens.push(token);
    const { error } = await member.client
      .from("push_tokens")
      .insert({ user_id: member.userId, expo_token: token, platform: "android" });
    expect(error).not.toBeNull();
    expect(isPermissionError(error)).toBe(true);
  });

  it("register_push_token still works and the owner can read + delete the row", async () => {
    const token = `ExpoPushToken[harden-rpc-${Date.now()}]`;
    cleanup.pushTokens.push(token);
    const reg = await member.client.rpc("register_push_token", {
      p_token: token,
      p_platform: "android",
    });
    expect(reg.error).toBeNull();

    const { data: rows, error: selErr } = await member.client
      .from("push_tokens")
      .select("expo_token")
      .eq("expo_token", token);
    expect(selErr).toBeNull();
    expect(rows).toHaveLength(1);

    const del = await member.client.from("push_tokens").delete().eq("expo_token", token);
    expect(del.error).toBeNull();
    const { data: gone } = await adminClient()
      .from("push_tokens")
      .select("id")
      .eq("expo_token", token);
    expect(gone ?? []).toHaveLength(0);
  });

  it("a member cannot UPDATE a push_tokens row directly", async () => {
    const token = `ExpoPushToken[harden-upd-${Date.now()}]`;
    cleanup.pushTokens.push(token);
    await member.client.rpc("register_push_token", { p_token: token, p_platform: "android" });
    const { error } = await member.client
      .from("push_tokens")
      .update({ notifications_enabled: false })
      .eq("expo_token", token);
    expect(error).not.toBeNull();
    expect(isPermissionError(error)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// §6 — storage content types
// ---------------------------------------------------------------------------
describe("057 §6: attachments bucket content types", () => {
  it("refuses text/html even at a writable path", async () => {
    const key = `${SOCIETY_A_ID}/complaints/${randomUUID()}/page.html`;
    const { error } = await member.client.storage
      .from(BUCKET)
      .upload(key, new Blob(["<script>alert(1)</script>"], { type: "text/html" }), {
        contentType: "text/html",
        upsert: false,
      });
    if (!error) cleanup.storageKeys.push(key);
    expect(error).not.toBeNull();
  });

  it("refuses image/svg+xml", async () => {
    const key = `${SOCIETY_A_ID}/complaints/${randomUUID()}/x.svg`;
    const { error } = await member.client.storage
      .from(BUCKET)
      .upload(
        key,
        new Blob(["<svg xmlns='http://www.w3.org/2000/svg'/>"], { type: "image/svg+xml" }),
        {
          contentType: "image/svg+xml",
          upsert: false,
        },
      );
    if (!error) cleanup.storageKeys.push(key);
    expect(error).not.toBeNull();
  });

  it("still accepts a JPEG complaint photo", async () => {
    const key = `${SOCIETY_A_ID}/complaints/${randomUUID()}/photo.jpg`;
    const { error } = await member.client.storage
      .from(BUCKET)
      .upload(key, new Uint8Array([0xff, 0xd8, 0xff, 0xe0]), {
        contentType: "image/jpeg",
        upsert: false,
      });
    expect(error).toBeNull();
    cleanup.storageKeys.push(key);
  });

  it("the bucket is private with a size limit and a MIME allowlist", async () => {
    const { data, error } = await adminClient().storage.getBucket(BUCKET);
    expect(error).toBeNull();
    expect(data.public).toBe(false);
    expect(Number(data.file_size_limit)).toBe(20 * 1024 * 1024);
    expect(data.allowed_mime_types).toContain("application/pdf");
    expect(data.allowed_mime_types).not.toContain("image/svg+xml");
  });
});

// ---------------------------------------------------------------------------
// §1a — per-user throttles
// ---------------------------------------------------------------------------
describe("057 §1a: per-user throttles", () => {
  it("file_complaint: 10 per hour, then COMPLAINT_RATE_LIMITED", async () => {
    await clearThrottle(member.userId);
    for (let i = 0; i < 10; i++) {
      const { error } = await member.client.rpc("file_complaint", {
        p_kind: "member",
        p_description: `Throttle complaint ${i}`,
        p_reporter_flat_id: FLAT_A_101,
      });
      expect(error).toBeNull();
    }
    const { error } = await member.client.rpc("file_complaint", {
      p_kind: "member",
      p_description: "Throttle complaint 11",
      p_reporter_flat_id: FLAT_A_101,
    });
    expect(errText(error)).toContain("COMPLAINT_RATE_LIMITED");
    await clearThrottle(member.userId);
  }, 60_000);

  it("a call refused after the throttle check does not use up the allowance", async () => {
    await clearThrottle(member.userId);
    // The key's id differs from p_complaint_id → INVALID_ATTACHMENT_KEY, raised
    // after the throttle counted; the rollback must undo the count.
    const bad = await member.client.rpc("file_complaint", {
      p_kind: "member",
      p_description: "Mismatched attachment key",
      p_reporter_flat_id: FLAT_A_101,
      p_complaint_id: randomUUID(),
      p_storage_key: `${SOCIETY_A_ID}/complaints/${randomUUID()}/photo.jpg`,
      p_mime_type: "image/jpeg",
      p_byte_size: 100,
    });
    expect(bad.error).not.toBeNull();
    expect(errText(bad.error)).not.toContain("COMPLAINT_RATE_LIMITED");
    const { count } = await adminClient()
      .from("edge_rate_events")
      .select("id", { count: "exact", head: true })
      .eq("bucket", "rpc:file_complaint")
      .eq("subject", member.userId);
    expect(count).toBe(0);
  });

  it("file_notification: 20 per hour per board user, then NOTICE_RATE_LIMITED", async () => {
    await clearThrottle(board.userId);
    for (let i = 0; i < 20; i++) {
      const { error } = await board.client.rpc("file_notification", {
        p_title: `Throttle notice ${i}`,
        p_body: "Hardening test notice.",
        p_category: "general",
      });
      expect(error).toBeNull();
    }
    const { error } = await board.client.rpc("file_notification", {
      p_title: "Throttle notice 21",
      p_body: "Hardening test notice.",
      p_category: "general",
    });
    expect(errText(error)).toContain("NOTICE_RATE_LIMITED");
    await clearThrottle(board.userId);
  }, 90_000);

  it("add_comment: 30 per 10 minutes, then COMMENT_RATE_LIMITED", async () => {
    await clearThrottle(member.userId);
    const postId = await seedPost({ societyId: SOCIETY_A_ID, authorId: board.userId });
    cleanup.postIds.push(postId);
    for (let i = 0; i < 30; i++) {
      const { error } = await member.client.rpc("add_comment", {
        p_post_id: postId,
        p_body: `Comment ${i}`,
      });
      expect(error).toBeNull();
    }
    const { error } = await member.client.rpc("add_comment", {
      p_post_id: postId,
      p_body: "Comment 31",
    });
    expect(errText(error)).toContain("COMMENT_RATE_LIMITED");
    await clearThrottle(member.userId);
  }, 90_000);
});

// ---------------------------------------------------------------------------
// §1b — length caps
// ---------------------------------------------------------------------------
describe("057 §1b: free-text length caps", () => {
  it("file_complaint refuses a 2001-character description", async () => {
    await clearThrottle(member.userId);
    const { error } = await member.client.rpc("file_complaint", {
      p_kind: "member",
      p_description: "x".repeat(2001),
      p_reporter_flat_id: FLAT_A_101,
    });
    expect(error).not.toBeNull();
    expect(errText(error)).toContain("complaints_description_max_len");
  });

  it("file_complaint accepts a 1000-character description (the UI maximum)", async () => {
    await clearThrottle(member.userId);
    const { error } = await member.client.rpc("file_complaint", {
      p_kind: "member",
      p_description: "y".repeat(1000),
      p_reporter_flat_id: FLAT_A_101,
    });
    expect(error).toBeNull();
  });

  it("add_comment refuses a 2001-character comment", async () => {
    await clearThrottle(member.userId);
    const postId = await seedPost({ societyId: SOCIETY_A_ID, authorId: board.userId });
    cleanup.postIds.push(postId);
    const { error } = await member.client.rpc("add_comment", {
      p_post_id: postId,
      p_body: "z".repeat(2001),
    });
    expect(error).not.toBeNull();
    expect(errText(error)).toContain("post_comments_body_max_len");
  });
});
