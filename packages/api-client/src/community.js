// Shared community-feed + moderation + grievance helpers used by BOTH the web and
// mobile Phase 6 flows. Single source of truth: all Supabase calls for posts,
// comments, reports, moderation, and the Grievance Officer live here so neither
// client duplicates RPC signatures, the auto-hide read shape, or — most importantly
// — the createPost moderation handoff (quarantine → moderate-image → create_post).
//
// All RPC param names match the migration in
// supabase/migrations/20260529000009_phase6_flat_actions_community.sql.
//
// D-03 auto-hide is SERVER-SIDE: a reported post/comment is filtered out by RLS
// (hidden_at) so the feed query simply never returns it. This module builds NO
// client-side hide logic — it renders exactly what the RLS-scoped query returns.
//
// supabase-js v2 thenable quirk (06-RESEARCH Pitfall 1): NEVER attach `.catch` to a
// builder chain. Always `const { data, error } = await ...` then branch on error.
//
// Functions exported:
//   Reads:    listPosts, getPost, listComments, listModerationQueue, listAuditLog
//   Writes:   createPost (THE handoff), addComment, reportContent,
//             restoreContent, confirmTakedown, deletePost, deleteComment
//   Grievance: getGrievanceOfficer, setGrievanceOfficer
//   Realtime: subscribeToFeed, subscribeToPostComments, subscribeToModerationQueue

import {
  MODERATION_EVENT_KIND,
  POST_KIND,
  POST_KIND_LABELS,
  REPORT_TARGET_KIND,
} from "@parisar/shared-types";

// Re-export enum constants alongside the API.
export { MODERATION_EVENT_KIND, POST_KIND, POST_KIND_LABELS, REPORT_TARGET_KIND };

// Storage bucket for community post photos (shared bucket, Phase 1).
export const COMMUNITY_BUCKET = "parisar-attachments";

// COMM-01: a post carries at most 4 photos (matches the create_post TOO_MANY_PHOTOS
// guard + the composer's 4-slot UI).
export const MAX_POST_PHOTOS = 4;

// ---------------------------------------------------------------------------
// Reads (RLS scopes server-side: society scope + auto-hide D-03 + soft-delete)
// ---------------------------------------------------------------------------

/**
 * List community feed posts (COMM-01/02). RLS already filters hidden/deleted rows
 * for non-moderators, so the client renders the result as-is (D-03). Newest first.
 *
 * Embeds the author profile + author flat for "Posted by Rahul (B-203)"
 * (community author attribution) and a comment count.
 *
 * @param {object} supabase
 * @param {{ limit?: number, cursor?: string|null }} [opts]
 * @returns {Promise<Array>} post rows with embedded author/author_flat + comment count
 */
export async function listPosts(supabase, { limit = 30, cursor = null } = {}) {
  let q = supabase
    .from("posts")
    .select(
      `
        id,
        society_id,
        author_id,
        author_flat_id,
        kind,
        body,
        created_at,
        author:author_id ( user_id, full_name ),
        author_flat:author_flat_id ( number, wing:wing_id ( name ) ),
        comment_count:post_comments(count)
      `,
    )
    .order("created_at", { ascending: false })
    .limit(limit);

  if (cursor) {
    q = q.lt("created_at", cursor);
  }

  const { data, error } = await q;
  if (error) throw error;
  return data ?? [];
}

/**
 * Fetch a single post with author embeds + its photo attachments (COMM-02/04).
 *
 * Two reads (PostgREST can't embed polymorphic attachments).
 *
 * @param {object} supabase
 * @param {string} id - post UUID
 * @returns {Promise<{ post: object, attachments: Array }>}
 */
export async function getPost(supabase, id) {
  const { data: post, error: pErr } = await supabase
    .from("posts")
    .select(
      `
        *,
        author:author_id ( user_id, full_name ),
        author_flat:author_flat_id ( number, wing:wing_id ( name ) )
      `,
    )
    .eq("id", id)
    .single();
  if (pErr) throw pErr;

  const { data: attachments, error: aErr } = await supabase
    .from("attachments")
    .select("id, storage_key, mime_type, byte_size, created_by, created_at")
    .eq("owner_kind", "post")
    .eq("owner_id", id);
  if (aErr) throw aErr;

  return { post, attachments: attachments ?? [] };
}

