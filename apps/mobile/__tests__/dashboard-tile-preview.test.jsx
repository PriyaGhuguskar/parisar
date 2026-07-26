// Phase 7 — Plan 07-07 Task 2: DashboardTilePreview component tests.
//
// Behaviours under test (per 07-07-PLAN.md <behavior>):
//   1. status="loading"  → renders 2 skeleton bars (testIDs preview-skeleton-1/-2).
//   2. status="ready", empty tile → renders the per-tile empty-state i18n string
//      via t(`previews.empty.<tileKey>`).
//   3. status="ready", 1 preview row → renders 1 row using the tile's i18n
//      template with placeholders interpolated (title/flat for `complaints`).
//   4. status="ready", >2 previews → caps at 2 rendered rows (UI-SPEC contract).
//   5. status="error" → renders nothing (silently omitted per UI-SPEC).
//
// UI-SPEC enforcement (07-07 <ui_spec_enforcement>):
//   - Preview rows MUST use `numberOfLines={1}` (Devanagari truncation safety).
//   - Preview wrapper MUST be `accessibilityElementsHidden` so the list screen
//     + tile don't double-announce (T-07-28 PII a11y mitigation).
//   - Empty-state text MUST render via the `previews.empty.<tileKey>` key from
//     dashboard.json (NOT hard-coded English).
//
// JavaScript only — no TypeScript per CLAUDE.md.

import { render } from "@testing-library/react-native";
import React from "react";

import { DashboardTilePreview } from "../components/dashboard/DashboardTilePreview";

// The preview block wraps its content in `accessibilityElementsHidden` for
// the T-07-28 a11y contract. RNTL hides such subtrees from queries by default
// — pass `includeHiddenElements: true` so unit tests can still inspect the
// rendered Text/View nodes. The contract is unit-asserted directly via
// UNSAFE_getAllByType further down.
const HIDDEN = { includeHiddenElements: true };

