"use server";

// Server actions for Phase 6 community mutations (web).
//
// Each action creates a cookie-bound @supabase/ssr server client and delegates to
// the shared api-client function. RLS/RPC guards do the real enforcement:
//   - add_comment       → any active member (server-gated)
//   - report_content    → any active member; auto-hides on first report (D-03)
//   - delete_post/comment → author-only server-side (NOT_OWNER otherwise — T-06-30)
//   - restore_content / confirm_takedown → admin-only server-side (D-03)
//   - set_grievance_officer → admin-only server-side (D-06)
//
// createPost is NOT here: it runs CLIENT-SIDE because it needs the browser Storage
// upload + supabase.functions.invoke('moderate-image') (the quarantine → moderate →
// create_post handoff). A server action cannot stream the browser File bytes through
// the moderation gate, so the composer calls the api-client createPost directly with
// the browser client. (Documented split — D-01/D-02.)
//
// Returns plain objects (never Error) so they cross the RSC ↔ client boundary.

import {
  addComment,
  confirmTakedown,
  deleteComment,
  deletePost,
  reportContent,
  restoreContent,
  setGrievanceOfficer,
} from "@parisar/api-client";
import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "../../../lib/supabase/server";

/**
 * Add a text comment to a post (COMM-04).
 * @param {{ postId: string, body: string }} input
 * @returns {Promise<{ ok: boolean, commentId?: string, error?: string }>}
 */
export async function addCommentAction(input) {
  const supabase = await createSupabaseServerClient();
  try {
    const result = await addComment(supabase, { postId: input.postId, body: input.body });
    revalidatePath(`/community/${input.postId}`);
    return { ok: true, commentId: result.commentId };
  } catch {
    return { ok: false, error: "comment_failed" };
  }
}

/**
 * Report a post or comment (COMM-04). Auto-hides on the first report (D-03).
 * @param {{ targetKind: 'post'|'comment', targetId: string, reason: string, note?: string|null }} input
 * @returns {Promise<{ ok: boolean, result?: object, error?: string }>}
 */
export async function reportContentAction(input) {
  const supabase = await createSupabaseServerClient();
  try {
    const result = await reportContent(supabase, {
      targetKind: input.targetKind,
      targetId: input.targetId,
      reason: input.reason,
      note: input.note ?? null,
    });
    revalidatePath("/community");
    return { ok: true, result };
  } catch {
    return { ok: false, error: "report_failed" };
  }
}

/**
 * Delete the caller's OWN post (author-only server-side — NOT_OWNER otherwise).
 * @param {string} postId
 * @returns {Promise<{ ok: boolean, error?: string }>}
 */
export async function deletePostAction(postId) {
  const supabase = await createSupabaseServerClient();
  try {
    await deletePost(supabase, postId);
    revalidatePath("/community");
    return { ok: true };
  } catch {
    return { ok: false, error: "delete_failed" };
  }
}

/**
 * Delete the caller's OWN comment (author-only server-side).
 * @param {string} commentId
 * @param {string} [postId] - for revalidation
 * @returns {Promise<{ ok: boolean, error?: string }>}
 */
export async function deleteCommentAction(commentId, postId) {
  const supabase = await createSupabaseServerClient();
  try {
    await deleteComment(supabase, commentId);
    if (postId) revalidatePath(`/community/${postId}`);
    return { ok: true };
  } catch {
    return { ok: false, error: "delete_failed" };
  }
}

/**
 * Restore reported content to the feed (admin-only — D-03). Writes a restore audit event.
 * @param {{ targetKind: 'post'|'comment', targetId: string }} input
 * @returns {Promise<{ ok: boolean, result?: object, error?: string }>}
 */
export async function restoreContentAction(input) {
  const supabase = await createSupabaseServerClient();
  try {
    const result = await restoreContent(supabase, {
      targetKind: input.targetKind,
      targetId: input.targetId,
    });
    revalidatePath("/community/moderation");
    revalidatePath("/community");
    return { ok: true, result };
  } catch {
    return { ok: false, error: "restore_failed" };
  }
}

/**
 * Confirm a permanent takedown of reported content (admin-only — D-03). Writes a
 * takedown audit event.
 * @param {{ targetKind: 'post'|'comment', targetId: string }} input
 * @returns {Promise<{ ok: boolean, result?: object, error?: string }>}
 */
export async function confirmTakedownAction(input) {
  const supabase = await createSupabaseServerClient();
  try {
    const result = await confirmTakedown(supabase, {
      targetKind: input.targetKind,
      targetId: input.targetId,
    });
    revalidatePath("/community/moderation");
    revalidatePath("/community");
    return { ok: true, result };
  } catch {
    return { ok: false, error: "takedown_failed" };
  }
}

/**
 * Set the society's Grievance Officer (admin-only — D-06).
 * @param {{ name: string, contact: string }} input
 * @returns {Promise<{ ok: boolean, result?: object, error?: string }>}
 */
export async function setGrievanceOfficerAction(input) {
  const supabase = await createSupabaseServerClient();
  try {
    const result = await setGrievanceOfficer(supabase, {
      name: input.name,
      contact: input.contact,
    });
    revalidatePath("/settings/grievance-officer");
    revalidatePath("/about");
    return { ok: true, result };
  } catch {
    return { ok: false, error: "save_failed" };
  }
}