/**
 * List a post's comments (COMM-04). RLS filters hidden/deleted comments. Oldest
 * first (conversation order). Embeds author + author flat for the comment by-line.
 *
 * @param {object} supabase
 * @param {string} postId
 * @returns {Promise<Array>}
 */
export async function listComments(supabase, postId) {
  const { data, error } = await supabase
    .from("post_comments")
    .select(
      `
        id,
        post_id,
        author_id,
        author_flat_id,
        body,
        created_at,
        author:author_id ( user_id, full_name ),
        author_flat:author_flat_id ( number, wing:wing_id ( name ) )
      `,
    )
    .eq("post_id", postId)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return data ?? [];
}

/**
 * List the moderation queue — currently-hidden, not-yet-taken-down posts +
 * comments for the Secretary (COMM-04/06). RLS gates this to admin roles (a member
 * receives no hidden rows). Newest first.
 *
 * Returns { posts, comments }: each is a hidden-and-reported item with its author
 * attribution. The UI merges/sorts as needed for the queue.
 *
 * @param {object} supabase
 * @returns {Promise<{ posts: Array, comments: Array }>}
 */
export async function listModerationQueue(supabase) {
  const { data: posts, error: pErr } = await supabase
    .from("posts")
    .select(
      `
        id, society_id, author_id, author_flat_id, kind, body, hidden_at, created_at,
        author:author_id ( user_id, full_name ),
        author_flat:author_flat_id ( number, wing:wing_id ( name ) )
      `,
    )
    .not("hidden_at", "is", null)
    .is("deleted_at", null)
    .order("hidden_at", { ascending: false });
  if (pErr) throw pErr;

  const { data: comments, error: cErr } = await supabase
    .from("post_comments")
    .select(
      `
        id, society_id, post_id, author_id, author_flat_id, body, hidden_at, created_at,
        author:author_id ( user_id, full_name ),
        author_flat:author_flat_id ( number, wing:wing_id ( name ) )
      `,
    )
    .not("hidden_at", "is", null)
    .is("deleted_at", null)
    .order("hidden_at", { ascending: false });
  if (cErr) throw cErr;

  return { posts: posts ?? [], comments: comments ?? [] };
}

/**
 * List the moderation audit log (COMM-07) — report | takedown | restore events,
 * newest first. RLS gates to admin roles. Embeds the acting profile for the by-line.
 *
 * @param {object} supabase
 * @param {{ limit?: number }} [opts]
 * @returns {Promise<Array>}
 */
export async function listAuditLog(supabase, { limit = 50 } = {}) {
  const { data, error } = await supabase
    .from("moderation_events")
    .select(
      `
        id,
        society_id,
        event_kind,
        actor_id,
        target_kind,
        target_id,
        reason,
        created_at,
        actor:actor_id ( user_id, full_name )
      `,
    )
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data ?? [];
}

// ---------------------------------------------------------------------------
// Writes — createPost: THE moderation handoff (D-01/D-02, T-06-14)
// ---------------------------------------------------------------------------

/**
 * Create a community post (COMM-01/03) — orchestrates the synchronous image-safety
 * gate. This is the single place the quarantine → moderate-image → create_post
 * handoff is encoded so neither UI plan reinvents it.
 *
 * Flow:
 *   - 0 photos → call create_post DIRECTLY (no moderation needed).
 *   - ≥1 photo →
 *       1. Generate a postId (so the quarantine + final keys are deterministic).
 *       2. Upload each photo's bytes to {societyId}/quarantine/{postId}/{photoId}.jpg.
 *       3. Invoke the moderate-image Edge Function with the quarantine keys. It moves
 *          PASSing bytes to {societyId}/posts/{postId}/ and returns { ok, movedKeys }
 *          / { ok:false, rejected } / { ok:false, error:'check_failed' }.
 *       4. On ok:false → return the rejection straight through WITHOUT calling
 *          create_post (nothing unverified ever reaches the post — T-06-14).
 *       5. On ok:true → call create_post with the MOVED keys (never the raw
 *          quarantine keys — create_post's OQ2 guard would reject those anyway).
 *
 * Photos must be pre-processed by the caller (the verified expo-image-picker →
 * manipulator resize → file-system base64 → ArrayBuffer chain on mobile, or a
 * File/Blob → ArrayBuffer on web). Each photo is `{ photoId?, bytes, mimeType? }`
 * where `bytes` is an ArrayBuffer / Uint8Array ready for Storage upload.
 *
 * @param {object} supabase
 * @param {{
 *   societyId: string,
 *   kind: 'sell'|'help'|'general',
 *   body: string,
 *   postId?: string,
 *   photos?: Array<{ photoId?: string, bytes: ArrayBuffer|Uint8Array, mimeType?: string }>,
 * }} opts
 * @returns {Promise<
 *   { ok: true, postId: string, societyId: string }
 *   | { ok: false, rejected: string[] }
 *   | { ok: false, error: string }
 * >}
 */
