"use server";

// Server actions for Phase 6 community mutations (web).
//
// Each action reads the caller from the cookie session (getUser), validates its
// arguments, and delegates to the shared api-client function. RLS/RPC guards do
// the real enforcement:
//   - add_comment       → any active member (server-gated)
//   - report_content    → any active member; hidden after 3 reporters (055)
//   - delete_post/comment → author-only server-side (NOT_OWNER otherwise — T-06-30)
//   - restore_content / confirm_takedown → admin-only server-side (D-03)
//   - set_grievance_officer → admin-only server-side (D-06)
// The admin-only actions ALSO check the live role here (defence in depth), so a
// member never reaches those RPCs.
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
import { signedInClient } from "../../../lib/auth/actionSession";
import { isManagerRole, resolveActiveSociety } from "../../../lib/auth/activeSociety";
import { cleanText, isToken, isUuid } from "../../../lib/validation";

// Mirrors PostDetailClient / ReportReasonSheet / GrievanceOfficerForm maxLength.
const MAX_COMMENT = 1000;
const MAX_REPORT_NOTE = 300;
const MAX_OFFICER_NAME = 80;
const MAX_OFFICER_CONTACT = 120;
const TARGET_KINDS = new Set(["post", "comment"]);

/** Signed-in Secretary / Co-Secretary of the active society, or null. */
async function managerClient() {
  const ctx = await signedInClient();
  if (!ctx) return null;
  const { role } = await resolveActiveSociety(ctx.supabase, ctx.user);
  return isManagerRole(role) ? ctx : null;
}

/** @param {{ targetKind?: unknown, targetId?: unknown }} input */
function isTarget(input) {
  return TARGET_KINDS.has(input?.targetKind) && isUuid(input?.targetId);
}

/**
 * Add a text comment to a post (COMM-04).
 * @param {{ postId: string, body: string }} input
 * @returns {Promise<{ ok: boolean, commentId?: string, error?: string }>}
 */
export async function addCommentAction(input) {
  const body = cleanText(input?.body, { min: 1, max: MAX_COMMENT, multiline: true });
  if (!isUuid(input?.postId) || !body.ok) return { ok: false, error: "comment_failed" };
  const ctx = await signedInClient();
  if (!ctx) return { ok: false, error: "comment_failed" };
  try {
    const result = await addComment(ctx.supabase, { postId: input.postId, body: body.value });
    revalidatePath(`/community/${input.postId}`);
    return { ok: true, commentId: result.commentId };
  } catch {
    return { ok: false, error: "comment_failed" };
  }
}

/**
 * Report a post or comment (COMM-04). Since 055 an item is hidden only after 3
 * distinct reporters (or a board report) — callers must read `result.hidden`.
 * @param {{ targetKind: 'post'|'comment', targetId: string, reason: string, note?: string|null }} input
 * @returns {Promise<{ ok: boolean, result?: object, error?: string }>}
 */
export async function reportContentAction(input) {
  if (!isTarget(input)) return { ok: false, error: "report_failed" };
  if (!isToken(input?.reason)) return { ok: false, error: "invalid_reason" };
  const note = cleanText(input?.note, { max: MAX_REPORT_NOTE, multiline: true, optional: true });
  if (!note.ok) return { ok: false, error: "report_failed" };

  const ctx = await signedInClient();
  if (!ctx) return { ok: false, error: "report_failed" };
  try {
    const result = await reportContent(ctx.supabase, {
      targetKind: input.targetKind,
      targetId: input.targetId,
      reason: input.reason,
      note: note.value,
    });
    revalidatePath("/community");
    // 055: `already_reported: true` is a success, and one member's report no
    // longer hides the item (`result.hidden === false` → "Reported, thanks").
    return { ok: true, result };
  } catch (err) {
    const msg = String(err?.message ?? "");
    if (msg.includes("REPORT_RATE_LIMITED")) return { ok: false, error: "rate_limited" };
    if (msg.includes("INVALID_REASON")) return { ok: false, error: "invalid_reason" };
    return { ok: false, error: "report_failed" };
  }
}

/**
 * Delete the caller's OWN post (author-only server-side — NOT_OWNER otherwise).
 * @param {string} postId
 * @returns {Promise<{ ok: boolean, error?: string }>}
 */
export async function deletePostAction(postId) {
  if (!isUuid(postId)) return { ok: false, error: "delete_failed" };
  const ctx = await signedInClient();
  if (!ctx) return { ok: false, error: "delete_failed" };
  try {
    await deletePost(ctx.supabase, postId);
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
  if (!isUuid(commentId)) return { ok: false, error: "delete_failed" };
  const ctx = await signedInClient();
  if (!ctx) return { ok: false, error: "delete_failed" };
  try {
    await deleteComment(ctx.supabase, commentId);
    if (isUuid(postId)) revalidatePath(`/community/${postId}`);
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
  if (!isTarget(input)) return { ok: false, error: "restore_failed" };
  const ctx = await managerClient();
  if (!ctx) return { ok: false, error: "restore_failed" };
  try {
    const result = await restoreContent(ctx.supabase, {
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
  if (!isTarget(input)) return { ok: false, error: "takedown_failed" };
  const ctx = await managerClient();
  if (!ctx) return { ok: false, error: "takedown_failed" };
  try {
    const result = await confirmTakedown(ctx.supabase, {
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
  const name = cleanText(input?.name, { min: 1, max: MAX_OFFICER_NAME });
  const contact = cleanText(input?.contact, { min: 1, max: MAX_OFFICER_CONTACT });
  if (!name.ok || !contact.ok) return { ok: false, error: "save_failed" };
  const ctx = await managerClient();
  if (!ctx) return { ok: false, error: "save_failed" };
  try {
    const result = await setGrievanceOfficer(ctx.supabase, {
      name: name.value,
      contact: contact.value,
    });
    revalidatePath("/settings/grievance-officer");
    revalidatePath("/about");
    return { ok: true, result };
  } catch {
    return { ok: false, error: "save_failed" };
  }
}
