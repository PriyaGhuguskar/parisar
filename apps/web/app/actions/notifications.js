"use server";

// Server actions for Phase 5 society-notice + poll mutations (web).
//
// Each action reads the caller from the cookie session (getUser), validates its
// arguments, and delegates to the shared api-client function. The RLS/RPC guards
// do the real enforcement. We ALSO re-check the session role for the board-gated
// post (defense in depth, T-05-02) so a non-board caller never even reaches
// file_notification.
//
// Returns plain objects (never Error instances) so they cross the RSC ↔ client
// boundary cleanly. Poll/booking business outcomes (race, slot-taken) are returned
// as typed results, not thrown.

import { closePoll, fileNotification, voteOnPoll } from "@parisar/api-client";
import { revalidatePath } from "next/cache";
import { signedInClient } from "../../lib/auth/actionSession";
import { isBoardRole, resolveActiveSociety } from "../../lib/auth/activeSociety";
import { cleanAttachment, cleanText, isToken, isUuid } from "../../lib/validation";

// Mirrors NoticeComposer maxLength.
const MAX_TITLE = 120;
const MAX_BODY = 2000;
const MAX_QUESTION = 200;
const MAX_OPTION = 200;
const MIN_OPTIONS = 2;
const MAX_OPTIONS = 4;
const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;

/** Validate the optional poll; returns null when invalid. */
function cleanPoll(pollQuestion, pollOptions) {
  if (pollOptions == null) {
    const q = cleanText(pollQuestion, { max: MAX_QUESTION, optional: true });
    return q.ok ? { pollQuestion: q.value, pollOptions: null } : null;
  }
  if (!Array.isArray(pollOptions)) return null;
  if (pollOptions.length < MIN_OPTIONS || pollOptions.length > MAX_OPTIONS) return null;
  const options = [];
  for (const raw of pollOptions) {
    const o = cleanText(raw, { min: 1, max: MAX_OPTION });
    if (!o.ok) return null;
    options.push(o.value);
  }
  const q = cleanText(pollQuestion, { min: 1, max: MAX_QUESTION });
  return q.ok ? { pollQuestion: q.value, pollOptions: options } : null;
}

/**
 * Post a new society notice (board roles only — RPC enforces; action guards too).
 *
 * The web composer uploads any attachment client-side via uploadNoticeAttachmentWeb
 * BEFORE calling this action, then passes the resulting storage key here (mirrors
 * the Phase 4 complaint flow).
 *
 * @param {{
 *   title: string,
 *   body: string,
 *   category?: string,
 *   noticeId?: string,
 *   storageKey?: string|null,
 *   mimeType?: string|null,
 *   byteSize?: number|null,
 *   pollQuestion?: string|null,
 *   pollOptions?: string[]|null,
 * }} input
 * @returns {Promise<{ ok: boolean, notificationId?: string, societyId?: string, pollId?: string|null, error?: string }>}
 */
export async function postNoticeAction(input) {
  const title = cleanText(input?.title, { min: 1, max: MAX_TITLE });
  const body = cleanText(input?.body, { min: 1, max: MAX_BODY, multiline: true });
  if (!title.ok || !body.ok) return { ok: false, error: "invalid_input" };
  if (input?.category != null && !isToken(input.category)) {
    return { ok: false, error: "invalid_input" };
  }
  if (input?.noticeId != null && !isUuid(input.noticeId)) {
    return { ok: false, error: "invalid_input" };
  }
  const attachment = cleanAttachment(input, { maxBytes: MAX_ATTACHMENT_BYTES });
  if (!attachment.ok) return { ok: false, error: "invalid_input" };
  const poll = cleanPoll(input?.pollQuestion, input?.pollOptions);
  if (!poll) return { ok: false, error: "invalid_input" };

  const ctx = await signedInClient();
  if (!ctx) return { ok: false, error: "not_authenticated" };
  // Live role — NOT app_metadata (getUser() never carries the Auth Hook claims).
  const { role } = await resolveActiveSociety(ctx.supabase, ctx.user);
  if (!isBoardRole(role)) return { ok: false, error: "not_authorized" };

  try {
    const result = await fileNotification(ctx.supabase, {
      title: title.value,
      body: body.value,
      category: input.category ?? undefined,
      noticeId: input.noticeId,
      ...attachment.value,
      ...poll,
    });
    revalidatePath("/notices");
    if (poll.pollOptions) revalidatePath("/polls");
    return {
      ok: true,
      notificationId: result.notificationId,
      societyId: result.societyId,
      pollId: result.pollId,
    };
  } catch (err) {
    return { ok: false, error: err?.message ?? "post_failed" };
  }
}

/**
 * Cast or change the caller's vote on a poll (NOTF-08).
 *
 * Returns the server-computed tally jsonb on success so the PollBlock can render
 * State B from a confirmed result (no optimistic reveal).
 *
 * @param {string} pollId
 * @param {string} optionId
 * @returns {Promise<{ ok: boolean, tally?: object, error?: string }>}
 */
export async function votePollAction(pollId, optionId) {
  if (!isUuid(pollId) || !isUuid(optionId)) return { ok: false, error: "invalid_input" };
  const ctx = await signedInClient();
  if (!ctx) return { ok: false, error: "not_authenticated" };
  try {
    const tally = await voteOnPoll(ctx.supabase, { pollId, optionId });
    return { ok: true, tally };
  } catch (err) {
    return { ok: false, error: err?.message ?? "vote_failed" };
  }
}

/**
 * Close a poll (author or any board role — RPC enforces).
 *
 * @param {string} pollId
 * @returns {Promise<{ ok: boolean, status?: string, error?: string }>}
 */
export async function closePollAction(pollId) {
  if (!isUuid(pollId)) return { ok: false, error: "invalid_input" };
  const ctx = await signedInClient();
  if (!ctx) return { ok: false, error: "not_authenticated" };
  try {
    const result = await closePoll(ctx.supabase, { pollId });
    return { ok: true, status: result?.status ?? "closed" };
  } catch (err) {
    return { ok: false, error: err?.message ?? "close_failed" };
  }
}
