// apps/web/__tests__/web-dashboard-tile-preview.test.jsx
// Phase 7 — Plan 07-08 Task 1 (TDD RED→GREEN).
//
// Web port of apps/mobile/__tests__/dashboard-tile-preview.test.jsx (Plan 07-07).
// Same 5 behaviours, web-specific assertions: line-clamp-1 + aria-hidden +
// brand-accent reservation.
//
// Behaviours under test (per 07-08-PLAN.md must_haves + UI-SPEC):
//   1. status="loading"  → renders 2 skeleton bars with data-testid attributes
//      (preview-skeleton-1 / -2).
//   2. status="ready", empty tile → renders the per-tile empty-state i18n string
//      via t(`previews.empty.<tileKey>`).
//   3. status="ready", 1 preview row → renders 1 row using the tile's i18n
//      template with placeholders interpolated.
//   4. status="ready", >2 previews → caps at 2 rendered rows (UI-SPEC max-2).
//   5. status="error" / status="idle" → renders nothing.
//
// UI-SPEC enforcement (07-08 <ui_spec_enforcement>):
//   - Preview rows MUST use the `line-clamp-1` Tailwind utility (Devanagari
//     truncation safety — analogue of RN's numberOfLines={1}).
//   - Preview wrapper MUST be `aria-hidden="true"` so the list screen + tile
//     don't double-announce (T-07-31 PII a11y mitigation — analogue of
//     mobile's accessibilityElementsHidden).
//   - Brand accent #12715A is reserved for icons / badges / language-selector
//     check-marks; preview text MUST use neutral colors.

import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { DashboardTilePreview } from "../components/dashboard/DashboardTilePreview";

describe("DashboardTilePreview (web) — Phase 7 Plan 07-08", () => {
  // -------------------------------------------------------------------------
  // Behaviour 1 — loading skeleton
  // -------------------------------------------------------------------------
  it("status='loading' renders two skeleton bars with stable data-testid", () => {
    const { getByTestId } = render(<DashboardTilePreview status="loading" tileKey="complaints" />);
    expect(getByTestId("preview-skeleton-1")).toBeInTheDocument();
    expect(getByTestId("preview-skeleton-2")).toBeInTheDocument();
  });

  // -------------------------------------------------------------------------
  // Behaviour 2 — empty state (English seeded by global react-i18next mock)
  // -------------------------------------------------------------------------
  it("status='ready' + empty tile renders the previews.empty.<tileKey> string", () => {
    // dashboard.json → previews.empty.myComplaints = "All clear"
    const { getByText } = render(
      <DashboardTilePreview
        status="ready"
        tileKey="myComplaints"
        tile={{ count: 0, previews: [] }}
      />,
    );
    expect(getByText("All clear")).toBeInTheDocument();
  });

  it("empty-state text node uses line-clamp-1 (Devanagari truncation safety)", () => {
    const { getByText } = render(
      <DashboardTilePreview
        status="ready"
        tileKey="myComplaints"
        tile={{ count: 0, previews: [] }}
      />,
    );
    expect(getByText("All clear").className).toContain("line-clamp-1");
  });

  it("renders the per-tile empty string for `complaints` (board view)", () => {
    // dashboard.json → previews.empty.allComplaints = "No new complaints"
    const { getByText } = render(
      <DashboardTilePreview
        status="ready"
        tileKey="complaints"
        tile={{ count: 0, previews: [] }}
      />,
    );
    expect(getByText("No new complaints")).toBeInTheDocument();
  });

  // -------------------------------------------------------------------------
  // Behaviour 3 — 1 preview row, interpolated
  // -------------------------------------------------------------------------
  it("status='ready' + 1 preview renders one interpolated row", () => {
    // dashboard.json → previews.newComplaint = "New complaint: {{title}} · {{flat}}"
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
    expect(getByText("New complaint: leaking tap · B-203")).toBeInTheDocument();
  });

  it("preview row uses line-clamp-1 class", () => {
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
    const row = getByText("New complaint: leaking tap · B-203");
    expect(row.className).toContain("line-clamp-1");
  });

  // -------------------------------------------------------------------------
  // Behaviour 4 — cap at 2 rows (UI-SPEC max-2 enforcement)
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
    expect(getAllByText(/New complaint:/).length).toBe(2);
    expect(queryByText("New complaint: third complaint · C-404")).toBeNull();
  });

  // -------------------------------------------------------------------------
  // Behaviour 5 — error / idle states render nothing
  // -------------------------------------------------------------------------
  it("status='error' renders nothing (silent omission per UI-SPEC)", () => {
    const { container } = render(<DashboardTilePreview status="error" tileKey="complaints" />);
    expect(container.firstChild).toBeNull();
  });

  it("status='idle' renders nothing", () => {
    const { container } = render(<DashboardTilePreview status="idle" tileKey="complaints" />);
    expect(container.firstChild).toBeNull();
  });

  // -------------------------------------------------------------------------
  // UI-SPEC enforcement — wrapper carries aria-hidden="true" (T-07-31)
  // -------------------------------------------------------------------------
  it("preview wrapper sets aria-hidden='true' for ready+rows (T-07-31)", () => {
    const { container } = render(
      <DashboardTilePreview
        status="ready"
        tileKey="complaints"
        tile={{
          count: 1,
          previews: [{ id: "c-1", title: "leaking tap", flat: "B-203" }],
        }}
      />,
    );
    // Outermost rendered element must carry aria-hidden.
    const wrapper = container.firstElementChild;
    expect(wrapper).not.toBeNull();
    expect(wrapper.getAttribute("aria-hidden")).toBe("true");
  });

  it("preview wrapper sets aria-hidden='true' for loading state", () => {
    const { container } = render(<DashboardTilePreview status="loading" tileKey="complaints" />);
    const wrapper = container.firstElementChild;
    expect(wrapper).not.toBeNull();
    expect(wrapper.getAttribute("aria-hidden")).toBe("true");
  });

  it("preview wrapper sets aria-hidden='true' for empty state", () => {
    const { container } = render(
      <DashboardTilePreview
        status="ready"
        tileKey="myComplaints"
        tile={{ count: 0, previews: [] }}
      />,
    );
    const wrapper = container.firstElementChild;
    expect(wrapper).not.toBeNull();
    expect(wrapper.getAttribute("aria-hidden")).toBe("true");
  });

  // -------------------------------------------------------------------------
  // UI-SPEC enforcement — accent color #12715A reserved-for list
  // -------------------------------------------------------------------------
  it("preview row text does NOT use the brand accent #12715A (UI-SPEC reserved-for list)", () => {
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
    const row = getByText("New complaint: leaking tap · B-203");
    // Inline style.color must not be the brand accent.
    expect(row.style.color).not.toBe("#12715A");
    expect(row.style.color).not.toBe("rgb(91, 108, 255)");
  });
});
