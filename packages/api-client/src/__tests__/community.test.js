// Unit tests for the non-Supabase logic in src/community.js.
// Real DB behavior (auto-hide, OQ2 key guard, author-only delete, moderation,
// grievance default) is exercised by tests/isolation/community.test.js (Plan 06-01).
//
// supabase-js v2 thenable quirk: NEVER attach `.catch` to a builder chain. The
// createPost handoff (quarantine upload -> moderate-image -> create_post) is the
// novel surface tested here: with 0 photos it calls create_post directly; with
// photos it uploads to quarantine, invokes moderate-image, and on ok:false
// surfaces the rejection WITHOUT calling create_post (T-06-14).

import { describe, expect, it, vi } from "vitest";
import {
  addComment,
  confirmTakedown,
  createPost,
  deleteComment,
  deletePost,
  getGrievanceOfficer,
  POST_KIND,
  REPORT_TARGET_KIND,
  reportContent,
  restoreContent,
  setGrievanceOfficer,
} from "../community.js";

function makeRpcClient(rpcImpl) {
  return { rpc: vi.fn(rpcImpl) };
}

// ---------------------------------------------------------------------------
// Enum re-export
// ---------------------------------------------------------------------------

describe("enum re-export", () => {
  it("re-exports POST_KIND with sell + help + general", () => {
    expect(POST_KIND.SELL).toBe("sell");
    expect(POST_KIND.HELP).toBe("help");
    expect(POST_KIND.GENERAL).toBe("general");
  });

  it("re-exports REPORT_TARGET_KIND with post + comment", () => {
    expect(REPORT_TARGET_KIND.POST).toBe("post");
    expect(REPORT_TARGET_KIND.COMMENT).toBe("comment");
  });
});

// ---------------------------------------------------------------------------
// createPost — the moderation handoff
// ---------------------------------------------------------------------------