export async function createPost(supabase, { societyId, kind, body, postId, photos = [] }) {
  // ---- No-photo fast path: create_post directly, skip moderate-image. ----
  if (!photos || photos.length === 0) {
    const { data, error } = await supabase.rpc("create_post", {
      p_kind: kind,
      p_body: body,
    });
    if (error) throw error;
    return { ok: true, postId: data.post_id, societyId: data.society_id };
  }

  if (photos.length > MAX_POST_PHOTOS) {
    throw new Error("TOO_MANY_PHOTOS");
  }

  const id = postId ?? cryptoRandomUUID();

  // ---- 1+2. Upload each photo to the QUARANTINE prefix. ----
  const quarantineKeys = [];
  for (const photo of photos) {
    const photoId = photo.photoId ?? cryptoRandomUUID();
    const key = `${societyId}/quarantine/${id}/${photoId}.jpg`;
    const { error: uploadError } = await supabase.storage
      .from(COMMUNITY_BUCKET)
      .upload(key, photo.bytes, {
        contentType: photo.mimeType || "image/jpeg",
        upsert: false,
      });
    if (uploadError) throw uploadError;
    quarantineKeys.push(key);
  }

  // ---- 3. Invoke the synchronous moderation gate. ----
  const { data: moderation, error: invokeError } = await supabase.functions.invoke(
    "moderate-image",
    { body: { societyId, postId: id, photoKeys: quarantineKeys } },
  );
  if (invokeError) throw invokeError;

  // ---- 4. REJECT / check_failed → surface cleanly, NEVER create the post. ----
  if (!moderation || moderation.ok !== true) {
    if (moderation && Array.isArray(moderation.rejected)) {
      return { ok: false, rejected: moderation.rejected };
    }
    return { ok: false, error: moderation?.error || "check_failed" };
  }

  // ---- 5. PASS → create_post with the MOVED keys (T-06-14). ----
  const { data, error } = await supabase.rpc("create_post", {
    p_kind: kind,
    p_body: body,
    p_post_id: id,
    p_photo_keys: moderation.movedKeys,
  });
  if (error) throw error;
  return { ok: true, postId: data.post_id, societyId: data.society_id };
}

/**
 * Add a text comment to a post (COMM-04). Any active member.
 *
 * Calls: add_comment(p_post_id, p_body)
 *
 * @param {object} supabase
 * @param {{ postId: string, body: string }} opts
 * @returns {Promise<{ commentId: string, societyId: string }>}
 */
export async function addComment(supabase, { postId, body }) {
  const { data, error } = await supabase.rpc("add_comment", {
    p_post_id: postId,
    p_body: body,
  });
  if (error) throw error;
  return { commentId: data.comment_id, societyId: data.society_id };
}

/**
 * Report a post or comment (COMM-04). Auto-hides on the first report (D-03). Returns
 * the RPC jsonb ({ report_id, hidden: true }) straight through.
 *
 * Calls: report_content(p_target_kind, p_target_id, p_reason, p_note)
 *
 * @param {object} supabase
 * @param {{ targetKind: 'post'|'comment', targetId: string, reason: string, note?: string|null }} opts
 * @returns {Promise<object>}
 */
export async function reportContent(supabase, { targetKind, targetId, reason, note = null }) {
  const { data, error } = await supabase.rpc("report_content", {
    p_target_kind: targetKind,
    p_target_id: targetId,
    p_reason: reason,
    p_note: note,
  });
  if (error) throw error;
  return data;
}