describe("DashboardTilePreview — Phase 7 Plan 07-07", () => {
  // -------------------------------------------------------------------------
  // Behaviour 1 — loading skeleton
  // -------------------------------------------------------------------------
  it("status='loading' renders two skeleton bars with stable testIDs", () => {
    const { getByTestId } = render(<DashboardTilePreview status="loading" tileKey="complaints" />);
    expect(getByTestId("preview-skeleton-1", HIDDEN)).toBeTruthy();
    expect(getByTestId("preview-skeleton-2", HIDDEN)).toBeTruthy();
  });

  // -------------------------------------------------------------------------
  // Behaviour 2 — empty state (English seeded by global react-i18next mock)
  // -------------------------------------------------------------------------
  it("status='ready' + empty tile renders the previews.empty.<tileKey> string", () => {
    // dashboard.json -> previews.empty.myComplaints = "All clear"
    const { getByText } = render(
      <DashboardTilePreview
        status="ready"
        tileKey="myComplaints"
        tile={{ count: 0, previews: [] }}
      />,
    );
    expect(getByText("All clear", HIDDEN)).toBeTruthy();
  });

  it("empty-state text node uses numberOfLines={1} (Devanagari truncation safety)", () => {
    const { getByText } = render(
      <DashboardTilePreview
        status="ready"
        tileKey="myComplaints"
        tile={{ count: 0, previews: [] }}
      />,
    );
    expect(getByText("All clear", HIDDEN).props.numberOfLines).toBe(1);
  });

  it("renders the per-tile empty string for `complaints` (board view)", () => {
    // dashboard.json -> previews.empty.allComplaints = "No new complaints"
    const { getByText } = render(
      <DashboardTilePreview
        status="ready"
        tileKey="complaints"
        tile={{ count: 0, previews: [] }}
      />,
    );
    expect(getByText("No new complaints", HIDDEN)).toBeTruthy();
  });

  // -------------------------------------------------------------------------
  // Behaviour 3 — 1 preview row, interpolated
  // -------------------------------------------------------------------------
  it("status='ready' + 1 preview renders one interpolated row", () => {
    // dashboard.json -> previews.newComplaint = "New complaint: {{title}} · {{flat}}"
    const { getByText } = render(
      <DashboardTilePreview
        status="ready"
        tileKey="complaints"
        tile={{
          count: 1,
          previews: [{ id: "c-1", title: "leaking tap", flat: "B-203" }],
        }}
      />,
    );
    expect(getByText("New complaint: leaking tap · B-203", HIDDEN)).toBeTruthy();
  });

  it("preview row Text uses numberOfLines={1}", () => {
    const { getByText } = render(
      <DashboardTilePreview
        status="ready"
        tileKey="complaints"
        tile={{
          count: 1,
          previews: [{ id: "c-1", title: "leaking tap", flat: "B-203" }],
        }}
      />,
    );
    expect(getByText("New complaint: leaking tap · B-203", HIDDEN).props.numberOfLines).toBe(1);
  });

  // -------------------------------------------------------------------------
  // Behaviour 4 — cap at 2 rows
  // -------------------------------------------------------------------------
  it("renders exactly 2 rows when given >=2 previews (UI-SPEC max-2 cap)", () => {
    const { getAllByText, queryByText } = render(
      <DashboardTilePreview
        status="ready"
        tileKey="complaints"
        tile={{
          count: 3,
          previews: [
            { id: "c-1", title: "leaking tap", flat: "B-203" },
            { id: "c-2", title: "noisy dog", flat: "A-201" },
            { id: "c-3", title: "third complaint", flat: "C-404" },
          ],
        }}
      />,
    );
    // First 2 rows render.
    expect(getAllByText(/New complaint:/, HIDDEN).length).toBe(2);
    // The 3rd (excess) row is not present.
    expect(queryByText("New complaint: third complaint · C-404", HIDDEN)).toBeNull();
  });

  // -------------------------------------------------------------------------
  // Behaviour 5 — error / idle states render nothing
  // -------------------------------------------------------------------------
  it("status='error' renders null (silent omission per UI-SPEC)", () => {
    const { toJSON } = render(<DashboardTilePreview status="error" tileKey="complaints" />);
    expect(toJSON()).toBeNull();
  });

  it("status='idle' renders null", () => {
    const { toJSON } = render(<DashboardTilePreview status="idle" tileKey="complaints" />);
    expect(toJSON()).toBeNull();
  });

  // -------------------------------------------------------------------------
  // UI-SPEC enforcement — a11y-hidden wrapper (T-07-28)
  // -------------------------------------------------------------------------
  it("preview block wrapper sets accessibilityElementsHidden (T-07-28)", () => {
    const { UNSAFE_getAllByType } = render(
      <DashboardTilePreview
        status="ready"
        tileKey="complaints"
        tile={{
          count: 1,
          previews: [{ id: "c-1", title: "leaking tap", flat: "B-203" }],
        }}
      />,
    );
    // The outermost <View> the component renders must carry the flag.
    const { View } = require("react-native");
    const views = UNSAFE_getAllByType(View);
    expect(views[0].props.accessibilityElementsHidden).toBe(true);
  });

  it("loading skeleton wrapper sets accessibilityElementsHidden", () => {
    const { UNSAFE_getAllByType } = render(
      <DashboardTilePreview status="loading" tileKey="complaints" />,
    );
    const { View } = require("react-native");
    const views = UNSAFE_getAllByType(View);
    expect(views[0].props.accessibilityElementsHidden).toBe(true);
  });

  // -------------------------------------------------------------------------
  // UI-SPEC enforcement — accent color reserved list (#12715A is for icons/
  // badges/check-marks, NOT preview text)
  // -------------------------------------------------------------------------
  it("preview row Text color is neutral-900 — accent #12715A is reserved per UI-SPEC", () => {
    const { getByText } = render(
      <DashboardTilePreview
        status="ready"
        tileKey="complaints"
        tile={{
          count: 1,
          previews: [{ id: "c-1", title: "leaking tap", flat: "B-203" }],
        }}
      />,
    );
    const text = getByText("New complaint: leaking tap · B-203", HIDDEN);
    // The text style (potentially an array) flattens to a non-brand-500 color.
    const { StyleSheet } = require("react-native");
    const flat = StyleSheet.flatten(text.props.style) ?? {};
    expect(flat.color).not.toBe("#12715A");
  });
});
