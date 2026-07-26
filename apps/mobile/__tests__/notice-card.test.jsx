/**
 * Unit tests for apps/mobile/components/notices/NoticeCard.jsx (Plan 05-04, Task 1).
 *
 * Locks the 05-UI-SPEC Screen 1 NoticeCard contract:
 *   - Renders title + body preview.
 *   - OwnerChip attribution reads "Posted by {{name}} ({{flat}})" (NOTF-04).
 *   - PollPill appears only when the notice carries a poll.
 *   - AttachmentPill appears only when hasAttachment is passed.
 *   - onPress fires with the notice on tap.
 *
 * JavaScript only — no TypeScript per CLAUDE.md.
 */

import { fireEvent, render } from "@testing-library/react-native";
import React from "react";
import { NoticeCard } from "../components/notices/NoticeCard";

const baseNotice = {
  id: "n1",
  title: "Water supply interruption Sunday",
  body: "Water will be off from 9am to 12pm for tank cleaning.",
  created_at: new Date().toISOString(),
  author: { full_name: "Rahul" },
  author_flat: { number: "203", wing: { name: "B" } },
  polls: [],
};

describe("NoticeCard", () => {
  it("renders the title and body", () => {
    const { getByText } = render(<NoticeCard notice={baseNotice} onPress={() => {}} />);
    expect(getByText("Water supply interruption Sunday")).toBeTruthy();
    expect(getByText(/Water will be off/)).toBeTruthy();
  });

  it("renders attribution as 'Posted by Rahul (B-203)' (NOTF-04)", () => {
    const { getByText } = render(<NoticeCard notice={baseNotice} onPress={() => {}} />);
    expect(getByText("Posted by Rahul (B-203)")).toBeTruthy();
  });

  it("does NOT render a PollPill when there is no poll", () => {
    const { queryByText } = render(<NoticeCard notice={baseNotice} onPress={() => {}} />);
    expect(queryByText(/Poll/i)).toBeNull();
  });

  it("renders a PollPill when the notice carries a poll", () => {
    const withPoll = {
      ...baseNotice,
      polls: [{ id: "p1", question: "Paint color?", status: "open" }],
    };
    const { getByText } = render(<NoticeCard notice={withPoll} onPress={() => {}} />);
    // pollHint is "Poll · {{count}} options"; count is empty in the list view.
    expect(getByText(/Poll/i)).toBeTruthy();
  });

  it("renders an AttachmentPill only when hasAttachment is true", () => {
    const { queryByText, rerender } = render(<NoticeCard notice={baseNotice} onPress={() => {}} />);
    expect(queryByText("PDF")).toBeNull();
    rerender(
      <NoticeCard
        notice={baseNotice}
        onPress={() => {}}
        hasAttachment
        attachmentMime="application/pdf"
      />,
    );
    expect(queryByText("PDF")).toBeTruthy();
  });

  it("calls onPress with the notice when tapped", () => {
    const onPress = jest.fn();
    const { getByRole } = render(<NoticeCard notice={baseNotice} onPress={onPress} />);
    fireEvent.press(getByRole("button"));
    expect(onPress).toHaveBeenCalledWith(baseNotice);
  });

  it("falls back to '—' for missing author/flat", () => {
    const bare = { id: "n2", title: "Raw realtime row", body: "", created_at: null };
    const { getByText } = render(<NoticeCard notice={bare} onPress={() => {}} />);
    expect(getByText("Posted by — (—)")).toBeTruthy();
  });
});
