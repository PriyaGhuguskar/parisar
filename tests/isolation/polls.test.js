// Phase 5 polls isolation + behavior tests (NOTF-02/08).
//
// Runs against the live local Supabase stack (no mock DB).
//
// Covers:
//   - one-vote-per-user UNIQUE + change-vote via UPSERT (one row, option changes)
//   - two users vote different options → tally count(*) consistent (no lost update)
//   - vote on closed poll → POLL_CLOSED
//   - close_poll author/board gate
//
// JavaScript only. Never chain .catch()/.then() on .rpc() (Pitfall 6).

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  adminClient,
  signInAsBoard,
  signInAsMember,
  seedTestSociety,
  teardownPhase5,
  BOARD_A_PHONE,
  MEMBER_A_PHONE,
  BOARD_A2_PHONE,
} from "./helpers/phase5.js";

const societyA = seedTestSociety("A");

let boardA; // posts the poll notification (author)
let memberA; // votes
let memberA2; // second voter (uses the BOARD_A2 phone as a plain member here)

/**
 * Create a poll via file_notification and return { notificationId, pollId, optionIds }.
 */
async function createPoll(question, options) {
  const { data, error } = await boardA.client.rpc("file_notification", {
    p_title: "Poll notice",
    p_body: "Please vote",
    p_category: "polls",
    p_poll_question: question,
    p_poll_options: options,
  });
  if (error) throw new Error(`createPoll: ${error.message}`);
  const admin = adminClient();
  const { data: opts } = await admin
    .from("poll_options")
    .select("id, position")
    .eq("poll_id", data.poll_id)
    .order("position");
  return { notificationId: data.notification_id, pollId: data.poll_id, optionIds: opts.map((o) => o.id) };
}

beforeAll(async () => {
  await teardownPhase5([societyA.societyId]);

  boardA = await signInAsBoard(BOARD_A_PHONE, societyA.societyId, societyA.flat2Id);
  memberA = await signInAsMember(MEMBER_A_PHONE, societyA.societyId, societyA.flatId);
  // Second member in Society A (uses a distinct phone + flat for a distinct user).
  memberA2 = await signInAsMember(BOARD_A2_PHONE, societyA.societyId, societyA.flat2Id);
}, 120_000);

afterAll(async () => {
  await teardownPhase5(
    [societyA.societyId],
    [boardA?.userId, memberA?.userId, memberA2?.userId].filter(Boolean),
  );
});

// ---------------------------------------------------------------------------
// NOTF-08: one-vote-per-user + change-vote UPSERT.
// ---------------------------------------------------------------------------
describe("NOTF-08: vote_on_poll one-vote + change-vote", () => {
  it("voting twice changes the vote (one row, not two)", async () => {
    const { pollId, optionIds } = await createPoll("Color?", ["Red", "Blue"]);

    const first = await memberA.client.rpc("vote_on_poll", {
      p_poll_id: pollId,
      p_option_id: optionIds[0],
    });
    expect(first.error).toBeNull();
    expect(first.data.my_option).toBe(optionIds[0]);

    const second = await memberA.client.rpc("vote_on_poll", {
      p_poll_id: pollId,
      p_option_id: optionIds[1],
    });
    expect(second.error).toBeNull();
    expect(second.data.my_option).toBe(optionIds[1]);

    // Exactly one poll_votes row for this user, now pointing at option 1.
    const admin = adminClient();
    const { data: rows } = await admin
      .from("poll_votes")
      .select("id, option_id, user_id")
      .eq("poll_id", pollId)
      .eq("user_id", memberA.userId);
    expect(rows).toHaveLength(1);
    expect(rows[0].option_id).toBe(optionIds[1]);
  });

  it("two users voting different options yields a consistent tally", async () => {
    const { pollId, optionIds } = await createPoll("Tea or coffee?", ["Tea", "Coffee"]);

    await memberA.client.rpc("vote_on_poll", { p_poll_id: pollId, p_option_id: optionIds[0] });
    const r2 = await memberA2.client.rpc("vote_on_poll", {
      p_poll_id: pollId,
      p_option_id: optionIds[1],
    });
    expect(r2.error).toBeNull();

    // Tally returned by the RPC counts 1 per option.
    expect(r2.data.tally[optionIds[0]]).toBe(1);
    expect(r2.data.tally[optionIds[1]]).toBe(1);

    // DB confirms exactly 2 vote rows total.
    const admin = adminClient();
    const { data: rows } = await admin
      .from("poll_votes")
      .select("id")
      .eq("poll_id", pollId);
    expect(rows).toHaveLength(2);
  });

  it("rejects a duplicate-by-DB attempt (UNIQUE poll_id,user_id) by routing through UPSERT", async () => {
    const { pollId, optionIds } = await createPoll("Pick one", ["A", "B", "C"]);
    // Three votes by the same user, ending on option C.
    await memberA.client.rpc("vote_on_poll", { p_poll_id: pollId, p_option_id: optionIds[0] });
    await memberA.client.rpc("vote_on_poll", { p_poll_id: pollId, p_option_id: optionIds[1] });
    const final = await memberA.client.rpc("vote_on_poll", {
      p_poll_id: pollId,
      p_option_id: optionIds[2],
    });
    expect(final.error).toBeNull();

    const admin = adminClient();
    const { data: rows } = await admin
      .from("poll_votes")
      .select("option_id")
      .eq("poll_id", pollId)
      .eq("user_id", memberA.userId);
    expect(rows).toHaveLength(1);
    expect(rows[0].option_id).toBe(optionIds[2]);
  });
});

// ---------------------------------------------------------------------------
// close_poll + POLL_CLOSED.
// ---------------------------------------------------------------------------
describe("close_poll + voting on closed poll", () => {
  it("author can close the poll; voting on it then fails with POLL_CLOSED", async () => {
    const { pollId, optionIds } = await createPoll("Will close", ["Yes", "No"]);

    const closed = await boardA.client.rpc("close_poll", { p_poll_id: pollId });
    expect(closed.error).toBeNull();
    expect(closed.data.status).toBe("closed");

    const vote = await memberA.client.rpc("vote_on_poll", {
      p_poll_id: pollId,
      p_option_id: optionIds[0],
    });
    expect(vote.error).not.toBeNull();
    expect(String(vote.error.message)).toContain("POLL_CLOSED");

    const admin = adminClient();
    const { data: row } = await admin
      .from("polls")
      .select("status, closed_at")
      .eq("id", pollId)
      .single();
    expect(row.status).toBe("closed");
    expect(row.closed_at).toBeTruthy();
  });

  it("a regular member who is not the author cannot close (INSUFFICIENT_ROLE)", async () => {
    const { pollId } = await createPoll("Member cannot close", ["X", "Y"]);
    const { error } = await memberA.client.rpc("close_poll", { p_poll_id: pollId });
    expect(error).not.toBeNull();
    expect(String(error.message)).toContain("INSUFFICIENT_ROLE");
  });
});
