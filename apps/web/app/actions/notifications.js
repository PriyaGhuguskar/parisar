"use server";

// Server actions for Phase 5 society-notice + poll mutations (web).
//
// Each action creates a cookie-bound @supabase/ssr server client and delegates to
// the shared api-client function. The cookie session is validated by middleware +
// (protected)/layout.jsx upstream; the RLS/RPC guards do the real enforcement. We
// ALSO re-check the session role for the board-gated post (defense in depth,
// T-05-02) so a non-board caller never even reaches file_notification.
//
// Returns plain objects (never Error instances) so they cross the RSC ↔ client
// boundary cleanly. Poll/booking business outcomes (race, slot-taken) are returned
// as typed results, not thrown.

import { closePoll, fileNotification, voteOnPoll } from "@parisar/api-client";
import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "../../lib/supabase/server";

const BOARD_ROLES = new Set(["board_member", "co_secretary", "secretary"]);

/**
 * Read the server-validated session role from the JWT app_metadata.
 * @param {object} supabase
 * @returns {Promise<{ user: object|null, role: string }>}
 */
async function sessionRole(supabase) {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const meta = user?.app_metadata ?? user?.user_metadata ?? {};
  return { user: user ?? null, role: meta.role ?? "member" };
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
  const supabase = await createSupabaseServerClient();

  const { user, role } = await sessionRole(supabase);
  if (!user) return { ok: false, error: "not_authenticated" };
  if (!BOARD_ROLES.has(role)) return { ok: false, error: "not_authorized" };

  try {
    const result = await fileNotification(supabase, {
      title: input.title,
      body: input.body,
      category: input.category ?? undefined,
      noticeId: input.noticeId,
      storageKey: input.storageKey ?? null,
      mimeType: input.mimeType ?? null,
      byteSize: input.byteSize ?? null,
      pollQuestion: input.pollQuestion ?? null,
      pollOptions: input.pollOptions ?? null,
    });
    revalidatePath("/notices");
    if (input.pollOptions) revalidatePath("/polls");
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
  const supabase = await createSupabaseServerClient();
  try {
    const tally = await voteOnPoll(supabase, { pollId, optionId });
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
  const supabase = await createSupabaseServerClient();
  try {
    const result = await closePoll(supabase, { pollId });
    return { ok: true, status: result?.status ?? "closed" };
  } catch (err) {
    return { ok: false, error: err?.message ?? "close_failed" };
  }
}
