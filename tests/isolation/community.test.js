// Phase 6 community-feed isolation + behavior tests.
//
// Covers COMM-01..07 + D-02 (image-reject via the server-side OQ2 guard) +
// D-03 (first-report auto-hide survives a DIFFERENT member's direct query)
// per 06-VALIDATION.md. Runs against the live local Supabase stack.
// File-parallelism is disabled by vitest.config.js.
//
// supabase-js v2 thenable quirk (Pitfall 1): always
// `const { data, error } = await supabase...`, NEVER `.catch` on a builder.
//
// JavaScript only — no TypeScript syntax.

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  adminClient,
  signInAsMember,
  signInAsSecretary,
  seedTestSociety,
  teardownPhase6,
  seedPost,
  seedComment,
  clearGrievanceOfficer,
  MEMBER_A_PHONE,
  MEMBER_B_PHONE,
  SECRETARY_A_PHONE,
  MEMBER_A2_PHONE,
} from "./helpers/phase6.js";

const societyA = seedTestSociety("A"); // flatId = A-101, flat2Id = A-102
const societyB = seedTestSociety("B"); // flatId = B-101

let secretaryA; // Society A secretary (moderation: restore / takedown)
let memberA; // Society A member (author / reporter) — A-101
let memberA2; // Society A second member (the "different member" for auto-hide) — A-102
let memberB; // Society B member (cross-society)

beforeAll(async () => {
  await teardownPhase6([societyA.societyId, societyB.societyId]);

  secretaryA = await signInAsSecretary(SECRETARY_A_PHONE, societyA.societyId, societyA.flat2Id);
  memberA = await signInAsMember(MEMBER_A_PHONE, societyA.societyId, societyA.flatId);
  memberA2 = await signInAsMember(MEMBER_A2_PHONE, societyA.societyId, societyA.flat2Id);
  memberB = await signInAsMember(MEMBER_B_PHONE, societyB.societyId, societyB.flatId);
}, 120_000);

afterAll(async () => {
  await teardownPhase6([societyA.societyId, societyB.societyId]);
});

