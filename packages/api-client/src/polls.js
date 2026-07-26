// Shared poll helpers used by BOTH the web and mobile Phase 5 flows.
// A poll is always attached to a notice (notification_id) — composing a poll is
// done via fileNotification (notifications.js). This module handles voting, the
// live tally, and closing.
//
// All RPC param names match the migration in
// supabase/migrations/20260528000008_phase5_notifications_bookings.sql.
//
// Functions exported:
//   1. voteOnPoll(supabase, { pollId, optionId })
//   2. closePoll(supabase, { pollId })
//   3. getPollTally(supabase, pollId)
//   4. subscribeToVotes(supabase, pollId, onChange)

import { POLL_STATUS } from "@parisar/shared-types";

// Re-export so callers can pull the enum from the polls module.
export { POLL_STATUS };

// ---------------------------------------------------------------------------
// Writes (SECURITY DEFINER RPCs — direct table writes are REVOKED, T-05-15)
// ---------------------------------------------------------------------------

/**
 * Cast (or change) the caller's vote on a poll.
 *
 * The RPC UPSERTs on (poll_id, user_id) so a second call changes the vote until
 * the poll is closed (NOTF-08). Returns the server-computed tally jsonb
 * { poll_id, my_option, tally: [{ option_id, count }] }.
 *
 * Calls: vote_on_poll(p_poll_id, p_option_id)
 *
 * @param {object} supabase
 * @param {{ pollId: string, optionId: string }} opts
 * @returns {Promise<object>} the tally jsonb
 */
export async function voteOnPoll(supabase, { pollId, optionId }) {
  const { data, error } = await supabase.rpc("vote_on_poll", {
    p_poll_id: pollId,
    p_option_id: optionId,
  });
  if (error) throw error;
  return data;
}

/**
 * Close a poll (author or any board role — server-enforced). After close, voting
 * is rejected and final results are public.
 *
 * Calls: close_poll(p_poll_id)
 *
 * @param {object} supabase
 * @param {{ pollId: string }} opts
 * @returns {Promise<object>} { poll_id, status }
 */
export async function closePoll(supabase, { pollId }) {
  const { data, error } = await supabase.rpc("close_poll", { p_poll_id: pollId });
  if (error) throw error;
  return data;
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

/**
 * Compute a poll's tally from the poll_votes rows (count(*) grouped by option).
 *
 * NEVER reads a denormalized counter (Pitfall 5) — the count is derived from the
 * rows the caller is allowed to see (RLS-scoped). Use this for the initial render;
 * subscribeToVotes pushes deltas for the live aggregate.
 *
 * @param {object} supabase
 * @param {string} pollId
 * @returns {Promise<{ counts: Array<{ optionId: string, count: number }>, total: number }>}
 */
export async function getPollTally(supabase, pollId) {
  // PAR-007: poll_votes rows are no longer readable across members (RLS restricts
  // SELECT to the caller's own vote). The aggregate tally comes from the
  // get_poll_results SECURITY DEFINER RPC, which returns { tally: {optionId: n},
  // total, my_option } without exposing who voted for what.
  const { data, error } = await supabase.rpc("get_poll_results", {
    p_poll_id: pollId,
  });
  if (error) throw error;

  const tallyObj = data?.tally ?? {};
  const counts = Object.entries(tallyObj).map(([optionId, count]) => ({
    optionId,
    count: Number(count) || 0,
  }));
  return { counts, total: Number(data?.total) || 0, myOption: data?.my_option ?? null };
}

// ---------------------------------------------------------------------------
// Realtime subscriptions
// ---------------------------------------------------------------------------

/**
 * Subscribe to vote changes for a single poll (NOTF-08 live tally).
 *
 * `poll_votes` is in the supabase_realtime publication (Plan 05-01). On any
 * INSERT or UPDATE the caller should recompute the aggregate (via getPollTally or
 * by maintaining a local map) — never trust a single payload as the whole tally.
 *
 * @param {object} supabase
 * @param {string} pollId
 * @param {Function} [onChange] - called with the changed row
 * @returns {Function} cleanup
 */
export function subscribeToVotes(supabase, pollId, onChange) {
  const channel = supabase
    .channel(`poll-votes-${pollId}`)
    .on(
      "postgres_changes",
      {
        event: "INSERT",
        schema: "public",
        table: "poll_votes",
        filter: `poll_id=eq.${pollId}`,
      },
      (payload) => onChange?.(payload.new),
    )
    .on(
      "postgres_changes",
      {
        event: "UPDATE",
        schema: "public",
        table: "poll_votes",
        filter: `poll_id=eq.${pollId}`,
      },
      (payload) => onChange?.(payload.new),
    )
    .subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
}
