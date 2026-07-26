/**
 * Unit tests for apps/web/components/dashboard/DashboardTile.jsx
 * — Phase 04.1 Wave 1, Plan 01, Task 2.
 *
 * Web mirror of apps/mobile/__tests__/DashboardTile.test.jsx — same prop
 * contract, same three variants. Replaces RN Pressable assertions with
 * semantic <button> + aria-disabled assertions, AccessibilityInfo with an
 * aria-live polite sr-only region.
 *
 * Verified contracts:
 *   1. Live tile renders as <button> (not <a>) since onPress is a JS handler
 *   2. Live tile is NOT disabled (aria-disabled='false', no disabled attr)
 *   3. Placeholder tile is disabled AND aria-disabled='true' (defense in
 *      depth — `disabled` attribute prevents click, aria-disabled tells AT)
 *   4. Placeholder renders sr-only aria-live='polite' region with the
 *      announceUnavailable copy so screen-reader users hear it on focus
 *   5. Badge clamp '99+' when count > 99, no badge when count === 0
 *   6. Aria-label composition matches mobile exactly
 *
 * JavaScript only — no TypeScript per CLAUDE.md.
 */

import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { DashboardTile } from "../../components/dashboard/DashboardTile";

// Minimal lucide-style icon stub — pure DOM so we can query it.
function Icon() {
  return <span data-testid="icon" />;
}

describe("DashboardTile (web)", () => {
  // ---------- Live variant (no badge) ----------

  it("renders icon and label", () => {
    render(<DashboardTile icon={Icon} label="Member Directory" />);
    expect(screen.getByText("Member Directory")).toBeInTheDocument();
    expect(screen.getByTestId("icon")).toBeInTheDocument();
  });

  it("calls onPress when live tile clicked", () => {
    const onPress = vi.fn();
    render(<DashboardTile icon={Icon} label="X" onPress={onPress} />);
    fireEvent.click(screen.getByRole("button"));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it("renders as a <button> (not <a>)", () => {
    render(<DashboardTile icon={Icon} label="X" />);
    expect(screen.getByRole("button").tagName).toBe("BUTTON");
  });

  it("live tile has aria-disabled='false' and is not disabled", () => {
    render(<DashboardTile icon={Icon} label="X" />);
    const btn = screen.getByRole("button");
    expect(btn.getAttribute("aria-disabled")).toBe("false");
    expect(btn.hasAttribute("disabled")).toBe(false);
  });

  // ---------- Live variant (with badge) ----------

  it("renders badge '3' when badgeCount=3", () => {
    render(<DashboardTile icon={Icon} label="Reviews" badgeCount={3} />);
    expect(screen.getByText("3")).toBeInTheDocument();
  });

  it("does NOT render badge when badgeCount=0", () => {
    render(<DashboardTile icon={Icon} label="Reviews" badgeCount={0} />);
    expect(screen.queryByText("0")).toBeNull();
  });

  it("renders '99+' when badgeCount > 99", () => {
    render(<DashboardTile icon={Icon} label="Reviews" badgeCount={150} />);
    expect(screen.getByText("99+")).toBeInTheDocument();
  });

  it("renders badgeText '5d' when provided", () => {
    render(<DashboardTile icon={Icon} label="Code Rotation" badgeText="5d" />);
    expect(screen.getByText("5d")).toBeInTheDocument();
  });

  // ---------- Placeholder variant ----------

  it("placeholder renders 'Coming soon' pill", () => {
    render(<DashboardTile icon={Icon} label="Notices" placeholder placeholderPill="Coming soon" />);
    expect(screen.getByText("Coming soon")).toBeInTheDocument();
  });

  it("placeholder renders placeholderPhase subtitle", () => {
    render(
      <DashboardTile icon={Icon} label="Notices" placeholder placeholderPhase="Ships in Phase 5" />,
    );
    expect(screen.getByText("Ships in Phase 5")).toBeInTheDocument();
  });

  it("placeholder button is disabled AND aria-disabled='true'", () => {
    render(<DashboardTile icon={Icon} label="Notices" placeholder />);
    const btn = screen.getByRole("button");
    expect(btn.hasAttribute("disabled")).toBe(true);
    expect(btn.getAttribute("aria-disabled")).toBe("true");
  });

  it("tapping placeholder does NOT call onPress", () => {
    const onPress = vi.fn();
    render(<DashboardTile icon={Icon} label="Notices" onPress={onPress} placeholder />);
    fireEvent.click(screen.getByRole("button"));
    expect(onPress).not.toHaveBeenCalled();
  });

  it("placeholder aria-label composes label + pill + phase", () => {
    render(
      <DashboardTile
        icon={Icon}
        label="Notices"
        placeholder
        placeholderPill="Coming soon"
        placeholderPhase="Ships in Phase 5"
      />,
    );
    expect(screen.getByRole("button").getAttribute("aria-label")).toBe(
      "Notices. Coming soon. Ships in Phase 5.",
    );
  });

  it("placeholder renders sr-only aria-live region with announce text", () => {
    const { container } = render(
      <DashboardTile
        icon={Icon}
        label="Notices"
        placeholder
        announceUnavailable="Coming soon. This feature ships in Phase 5."
      />,
    );
    const liveRegion = container.querySelector('[aria-live="polite"]');
    expect(liveRegion).not.toBeNull();
    expect(liveRegion.textContent).toBe("Coming soon. This feature ships in Phase 5.");
  });
});
