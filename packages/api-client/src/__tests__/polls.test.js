// Unit tests for the non-Supabase logic in src/polls.js.
// Real DB behavior is exercised by tests/isolation/polls.test.js (Plan 05-01).

import { describe, expect, it, vi } from "vitest";
import { closePoll, getPollTally, POLL_STATUS, subscribeToVotes, voteOnPoll } from "../polls.js";

function makeRpcClient(rpcImpl) {
  return { rpc: vi.fn(rpcImpl) };
}

function makeChannelClient() {
  const subscribeFn = vi.fn(function subscribeFn(cb) {
    if (cb) cb("SUBSCRIBED");
    return this;
  });
  const onFn = vi.fn(function onFn() {
    return this;
  });
  const channel = { on: onFn, subscribe: subscribeFn };
  const channelFn = vi.fn(() => channel);
  const removeChannel = vi.fn();
  return { client: { channel: channelFn, removeChannel }, channel, onFn, removeChannel };
}

// ---------------------------------------------------------------------------
// Enum re-export
// ---------------------------------------------------------------------------

describe("enum re-export", () => {
  it("re-exports POLL_STATUS with open + closed", () => {
    expect(POLL_STATUS.OPEN).toBe("open");
    expect(POLL_STATUS.CLOSED).toBe("closed");
  });
});

// ---------------------------------------------------------------------------
// voteOnPoll — p_poll_id + p_option_id, returns tally
// ---------------------------------------------------------------------------

describe("voteOnPoll", () => {
  it("passes p_poll_id + p_option_id and returns the tally jsonb", async () => {
    const tally = { poll_id: "p-1", my_option: "o-2", tally: [{ option_id: "o-2", count: 3 }] };
    const supabase = makeRpcClient(async () => ({ data: tally, error: null }));
    const result = await voteOnPoll(supabase, { pollId: "p-1", optionId: "o-2" });
    expect(result).toEqual(tally);
    expect(supabase.rpc).toHaveBeenCalledWith("vote_on_poll", {
      p_poll_id: "p-1",
      p_option_id: "o-2",
    });
  });

  it("throws on RPC errors (POLL_CLOSED)", async () => {
    const err = new Error("POLL_CLOSED");
    const supabase = makeRpcClient(async () => ({ data: null, error: err }));
    await expect(voteOnPoll(supabase, { pollId: "p-1", optionId: "o-1" })).rejects.toBe(err);
  });
});

// ---------------------------------------------------------------------------
// closePoll — p_poll_id
// ---------------------------------------------------------------------------

describe("closePoll", () => {
  it("calls close_poll with p_poll_id", async () => {
    const supabase = makeRpcClient(async () => ({
      data: { poll_id: "p-1", status: "closed" },
      error: null,
    }));
    const result = await closePoll(supabase, { pollId: "p-1" });
    expect(result).toEqual({ poll_id: "p-1", status: "closed" });
    expect(supabase.rpc).toHaveBeenCalledWith("close_poll", { p_poll_id: "p-1" });
  });

  it("throws on RPC errors", async () => {
    const err = new Error("INSUFFICIENT_ROLE");
    const supabase = makeRpcClient(async () => ({ data: null, error: err }));
    await expect(closePoll(supabase, { pollId: "p-1" })).rejects.toBe(err);
  });
});

// ---------------------------------------------------------------------------
// getPollTally — aggregate via get_poll_results RPC (PAR-007: poll_votes rows
// are no longer readable across members; the RPC returns the aggregate only).
// ---------------------------------------------------------------------------

describe("getPollTally", () => {
  it("returns aggregate counts + total + myOption from the get_poll_results RPC", async () => {
    const supabase = makeRpcClient(async () => ({
      data: { poll_id: "p-1", my_option: "o-1", tally: { "o-1": 3, "o-2": 1 }, total: 4 },
      error: null,
    }));
    const result = await getPollTally(supabase, "p-1");

    expect(supabase.rpc).toHaveBeenCalledWith("get_poll_results", { p_poll_id: "p-1" });
    expect(result.total).toBe(4);
    expect(result.myOption).toBe("o-1");
    const counts = Object.fromEntries(result.counts.map((c) => [c.optionId, c.count]));
    expect(counts["o-1"]).toBe(3);
    expect(counts["o-2"]).toBe(1);
  });

  it("returns a zero tally for an unvoted poll", async () => {
    const supabase = makeRpcClient(async () => ({
      data: { poll_id: "p-1", my_option: null, tally: {}, total: 0 },
      error: null,
    }));
    const result = await getPollTally(supabase, "p-1");
    expect(result).toEqual({ counts: [], total: 0, myOption: null });
  });

  it("throws on RPC errors", async () => {
    const err = new Error("rls");
    const supabase = makeRpcClient(async () => ({ data: null, error: err }));
    await expect(getPollTally(supabase, "p-1")).rejects.toBe(err);
  });
});

// ---------------------------------------------------------------------------
// subscribeToVotes — INSERT+UPDATE channel scoped by pollId
// ---------------------------------------------------------------------------

describe("subscribeToVotes", () => {
  it("subscribes to INSERT + UPDATE on poll_votes filtered by poll_id", () => {
    const { client, channel, onFn, removeChannel } = makeChannelClient();
    const onChange = vi.fn();

    const cleanup = subscribeToVotes(client, "p-1", onChange);

    expect(client.channel).toHaveBeenCalledWith("poll-votes-p-1");
    expect(onFn).toHaveBeenCalledTimes(2);
    expect(onFn.mock.calls[0][1]).toMatchObject({
      event: "INSERT",
      schema: "public",
      table: "poll_votes",
      filter: "poll_id=eq.p-1",
    });
    expect(onFn.mock.calls[1][1]).toMatchObject({
      event: "UPDATE",
      schema: "public",
      table: "poll_votes",
      filter: "poll_id=eq.p-1",
    });

    onFn.mock.calls[0][2]({ new: { id: "v-1" } });
    expect(onChange).toHaveBeenCalledWith({ id: "v-1" });

    cleanup();
    expect(removeChannel).toHaveBeenCalledWith(channel);
  });

  it("does not throw when onChange is omitted", () => {
    const { client } = makeChannelClient();
    expect(() => subscribeToVotes(client, "p-1")).not.toThrow();
  });
});