describe("createPost", () => {
  it("with 0 photos calls create_post DIRECTLY (skips moderate-image)", async () => {
    const invoke = vi.fn();
    const supabase = {
      rpc: vi.fn(async () => ({ data: { post_id: "p-1", society_id: "soc-1" }, error: null })),
      functions: { invoke },
    };

    const result = await createPost(supabase, {
      societyId: "soc-1",
      kind: "general",
      body: "Hello neighbours",
      photos: [],
    });

    expect(invoke).not.toHaveBeenCalled();
    expect(supabase.rpc).toHaveBeenCalledWith("create_post", {
      p_kind: "general",
      p_body: "Hello neighbours",
    });
    expect(result).toEqual({ ok: true, postId: "p-1", societyId: "soc-1" });
  });

  it("with photos: uploads to quarantine, invokes moderate-image, then create_post with movedKeys on PASS", async () => {
    const uploaded = [];
    const upload = vi.fn(async (key) => {
      uploaded.push(key);
      return { error: null };
    });
    const movedKeys = ["soc-1/posts/POST/a.jpg", "soc-1/posts/POST/b.jpg"];
    const invoke = vi.fn(async () => ({
      data: { ok: true, movedKeys },
      error: null,
    }));
    const supabase = {
      rpc: vi.fn(async () => ({ data: { post_id: "POST", society_id: "soc-1" }, error: null })),
      storage: { from: vi.fn(() => ({ upload })) },
      functions: { invoke },
    };

    // The photos pass already-processed bytes (the resize/base64/ArrayBuffer chain
    // is the caller's; the api-client only needs bytes + mimeType for upload).
    const photos = [
      { photoId: "a", bytes: new Uint8Array([1]).buffer, mimeType: "image/jpeg" },
      { photoId: "b", bytes: new Uint8Array([2]).buffer, mimeType: "image/jpeg" },
    ];

    const result = await createPost(supabase, {
      societyId: "soc-1",
      kind: "sell",
      body: "Selling a sofa",
      postId: "POST",
      photos,
    });

    // Uploaded to the quarantine prefix (NOT posts/).
    expect(uploaded).toEqual(["soc-1/quarantine/POST/a.jpg", "soc-1/quarantine/POST/b.jpg"]);
    // moderate-image invoked with the quarantine keys.
    expect(invoke).toHaveBeenCalledWith("moderate-image", {
      body: {
        societyId: "soc-1",
        postId: "POST",
        photoKeys: ["soc-1/quarantine/POST/a.jpg", "soc-1/quarantine/POST/b.jpg"],
      },
    });
    // create_post receives the MOVED keys returned by moderate-image, never the
    // raw quarantine keys (T-06-14).
    expect(supabase.rpc).toHaveBeenCalledWith("create_post", {
      p_kind: "sell",
      p_body: "Selling a sofa",
      p_post_id: "POST",
      p_photo_keys: movedKeys,
    });
    expect(result).toEqual({ ok: true, postId: "POST", societyId: "soc-1" });
  });

  it("on moderate-image ok:false surfaces `rejected` WITHOUT calling create_post", async () => {
    const upload = vi.fn(async () => ({ error: null }));
    const invoke = vi.fn(async () => ({
      data: { ok: false, rejected: ["soc-1/quarantine/POST/bad.jpg"] },
      error: null,
    }));
    const supabase = {
      rpc: vi.fn(),
      storage: { from: vi.fn(() => ({ upload })) },
      functions: { invoke },
    };

    const result = await createPost(supabase, {
      societyId: "soc-1",
      kind: "general",
      body: "with an unsafe image",
      postId: "POST",
      photos: [{ photoId: "bad", bytes: new Uint8Array([3]).buffer, mimeType: "image/jpeg" }],
    });

    expect(result).toEqual({ ok: false, rejected: ["soc-1/quarantine/POST/bad.jpg"] });
    expect(supabase.rpc).not.toHaveBeenCalled(); // create_post never reached
  });

  it("on moderate-image check_failed surfaces {ok:false, error} WITHOUT calling create_post", async () => {
    const upload = vi.fn(async () => ({ error: null }));
    const invoke = vi.fn(async () => ({ data: { ok: false, error: "check_failed" }, error: null }));
    const supabase = {
      rpc: vi.fn(),
      storage: { from: vi.fn(() => ({ upload })) },
      functions: { invoke },
    };

    const result = await createPost(supabase, {
      societyId: "soc-1",
      kind: "general",
      body: "x",
      postId: "POST",
      photos: [{ photoId: "z", bytes: new Uint8Array([4]).buffer, mimeType: "image/jpeg" }],
    });

    expect(result).toEqual({ ok: false, error: "check_failed" });
    expect(supabase.rpc).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// addComment
// ---------------------------------------------------------------------------

describe("addComment", () => {
  it("calls rpc('add_comment', {p_post_id, p_body})", async () => {
    const supabase = makeRpcClient(async () => ({
      data: { comment_id: "c-1", society_id: "soc-1" },
      error: null,
    }));
    const result = await addComment(supabase, { postId: "p-1", body: "Nice!" });
    expect(supabase.rpc).toHaveBeenCalledWith("add_comment", {
      p_post_id: "p-1",
      p_body: "Nice!",
    });
    expect(result).toEqual({ commentId: "c-1", societyId: "soc-1" });
  });
});

// ---------------------------------------------------------------------------
// reportContent
// ---------------------------------------------------------------------------

describe("reportContent", () => {
  it("calls rpc('report_content', {p_target_kind, p_target_id, p_reason, p_note})", async () => {
    const supabase = makeRpcClient(async () => ({
      data: { report_id: "r-1", hidden: true },
      error: null,
    }));
    const result = await reportContent(supabase, {
      targetKind: "post",
      targetId: "p-1",
      reason: "spam",
      note: "obvious scam",
    });
    expect(supabase.rpc).toHaveBeenCalledWith("report_content", {
      p_target_kind: "post",
      p_target_id: "p-1",
      p_reason: "spam",
      p_note: "obvious scam",
    });
    expect(result).toEqual({ report_id: "r-1", hidden: true });
  });

  it("defaults note to null", async () => {
    const supabase = makeRpcClient(async () => ({
      data: { report_id: "r-2", hidden: true },
      error: null,
    }));
    await reportContent(supabase, { targetKind: "comment", targetId: "c-1", reason: "harassment" });
    expect(supabase.rpc.mock.calls[0][1].p_note).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// restoreContent / confirmTakedown (admin)
// ---------------------------------------------------------------------------

describe("restoreContent / confirmTakedown", () => {
  it("restoreContent calls rpc('restore_content', {p_target_kind, p_target_id})", async () => {
    const supabase = makeRpcClient(async () => ({
      data: { ok: true, restored: true },
      error: null,
    }));
    const result = await restoreContent(supabase, { targetKind: "post", targetId: "p-1" });
    expect(supabase.rpc).toHaveBeenCalledWith("restore_content", {
      p_target_kind: "post",
      p_target_id: "p-1",
    });
    expect(result).toEqual({ ok: true, restored: true });
  });

  it("confirmTakedown calls rpc('confirm_takedown', {p_target_kind, p_target_id})", async () => {
    const supabase = makeRpcClient(async () => ({
      data: { ok: true, taken_down: true },
      error: null,
    }));
    const result = await confirmTakedown(supabase, { targetKind: "comment", targetId: "c-1" });
    expect(supabase.rpc).toHaveBeenCalledWith("confirm_takedown", {
      p_target_kind: "comment",
      p_target_id: "c-1",
    });
    expect(result).toEqual({ ok: true, taken_down: true });
  });
});

// ---------------------------------------------------------------------------
// deletePost / deleteComment — the REAL author-only Plan 01 RPCs (T-06-30).
// The server enforces author-only via NOT_OWNER; the wrapper does NO client-side
// ownership trust and is NOT a stub/hedge.
// ---------------------------------------------------------------------------

describe("deletePost / deleteComment (author-only)", () => {
  it("deletePost calls rpc('delete_post', {p_post_id})", async () => {
    const supabase = makeRpcClient(async () => ({
      data: { ok: true, deleted: true },
      error: null,
    }));
    const result = await deletePost(supabase, "p-1");
    expect(supabase.rpc).toHaveBeenCalledWith("delete_post", { p_post_id: "p-1" });
    expect(result).toEqual({ ok: true, deleted: true });
  });

  it("deleteComment calls rpc('delete_comment', {p_comment_id})", async () => {
    const supabase = makeRpcClient(async () => ({
      data: { ok: true, deleted: true },
      error: null,
    }));
    const result = await deleteComment(supabase, "c-1");
    expect(supabase.rpc).toHaveBeenCalledWith("delete_comment", { p_comment_id: "c-1" });
    expect(result).toEqual({ ok: true, deleted: true });
  });

  it("propagates NOT_OWNER as a thrown error (server-enforced, no client trust)", async () => {
    const err = new Error("NOT_OWNER");
    const supabase = makeRpcClient(async () => ({ data: null, error: err }));
    await expect(deletePost(supabase, "p-1")).rejects.toBe(err);
  });
});

// ---------------------------------------------------------------------------
// grievance officer
// ---------------------------------------------------------------------------

describe("grievance officer", () => {
  it("getGrievanceOfficer calls rpc('get_grievance_officer') and returns the jsonb", async () => {
    const supabase = makeRpcClient(async () => ({
      data: { name: "Amit Sharma", contact: "98765 43210", is_default: false },
      error: null,
    }));
    const result = await getGrievanceOfficer(supabase);
    expect(supabase.rpc).toHaveBeenCalledWith("get_grievance_officer", {});
    expect(result).toEqual({ name: "Amit Sharma", contact: "98765 43210", is_default: false });
  });

  it("setGrievanceOfficer calls rpc('set_grievance_officer', {p_name, p_contact})", async () => {
    const supabase = makeRpcClient(async () => ({
      data: { ok: true, society_id: "soc-1" },
      error: null,
    }));
    const result = await setGrievanceOfficer(supabase, { name: "Amit", contact: "a@s.in" });
    expect(supabase.rpc).toHaveBeenCalledWith("set_grievance_officer", {
      p_name: "Amit",
      p_contact: "a@s.in",
    });
    expect(result).toEqual({ ok: true, society_id: "soc-1" });
  });
});
