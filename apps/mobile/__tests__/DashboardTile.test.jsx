/**
 * Unit tests for apps/mobile/components/dashboard/DashboardTile.jsx
 * — Phase 04.1 Wave 1, Plan 01, Task 1.
 *
 * Locks the three variants from UI-SPEC §Tile Color Contract:
 *   1. Live, no badge
 *   2. Live, with badge (warning-500 numeric pill top-right)
 *   3. Placeholder (disabled, 50% opacity, "Coming soon" pill,
 *      "Ships in Phase N" subtitle)
 *
 * Accessibility rules locked here per RESEARCH.md Pattern 4 (Disabled Tile
 * Accessibility):
 *   - accessibilityState.disabled MUST mirror placeholder
 *   - Placeholder press calls AccessibilityInfo.announceForAccessibility
 *   - Placeholder press does NOT navigate (onPress NOT called)
 *
 * Badge clamp: counts > 99 render as "99+".
 *
 * JavaScript only — no TypeScript per CLAUDE.md.
 */

import { fireEvent, render } from "@testing-library/react-native";
import React from "react";
import { AccessibilityInfo } from "react-native";
import { DashboardTile } from "../components/dashboard/DashboardTile";

// Minimal lucide-style icon stub — accepts size + color props.
function Icon({ size = 24, color = "#000" }) {
  return null;
}

describe("DashboardTile", () => {
  beforeEach(() => {
    jest.spyOn(AccessibilityInfo, "announceForAccessibility").mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  // ---------- Live variant (no badge) ----------

  it("renders icon and label", () => {
    const { getByText } = render(<DashboardTile icon={Icon} label="Member Directory" />);
    expect(getByText("Member Directory")).toBeTruthy();
  });

  it("renders without onPress prop without crashing", () => {
    render(<DashboardTile icon={Icon} label="Member Directory" />);
  });

  it("calls onPress when live tile tapped", () => {
    const onPress = jest.fn();
    const { getByRole } = render(<DashboardTile icon={Icon} label="X" onPress={onPress} />);
    fireEvent.press(getByRole("button"));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it("has accessibilityRole='button'", () => {
    const { getByRole } = render(<DashboardTile icon={Icon} label="X" />);
    expect(getByRole("button")).toBeTruthy();
  });

  it("live accessibilityLabel === label when no badge", () => {
    const { getByRole } = render(<DashboardTile icon={Icon} label="Notices" />);
    expect(getByRole("button").props.accessibilityLabel).toBe("Notices");
  });

  // ---------- Live variant (with badge) ----------

  it("renders badge text '3' when badgeCount=3", () => {
    const { getByText } = render(<DashboardTile icon={Icon} label="Reviews" badgeCount={3} />);
    expect(getByText("3")).toBeTruthy();
  });

  it("does NOT render badge when badgeCount=0", () => {
    const { queryByText } = render(<DashboardTile icon={Icon} label="Reviews" badgeCount={0} />);
    expect(queryByText("0")).toBeNull();
  });

  it("renders '99+' when badgeCount > 99", () => {
    const { getByText } = render(<DashboardTile icon={Icon} label="Reviews" badgeCount={150} />);
    expect(getByText("99+")).toBeTruthy();
  });

  it("renders badgeText '5d' when provided", () => {
    const { getByText } = render(
      <DashboardTile icon={Icon} label="Code Rotation" badgeText="5d" />,
    );
    expect(getByText("5d")).toBeTruthy();
  });

  // ---------- Placeholder variant ----------

  it("placeholder renders 'Coming soon' pill", () => {
    const { getByText } = render(
      <DashboardTile icon={Icon} label="Notices" placeholder placeholderPill="Coming soon" />,
    );
    expect(getByText("Coming soon")).toBeTruthy();
  });

  it("placeholder renders placeholderPhase subtitle", () => {
    const { getByText } = render(
      <DashboardTile icon={Icon} label="Notices" placeholder placeholderPhase="Ships in Phase 5" />,
    );
    expect(getByText("Ships in Phase 5")).toBeTruthy();
  });

  it("placeholder is disabled (accessibilityState.disabled=true)", () => {
    const { getByRole } = render(<DashboardTile icon={Icon} label="Notices" placeholder />);
    expect(getByRole("button").props.accessibilityState).toEqual(
      expect.objectContaining({ disabled: true }),
    );
  });

  it("tapping placeholder does NOT call onPress", () => {
    const onPress = jest.fn();
    const { getByRole } = render(
      <DashboardTile icon={Icon} label="Notices" onPress={onPress} placeholder />,
    );
    fireEvent.press(getByRole("button"));
    expect(onPress).not.toHaveBeenCalled();
  });

  it("tapping placeholder calls AccessibilityInfo.announceForAccessibility", () => {
    const { getByRole } = render(
      <DashboardTile
        icon={Icon}
        label="Notices"
        placeholder
        announceUnavailable="Coming soon. This feature ships in Phase 5."
      />,
    );
    fireEvent.press(getByRole("button"));
    expect(AccessibilityInfo.announceForAccessibility).toHaveBeenCalledWith(
      "Coming soon. This feature ships in Phase 5.",
    );
  });

  it("placeholder accessibilityLabel includes label + 'Coming soon' + phase", () => {
    const { getByRole } = render(
      <DashboardTile
        icon={Icon}
        label="Notices"
        placeholder
        placeholderPill="Coming soon"
        placeholderPhase="Ships in Phase 5"
      />,
    );
    expect(getByRole("button").props.accessibilityLabel).toBe(
      "Notices. Coming soon. Ships in Phase 5.",
    );
  });

  it("badge accessibilityLabel includes count ('{N} pending')", () => {
    const { getByRole } = render(<DashboardTile icon={Icon} label="Reviews" badgeCount={4} />);
    expect(getByRole("button").props.accessibilityLabel).toBe("Reviews. 4 pending.");
  });
});