// ---------------------------------------------------------------------------
// COMM-01 + COMM-02: create_post + society scope.
// ---------------------------------------------------------------------------
describe("society scope", () => {
  let postId;

  it("a member creates a post via create_post", async () => {
    const { data, error } = await memberA.client.rpc("create_post", {
      p_kind: "general",
      p_body: "Anyone selling a fridge?",
    });
    expect(error).toBeNull();
    expect(data.post_id).toBeTruthy();
    expect(data.society_id).toBe(societyA.societyId);
    postId = data.post_id;
  });

  it("a same-society member sees the post", async () => {
    const { data, error } = await memberA2.client.from("posts").select("id").eq("id", postId);
    expect(error).toBeNull();
    expect(data).toHaveLength(1);
  });

  it("a Society B member sees ZERO Society A posts (cross-society)", async () => {
    const { data, error } = await memberB.client
      .from("posts")
      .select("id, society_id")
      .eq("society_id", societyA.societyId);
    expect(error).toBeNull();
    expect(data ?? []).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// COMM-03 / D-02 / OQ2: image reject path — create_post rejects a photo key
// not under {society}/posts/{postId}/ (the server-side guard testable without
// the running moderate-image Edge Function).
// ---------------------------------------------------------------------------
describe("image reject path", () => {
  it("create_post raises INVALID_ATTACHMENT_KEY for a key outside {society}/posts/{postId}/", async () => {
    const postId = crypto.randomUUID();
    const { data, error } = await memberA.client.rpc("create_post", {
      p_kind: "sell",
      p_body: "Trying to sneak past the moderation gate",
      p_post_id: postId,
      // Key in the QUARANTINE prefix (NOT the moved posts/ prefix) -> must reject.
      p_photo_keys: [`${societyA.societyId}/quarantine/${postId}/evil.jpg`],
    });
    expect(data).toBeNull();
    expect(error).not.toBeNull();
    expect(String(error.message)).toContain("INVALID_ATTACHMENT_KEY");

    // The post row must NOT exist (the whole RPC transaction rolled back).
    const admin = adminClient();
    const { data: rows } = await admin.from("posts").select("id").eq("id", postId);
    expect(rows ?? []).toHaveLength(0);
  });

  it("create_post accepts a well-formed key under {society}/posts/{postId}/", async () => {
    const postId = crypto.randomUUID();
    const { data, error } = await memberA.client.rpc("create_post", {
      p_kind: "sell",
      p_body: "Sofa for sale",
      p_post_id: postId,
      p_photo_keys: [`${societyA.societyId}/posts/${postId}/sofa.jpg`],
    });
    expect(error).toBeNull();
    expect(data.post_id).toBe(postId);

    const admin = adminClient();
    const { data: att } = await admin
      .from("attachments")
      .select("owner_kind, owner_id")
      .eq("owner_id", postId);
    expect(att).toHaveLength(1);
    expect(att[0].owner_kind).toBe("post");
  });
});

// ---------------------------------------------------------------------------
// COMM-04 / COMM-06 / D-03: auto-hide on the FIRST report survives a DIFFERENT
// member's direct PostgREST query.
// ---------------------------------------------------------------------------
describe("auto-hide direct query", () => {
  let postId;

  beforeAll(async () => {
    postId = await seedPost({
      societyId: societyA.societyId,
      authorId: memberA.userId,
      authorFlatId: societyA.flatId,
      kind: "general",
      body: "A post that will be reported",
    });
  });

  it("before any report, a different member sees the post", async () => {
    const { data, error } = await memberA2.client.from("posts").select("id").eq("id", postId);
    expect(error).toBeNull();
    expect(data).toHaveLength(1);
  });

  it("first report hides it; a DIFFERENT non-board member's direct query returns 0 rows", async () => {
    const { data: rep, error: repErr } = await memberA.client.rpc("report_content", {
      p_target_kind: "post",
      p_target_id: postId,
      p_reason: "inappropriate",
    });
    expect(repErr).toBeNull();
    expect(rep.hidden).toBe(true);

    // memberA2 (a different, non-board member) must NOT see the hidden post.
    const { data, error } = await memberA2.client.from("posts").select("id").eq("id", postId);
    expect(error).toBeNull();
    expect(data ?? []).toHaveLength(0);
  });

  it("a board/secretary still sees the hidden post (moderation queue)", async () => {
    const { data, error } = await secretaryA.client.from("posts").select("id, hidden_at").eq("id", postId);
    expect(error).toBeNull();
    expect(data).toHaveLength(1);
    expect(data[0].hidden_at).not.toBeNull();
  });
});

// ---------------------------------------------------------------------------
// COMM-04: second report is idempotent (no error, hidden_at unchanged).
// ---------------------------------------------------------------------------
describe("report idempotent", () => {
  it("a second report does not error and leaves hidden_at unchanged", async () => {
    const postId = await seedPost({
      societyId: societyA.societyId,
      authorId: memberA.userId,
      authorFlatId: societyA.flatId,
      body: "Idempotency probe",
    });

    const { error: e1 } = await memberA.client.rpc("report_content", {
      p_target_kind: "post",
      p_target_id: postId,
      p_reason: "spam",
    });
    expect(e1).toBeNull();

    const admin = adminClient();
    const { data: first } = await admin.from("posts").select("hidden_at").eq("id", postId).single();
    expect(first.hidden_at).not.toBeNull();

    // Second report by a different member.
    const { error: e2 } = await memberA2.client.rpc("report_content", {
      p_target_kind: "post",
      p_target_id: postId,
      p_reason: "harassment",
    });
    expect(e2).toBeNull();

    const { data: second } = await admin.from("posts").select("hidden_at").eq("id", postId).single();
    expect(second.hidden_at).toBe(first.hidden_at); // FIRST report wins (idempotent)

    // Two report rows recorded (many-per-target allowed).
    const { data: reports } = await admin
      .from("reports")
      .select("id")
      .eq("target_kind", "post")
      .eq("target_id", postId);
    expect((reports ?? []).length).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// D-03: restore re-shows for everyone; a member cannot restore.
// ---------------------------------------------------------------------------
describe("restore", () => {
  let postId;

  beforeAll(async () => {
    postId = await seedPost({
      societyId: societyA.societyId,
      authorId: memberA.userId,
      authorFlatId: societyA.flatId,
      body: "Bogus-report post",
      hiddenAt: new Date().toISOString(),
    });
  });

  it("a regular member CANNOT restore (INSUFFICIENT_ROLE)", async () => {
    const { data, error } = await memberA.client.rpc("restore_content", {
      p_target_kind: "post",
      p_target_id: postId,
    });
    expect(data).toBeNull();
    expect(error).not.toBeNull();
    expect(String(error.message)).toContain("INSUFFICIENT_ROLE");
  });

  it("the secretary restores; a non-board member sees it again", async () => {
    const { data, error } = await secretaryA.client.rpc("restore_content", {
      p_target_kind: "post",
      p_target_id: postId,
    });
    expect(error).toBeNull();
    expect(data.restored).toBe(true);

    const { data: seen, error: seenErr } = await memberA2.client
      .from("posts")
      .select("id")
      .eq("id", postId);
    expect(seenErr).toBeNull();
    expect(seen).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// D-03: confirm_takedown authorization — member cannot, admin can.
// ---------------------------------------------------------------------------
describe("takedown authorization", () => {
  let postId;

  beforeAll(async () => {
    postId = await seedPost({
      societyId: societyA.societyId,
      authorId: memberA.userId,
      authorFlatId: societyA.flatId,
      body: "Post awaiting takedown",
      hiddenAt: new Date().toISOString(),
    });
  });

  it("a regular member CANNOT confirm_takedown (INSUFFICIENT_ROLE)", async () => {
    const { data, error } = await memberA.client.rpc("confirm_takedown", {
      p_target_kind: "post",
      p_target_id: postId,
    });
    expect(data).toBeNull();
    expect(error).not.toBeNull();
    expect(String(error.message)).toContain("INSUFFICIENT_ROLE");
  });

  it("the secretary confirms takedown; the row vanishes for EVERYONE (incl. board)", async () => {
    const { data, error } = await secretaryA.client.rpc("confirm_takedown", {
      p_target_kind: "post",
      p_target_id: postId,
    });
    expect(error).toBeNull();
    expect(data.taken_down).toBe(true);

    // deleted_at filter applies to board/secretary too.
    const { data: gone } = await secretaryA.client.from("posts").select("id").eq("id", postId);
    expect(gone ?? []).toHaveLength(0);

    // The actual row still exists (soft-delete) — verify via admin.
    const admin = adminClient();
    const { data: row } = await admin.from("posts").select("deleted_at").eq("id", postId).single();
    expect(row.deleted_at).not.toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Delete-own: author soft-deletes their post/comment; non-author -> NOT_OWNER.
// ---------------------------------------------------------------------------
describe("delete own", () => {
  it("an author deletes their own post; the row vanishes from the feed", async () => {
    const { data: created } = await memberA.client.rpc("create_post", {
      p_kind: "general",
      p_body: "I will delete this myself",
    });
    const postId = created.post_id;

    const { data, error } = await memberA.client.rpc("delete_post", { p_post_id: postId });
    expect(error).toBeNull();
    expect(data.deleted).toBe(true);

    const { data: gone } = await memberA.client.from("posts").select("id").eq("id", postId);
    expect(gone ?? []).toHaveLength(0);
  });

  it("a NON-author's delete_post raises NOT_OWNER", async () => {
    const postId = await seedPost({
      societyId: societyA.societyId,
      authorId: memberA.userId,
      authorFlatId: societyA.flatId,
      body: "Owned by memberA",
    });
    // memberA2 is not the author.
    const { data, error } = await memberA2.client.rpc("delete_post", { p_post_id: postId });
    expect(data).toBeNull();
    expect(error).not.toBeNull();
    expect(String(error.message)).toContain("NOT_OWNER");

    // Post still visible (the bad delete did nothing).
    const admin = adminClient();
    const { data: row } = await admin.from("posts").select("deleted_at").eq("id", postId).single();
    expect(row.deleted_at).toBeNull();
  });

  it("an author deletes their own comment; a non-author cannot", async () => {
    const postId = await seedPost({
      societyId: societyA.societyId,
      authorId: memberA.userId,
      authorFlatId: societyA.flatId,
      body: "Post for comment-delete test",
    });
    const { data: c } = await memberA2.client.rpc("add_comment", {
      p_post_id: postId,
      p_body: "memberA2's comment",
    });
    const commentId = c.comment_id;

    // Non-author (memberA) cannot delete memberA2's comment.
    const { error: badErr } = await memberA.client.rpc("delete_comment", {
      p_comment_id: commentId,
    });
    expect(badErr).not.toBeNull();
    expect(String(badErr.message)).toContain("NOT_OWNER");

    // Author (memberA2) can.
    const { data: ok, error: okErr } = await memberA2.client.rpc("delete_comment", {
      p_comment_id: commentId,
    });
    expect(okErr).toBeNull();
    expect(ok.deleted).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// COMM-04: a comment is reportable + auto-hideable via the same D-03 flow.
// ---------------------------------------------------------------------------
describe("comment report", () => {
  it("reporting a comment hides it from a different member's direct query", async () => {
    const postId = await seedPost({
      societyId: societyA.societyId,
      authorId: memberA.userId,
      authorFlatId: societyA.flatId,
      body: "Post hosting a reportable comment",
    });
    const commentId = await seedComment({
      societyId: societyA.societyId,
      postId,
      authorId: memberA2.userId,
      authorFlatId: societyA.flat2Id,
      body: "Offensive comment",
    });

    const { data, error } = await memberA.client.rpc("report_content", {
      p_target_kind: "comment",
      p_target_id: commentId,
      p_reason: "harassment",
    });
    expect(error).toBeNull();
    expect(data.hidden).toBe(true);

    // A different non-board member cannot see the hidden comment.
    const { data: seen, error: seenErr } = await memberA2.client
      .from("post_comments")
      .select("id")
      .eq("id", commentId);
    expect(seenErr).toBeNull();
    expect(seen ?? []).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// COMM-07: moderation_events written on report/takedown/restore; secretary-readable.
// ---------------------------------------------------------------------------
describe("moderation audit", () => {
  it("a report writes a moderation_events row the secretary can read", async () => {
    const postId = await seedPost({
      societyId: societyA.societyId,
      authorId: memberA.userId,
      authorFlatId: societyA.flatId,
      body: "Audited post",
    });
    await memberA.client.rpc("report_content", {
      p_target_kind: "post",
      p_target_id: postId,
      p_reason: "spam",
    });

    // Secretary can read moderation_events.
    const { data, error } = await secretaryA.client
      .from("moderation_events")
      .select("event_kind, target_id, actor_id")
      .eq("target_id", postId);
    expect(error).toBeNull();
    expect((data ?? []).some((e) => e.event_kind === "report")).toBe(true);
  });

  it("a regular member CANNOT read moderation_events (admin-only)", async () => {
    const { data, error } = await memberA.client.from("moderation_events").select("id");
    expect(error).toBeNull();
    expect(data ?? []).toHaveLength(0); // RLS strips all rows for non-admin
  });
});

// ---------------------------------------------------------------------------
// COMM-05 / D-06: get_grievance_officer defaults to the Secretary when unset.
// ---------------------------------------------------------------------------
describe("grievance default", () => {
  it("returns the Secretary's name/contact and is_default=true when unset", async () => {
    await clearGrievanceOfficer(societyA.societyId);

    const { data, error } = await memberA.client.rpc("get_grievance_officer");
    expect(error).toBeNull();
    expect(data).toBeTruthy();
    expect(data.is_default).toBe(true);
    // Never NULL-breaks: name resolves to the Secretary or the literal fallback.
    expect(typeof data.name).toBe("string");
    expect(data.name.length).toBeGreaterThan(0);
  });

  it("returns the configured officer + is_default=false after set_grievance_officer", async () => {
    const { error: setErr } = await secretaryA.client.rpc("set_grievance_officer", {
      p_name: "Grievance Officer Priya",
      p_contact: "priya@example.com",
    });
    expect(setErr).toBeNull();

    const { data, error } = await memberA.client.rpc("get_grievance_officer");
    expect(error).toBeNull();
    expect(data.name).toBe("Grievance Officer Priya");
    expect(data.contact).toBe("priya@example.com");
    expect(data.is_default).toBe(false);
  });

  it("a regular member CANNOT set the grievance officer (INSUFFICIENT_ROLE)", async () => {
    const { data, error } = await memberA.client.rpc("set_grievance_officer", {
      p_name: "Hacker",
      p_contact: "hacker@example.com",
    });
    expect(data).toBeNull();
    expect(error).not.toBeNull();
    expect(String(error.message)).toContain("INSUFFICIENT_ROLE");
  });
});
