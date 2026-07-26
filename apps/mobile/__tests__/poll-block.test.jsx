/**
 * Unit tests for apps/mobile/components/polls/PollBlock.jsx (Plan 05-04, Task 3).
 *
 * Locks the 05-UI-SPEC Screen 4 anti-bandwagon contract (NOTF-08 / T-05-16):
 *   - State A (open, not voted): option rows + "Vote", and NO tally text/bars in the
 *     tree (no "% (n)", no "N votes"). Results are genuinely absent — non-visual-only.
 *   - On voteOnPoll confirm → State B reveals the aggregate bars (no optimistic reveal).
 *   - State C (closed) reveals results even when the user never voted.
 *   - "Close poll" only renders for board roles.
 *   - PollOptionBar guards percent=0 when total=0 (no divide-by-zero).
 *
 * JavaScript only — no TypeScript per CLAUDE.md.
 */

import { fireEvent, render, waitFor } from "@testing-library/react-native";
import React from "react";

const mockVoteOnPoll = jest.fn();
const mockGetPollTally = jest.fn();
const mockSubscribeToVotes = jest.fn(() => () => {});
const mockClosePoll = jest.fn();

jest.mock("@parisar/api-client", () => ({
  voteOnPoll: (...a) => mockVoteOnPoll(...a),
  getPollTally: (...a) => mockGetPollTally(...a),
  subscribeToVotes: (...a) => mockSubscribeToVotes(...a),
  closePoll: (...a) => mockClosePoll(...a),
}));

const { PollBlock } = require("../components/polls/PollBlock");
const { PollOptionBar } = require("../components/polls/PollOptionBar");

const poll = { id: "p1", question: "Repaint the lobby?", status: "open" };
const options = [
  { id: "o1", label: "Yes", position: 0 },
  { id: "o2", label: "No", position: 1 },
];

beforeEach(() => {
  jest.clearAllMocks();
  mockGetPollTally.mockResolvedValue({
    counts: [
      { optionId: "o1", count: 3 },
      { optionId: "o2", count: 1 },
    ],
    total: 4,
  });
  mockVoteOnPoll.mockResolvedValue({ poll_id: "p1", my_option: "o1", tally: [] });
});

describe("PollBlock — State A (anti-bandwagon gate)", () => {
  it("renders option rows + Vote, but NO tally/results in the tree pre-vote", () => {
    const { getByText, queryByText } = render(
      <PollBlock supabase={{}} poll={poll} options={options} myVote={null} role="member" />,
    );
    // Options present.
    expect(getByText("Yes")).toBeTruthy();
    expect(getByText("No")).toBeTruthy();
    // "Cast your vote" subhead, not "Results".
    expect(getByText("Cast your vote")).toBeTruthy();
    expect(queryByText("Results")).toBeNull();
    // CRITICAL: no tally text at all (no "% (n)", no "N votes").
    expect(queryByText(/%/)).toBeNull();
    expect(queryByText(/votes/i)).toBeNull();
  });

  it("does NOT call getPollTally before the user votes (no leak)", () => {
    render(<PollBlock supabase={{}} poll={poll} options={options} myVote={null} role="member" />);
    expect(mockGetPollTally).not.toHaveBeenCalled();
    expect(mockSubscribeToVotes).not.toHaveBeenCalled();
  });

  it("does NOT render 'Close poll' for a member", () => {
    const { queryByText } = render(
      <PollBlock supabase={{}} poll={poll} options={options} myVote={null} role="member" />,
    );
    expect(queryByText("Close poll")).toBeNull();
  });

  it("renders 'Close poll' for a board role", () => {
    const { getByText } = render(
      <PollBlock supabase={{}} poll={poll} options={options} myVote={null} role="secretary" />,
    );
    expect(getByText("Close poll")).toBeTruthy();
  });
});

describe("PollBlock — vote transition (State A → B)", () => {
  it("reveals the aggregate bars only after voteOnPoll resolves", async () => {
    const { getByText, queryByText } = render(
      <PollBlock supabase={{}} poll={poll} options={options} myVote={null} role="member" />,
    );
    // Pre-vote: no results.
    expect(queryByText(/votes/i)).toBeNull();
    // Select an option, then Vote.
    fireEvent.press(getByText("Yes"));
    fireEvent.press(getByText("Vote"));
    await waitFor(() => {
      expect(mockVoteOnPoll).toHaveBeenCalledWith({}, { pollId: "p1", optionId: "o1" });
    });
    // Post-vote: results revealed, tally fetched from rows.
    await waitFor(() => {
      expect(getByText("4 votes")).toBeTruthy();
    });
    expect(mockGetPollTally).toHaveBeenCalled();
  });
});

describe("PollBlock — State C (closed)", () => {
  it("reveals results even when the user never voted", async () => {
    const closed = { ...poll, status: "closed" };
    const { getByText } = render(
      <PollBlock supabase={{}} poll={closed} options={options} myVote={null} role="member" />,
    );
    await waitFor(() => expect(getByText("4 votes")).toBeTruthy());
    expect(getByText("Voting closed")).toBeTruthy();
  });
});

describe("PollOptionBar — divide-by-zero guard", () => {
  it("renders 0% when total is 0", () => {
    const { getByText } = render(<PollOptionBar label="Yes" count={0} total={0} />);
    // tallyValue "{{percent}}% ({{count}})" → "0% (0)"
    expect(getByText("0% (0)")).toBeTruthy();
  });

  it("computes a rounded percent when total > 0", () => {
    const { getByText } = render(<PollOptionBar label="Yes" count={3} total={4} chosen />);
    expect(getByText("75% (3)")).toBeTruthy();
  });
});
