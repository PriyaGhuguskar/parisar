/**
 * Unit tests for apps/mobile/components/polls/PollBuilder.jsx (Plan 05-04, Task 2).
 *
 * Locks the 05-UI-SPEC Screen 2 PollBuilder contract (NOTF-02):
 *   - Collapsed by default ("Add a poll" affordance, no question field).
 *   - Expanding starts with exactly 2 option rows.
 *   - "Add option" is hidden once 4 options exist (max 4).
 *   - normalizePoll trims, enforces min 2 / max 4, and reports validity.
 *
 * JavaScript only — no TypeScript per CLAUDE.md.
 */

import { fireEvent, render } from "@testing-library/react-native";
import React from "react";
import { normalizePoll, PollBuilder } from "../components/polls/PollBuilder";

function Harness({ initial }) {
  const [value, setValue] = React.useState(
    initial ?? { active: false, question: "", options: ["", ""] },
  );
  return <PollBuilder value={value} onChange={setValue} />;
}

describe("PollBuilder", () => {
  it("renders the collapsed 'Add a poll' affordance by default", () => {
    const { getByText, queryByText } = render(<Harness />);
    expect(getByText("Add a poll")).toBeTruthy();
    // Question label only appears when expanded.
    expect(queryByText("Poll question")).toBeNull();
  });

  it("expanding shows a question field and exactly 2 option rows", () => {
    const { getByText } = render(<Harness />);
    fireEvent.press(getByText("Add a poll"));
    expect(getByText("Poll question")).toBeTruthy();
    // 2 starting options → "Add option" visible, no remove buttons yet.
    expect(getByText("Add option")).toBeTruthy();
  });

  it("hides 'Add option' once 4 options exist (max 4)", () => {
    const { queryByText } = render(
      <Harness initial={{ active: true, question: "Q", options: ["a", "b", "c", "d"] }} />,
    );
    expect(queryByText("Add option")).toBeNull();
  });

  it("shows 'Add option' when fewer than 4 options exist", () => {
    const { getByText } = render(
      <Harness initial={{ active: true, question: "Q", options: ["a", "b", "c"] }} />,
    );
    expect(getByText("Add option")).toBeTruthy();
  });
});

describe("normalizePoll", () => {
  it("returns nulls + valid when poll is inactive", () => {
    expect(normalizePoll({ active: false, question: "", options: ["", ""] })).toEqual({
      pollQuestion: null,
      pollOptions: null,
      valid: true,
    });
  });

  it("trims and drops empty trailing options", () => {
    const r = normalizePoll({
      active: true,
      question: " Paint? ",
      options: ["Red", " ", "Blue", ""],
    });
    expect(r.pollQuestion).toBe("Paint?");
    expect(r.pollOptions).toEqual(["Red", "Blue"]);
    expect(r.valid).toBe(true);
  });

  it("is invalid with fewer than 2 non-empty options", () => {
    const r = normalizePoll({ active: true, question: "Q", options: ["Only", ""] });
    expect(r.valid).toBe(false);
  });

  it("is invalid with a too-short question", () => {
    const r = normalizePoll({ active: true, question: "Q", options: ["a", "b"] });
    expect(r.valid).toBe(false);
  });

  it("is invalid with more than 4 options", () => {
    const r = normalizePoll({
      active: true,
      question: "Question",
      options: ["a", "b", "c", "d", "e"],
    });
    expect(r.valid).toBe(false);
  });
});