/**
 * Restore reported content to the feed (admin-only — D-03). Clears hidden_at.
 *
 * Calls: restore_content(p_target_kind, p_target_id)
 *
 * @param {object} supabase
 * @param {{ targetKind: 'post'|'comment', targetId: string }} opts
 * @returns {Promise<object>}
 */
export async function restoreContent(supabase, { targetKind, targetId }) {
  const { data, error } = await supabase.rpc("restore_content", {
    p_target_kind: targetKind,
    p_target_id: targetId,
  });
  if (error) throw error;
  return data;
}

/**
 * Confirm a permanent takedown of reported content (admin-only — D-03). Sets
 * deleted_at (removes from the feed for everyone) + writes a moderation event.
 *
 * Calls: confirm_takedown(p_target_kind, p_target_id)
 *
 * @param {object} supabase
 * @param {{ targetKind: 'post'|'comment', targetId: string }} opts
 * @returns {Promise<object>}
 */
export async function confirmTakedown(supabase, { targetKind, targetId }) {
  const { data, error } = await supabase.rpc("confirm_takedown", {
    p_target_kind: targetKind,
    p_target_id: targetId,
  });
  if (error) throw error;
  return data;
}

/**
 * Delete the caller's OWN post (author-only soft-delete — Plan 01 RPC 17).
 *
 * This wraps the REAL delete_post RPC. The server (NOT the client) enforces
 * author-only via the author_id = auth.uid() gate — a non-author call raises
 * NOT_OWNER, which propagates as a thrown error here. No client-side ownership
 * trust (T-06-30); this is NOT a stub or a hedge.
 *
 * Calls: delete_post(p_post_id)
 *
 * @param {object} supabase
 * @param {string} postId
 * @returns {Promise<object>} the RPC jsonb ({ ok, deleted })
 */
export async function deletePost(supabase, postId) {
  const { data, error } = await supabase.rpc("delete_post", { p_post_id: postId });
  if (error) throw error;
  return data;
}

/**
 * Delete the caller's OWN comment (author-only soft-delete — Plan 01 RPC 18).
 *
 * Same server-enforced author-only gate as {@link deletePost} (NOT_OWNER otherwise).
 *
 * Calls: delete_comment(p_comment_id)
 *
 * @param {object} supabase
 * @param {string} commentId
 * @returns {Promise<object>} the RPC jsonb ({ ok, deleted })
 */
export async function deleteComment(supabase, commentId) {
  const { data, error } = await supabase.rpc("delete_comment", { p_comment_id: commentId });
  if (error) throw error;
  return data;
}

// ---------------------------------------------------------------------------
// Grievance Officer (COMM-05, D-06)
// ---------------------------------------------------------------------------

/**
 * Read the society's Grievance Officer (any active member — D-06). COALESCEs to the
 * Secretary when unset, so the result is never NULL-broken (is_default flags it).
 *
 * Calls: get_grievance_officer() → { name, contact, is_default }
 *
 * @param {object} supabase
 * @returns {Promise<{ name: string, contact: string, is_default: boolean }>}
 */
export async function getGrievanceOfficer(supabase) {
  const { data, error } = await supabase.rpc("get_grievance_officer", {});
  if (error) throw error;
  return data;
}

/**
 * Set the society's Grievance Officer (admin-only — D-06).
 *
 * Calls: set_grievance_officer(p_name, p_contact)
 *
 * @param {object} supabase
 * @param {{ name: string, contact: string }} opts
 * @returns {Promise<object>} the RPC jsonb ({ ok, society_id })
 */
export async function setGrievanceOfficer(supabase, { name, contact }) {
  const { data, error } = await supabase.rpc("set_grievance_officer", {
    p_name: name,
    p_contact: contact,
  });
  if (error) throw error;
  return data;
}

// ---------------------------------------------------------------------------
// Realtime subscriptions (posts + post_comments are in supabase_realtime)
// ---------------------------------------------------------------------------

