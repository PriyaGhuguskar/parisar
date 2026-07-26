import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

// Mock the shadcn dropdown to render as semantic elements (jsdom does not have
// the floating-ui positioning the base-ui Menu primitive relies on).
// NOTE: vi.mock factories are hoisted above imports → import React inside.
vi.mock("@/components/ui/dropdown-menu", async () => {
  const { cloneElement } = await import("react");
  return {
    DropdownMenu: ({ children }) => <div>{children}</div>,
    // base-ui `render` contract (not Radix `asChild`): the passed element is
    // rendered AS the trigger, with children inside it.
    DropdownMenuTrigger: ({ children, render: renderEl }) => (
      <div data-testid="dm-trigger">
        {renderEl ? cloneElement(renderEl, {}, children) : children}
      </div>
    ),
    DropdownMenuContent: ({ children }) => <div data-testid="dm-content">{children}</div>,
    DropdownMenuItem: ({ children, onSelect, ...props }) => (
      <button type="button" onClick={onSelect} {...props}>
        {children}
      </button>
    ),
  };
});

import { SocietySwitcherDropdown } from "../../components/dashboard/SocietySwitcherDropdown";

describe("SocietySwitcherDropdown (web)", () => {
  it("renders societyName as static text when memberships.length === 1", () => {
    render(
      <SocietySwitcherDropdown
        memberships={[{ society_id: "s-1", society_name: "Lotus" }]}
        activeSocietyId="s-1"
      />,
    );
    expect(screen.getByTestId("society-static").textContent).toBe("Lotus");
  });

  it("renders trigger button when memberships.length > 1", () => {
    render(
      <SocietySwitcherDropdown
        memberships={[
          { society_id: "s-1", society_name: "Lotus" },
          { society_id: "s-2", society_name: "Green Valley" },
        ]}
        activeSocietyId="s-1"
      />,
    );
    expect(screen.getByLabelText(/Switch society/i)).toBeInTheDocument();
  });

  it("lists both memberships in content", () => {
    render(
      <SocietySwitcherDropdown
        memberships={[
          { society_id: "s-1", society_name: "Lotus" },
          { society_id: "s-2", society_name: "Green Valley" },
        ]}
        activeSocietyId="s-1"
      />,
    );
    // Scope to the dropdown content — the trigger also echoes the active name
    // ("Lotus"), so an unscoped getByText would match two nodes.
    const content = within(screen.getByTestId("dm-content"));
    expect(content.getByText("Lotus")).toBeInTheDocument();
    expect(content.getByText("Green Valley")).toBeInTheDocument();
  });

  it("calls onSelect for inactive society", () => {
    const onSelect = vi.fn();
    render(
      <SocietySwitcherDropdown
        memberships={[
          { society_id: "s-1", society_name: "Lotus" },
          { society_id: "s-2", society_name: "Green Valley" },
        ]}
        activeSocietyId="s-1"
        onSelect={onSelect}
      />,
    );
    const content = within(screen.getByTestId("dm-content"));
    fireEvent.click(content.getByText("Green Valley"));
    expect(onSelect).toHaveBeenCalledWith("s-2");
  });

  it("does NOT call onSelect for the active society", () => {
    const onSelect = vi.fn();
    render(
      <SocietySwitcherDropdown
        memberships={[
          { society_id: "s-1", society_name: "Lotus" },
          { society_id: "s-2", society_name: "Green Valley" },
        ]}
        activeSocietyId="s-1"
        onSelect={onSelect}
      />,
    );
    // Click the active-society ROW inside the dropdown content (the trigger also
    // echoes "Lotus", so scope to the content to click the menu item).
    const content = within(screen.getByTestId("dm-content"));
    fireEvent.click(content.getByText("Lotus"));
    expect(onSelect).not.toHaveBeenCalled();
  });
});