/**
 * Subscribe to the community feed for a society (COMM Realtime).
 *
 * Subscribes to INSERT + UPDATE + DELETE on posts for the society. Because auto-hide
 * flips a server column the RLS view filters on, a post that becomes hidden simply
 * disappears via the UPDATE/DELETE-out event — the client computes nothing (D-03).
 *
 * @param {object} supabase
 * @param {string} societyId
 * @param {{ onInsert?: Function, onUpdate?: Function, onDelete?: Function, onConnected?: Function }} handlers
 * @returns {Function} cleanup
 */
export function subscribeToFeed(supabase, societyId, handlers) {
  const channel = supabase
    .channel(`community-${societyId}`)
    .on(
      "postgres_changes",
      { event: "INSERT", schema: "public", table: "posts", filter: `society_id=eq.${societyId}` },
      (payload) => handlers.onInsert?.(payload.new),
    )
    .on(
      "postgres_changes",
      { event: "UPDATE", schema: "public", table: "posts", filter: `society_id=eq.${societyId}` },
      (payload) => handlers.onUpdate?.(payload.new),
    )
    .on(
      "postgres_changes",
      { event: "DELETE", schema: "public", table: "posts", filter: `society_id=eq.${societyId}` },
      (payload) => handlers.onDelete?.(payload.old),
    )
    .subscribe((status) => {
      if (status === "SUBSCRIBED") {
        handlers.onConnected?.();
      }
    });

  return () => {
    supabase.removeChannel(channel);
  };
}

/**
 * Subscribe to new + updated comments on a single post (detail screen, COMM-04).
 *
 * @param {object} supabase
 * @param {string} postId
 * @param {{ onInsert?: Function, onUpdate?: Function, onConnected?: Function }} handlers
 * @returns {Function} cleanup
 */
export function subscribeToPostComments(supabase, postId, handlers) {
  const channel = supabase
    .channel(`post-comments-${postId}`)
    .on(
      "postgres_changes",
      {
        event: "INSERT",
        schema: "public",
        table: "post_comments",
        filter: `post_id=eq.${postId}`,
      },
      (payload) => handlers.onInsert?.(payload.new),
    )
    .on(
      "postgres_changes",
      {
        event: "UPDATE",
        schema: "public",
        table: "post_comments",
        filter: `post_id=eq.${postId}`,
      },
      (payload) => handlers.onUpdate?.(payload.new),
    )
    .subscribe((status) => {
      if (status === "SUBSCRIBED") {
        handlers.onConnected?.();
      }
    });

  return () => {
    supabase.removeChannel(channel);
  };
}

/**
 * Subscribe to the moderation queue (admin) — new reports flip posts/comments to
 * hidden via UPDATE; RLS keeps non-admins from receiving these rows.
 *
 * @param {object} supabase
 * @param {string} societyId
 * @param {{ onPostUpdate?: Function, onCommentUpdate?: Function, onConnected?: Function }} handlers
 * @returns {Function} cleanup
 */
export function subscribeToModerationQueue(supabase, societyId, handlers) {
  const channel = supabase
    .channel(`moderation-${societyId}`)
    .on(
      "postgres_changes",
      { event: "UPDATE", schema: "public", table: "posts", filter: `society_id=eq.${societyId}` },
      (payload) => handlers.onPostUpdate?.(payload.new),
    )
    .on(
      "postgres_changes",
      {
        event: "UPDATE",
        schema: "public",
        table: "post_comments",
        filter: `society_id=eq.${societyId}`,
      },
      (payload) => handlers.onCommentUpdate?.(payload.new),
    )
    .subscribe((status) => {
      if (status === "SUBSCRIBED") {
        handlers.onConnected?.();
      }
    });

  return () => {
    supabase.removeChannel(channel);
  };
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Cross-runtime UUID generator (Node 19+, browsers, RN via expo-crypto polyfill).
 * Falls back to a v4-shaped string built from getRandomValues.
 */
function cryptoRandomUUID() {
  const g = globalThis.crypto;
  if (g && typeof g.randomUUID === "function") {
    return g.randomUUID();
  }
  const bytes = new Uint8Array(16);
  if (g && typeof g.getRandomValues === "function") {
    g.getRandomValues(bytes);
  } else {
    for (let i = 0; i < 16; i++) bytes[i] = Math.floor(Math.random() * 256);
  }
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
