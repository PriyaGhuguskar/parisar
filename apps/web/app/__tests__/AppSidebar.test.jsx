/**
 * Unit tests for apps/web/components/AppSidebar.jsx
 * — Phase 04.1 (Wave 2 base, Wave 3 / Plan 04 fills the header + footer).
 *
 * Verifies the project-specific Sidebar composition:
 *   1. Renders 3 nav items with hrefs /dashboard, /my-complaints, /profile
 *   2. usePathname() drives the active state on menu buttons
 *   3. Active item carries aria-current='page'; inactive does not
 *   4. Header hosts the SocietySwitcherDropdown; footer hosts the ProfileMenuDropdown
 *      (Wave 3 replaced the Wave 2 stubs).
 *
 * The shadcn primitives + the two dropdown children are mocked so the test does
 * not depend on CSS-variable theming or the base-ui Menu positioner.
 *
 * JavaScript only — no TypeScript per CLAUDE.md.
 */

import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  usePathname: () => "/dashboard",
}));

// Provide minimal mocks for shadcn primitives so the test does not depend on
// CSS-variable theming.
// NOTE: vi.mock factories are hoisted above imports, so React is imported
// INSIDE the factory rather than at module top level.
vi.mock("../../components/ui/sidebar", async () => {
  const { cloneElement } = await import("react");
  return {
    Sidebar: ({ children }) => <aside data-testid="sidebar">{children}</aside>,
    SidebarHeader: ({ children }) => <div data-testid="sidebar-header">{children}</div>,
    SidebarContent: ({ children }) => <div data-testid="sidebar-content">{children}</div>,
    SidebarFooter: ({ children }) => <div data-testid="sidebar-footer">{children}</div>,
    SidebarMenu: ({ children }) => <ul>{children}</ul>,
    SidebarMenuItem: ({ children }) => <li>{children}</li>,
    // Models @base-ui/react's `render` contract (this project's shadcn layer is
    // base-ui, NOT Radix): the caller passes the element to render AS the button,
    // and `children` go inside it. The previous mock assumed Radix's `asChild`
    // (link arriving via children) — which is precisely why the real sidebar
    // rendered an unstyled <button> with a stray `asChild` DOM prop.
    SidebarMenuButton: ({ children, isActive, render: renderEl }) =>
      renderEl ? (
        cloneElement(renderEl, { "data-active": isActive ? "true" : "false" }, children)
      ) : (
        <span data-active={isActive ? "true" : "false"}>{children}</span>
      ),
  };
});

// Mock the two dropdown children — their own behavior is covered by
// society-switcher.test.jsx / profile-menu.test.jsx. Here we only assert the
// sidebar wires them into the header / footer slots.
vi.mock("../../components/dashboard/SocietySwitcherDropdown", () => ({
  SocietySwitcherDropdown: () => <div data-testid="society-switcher-dropdown" />,
}));
vi.mock("../../components/dashboard/ProfileMenuDropdown", () => ({
  ProfileMenuDropdown: () => <div data-testid="profile-menu-dropdown" />,
}));

import { AppSidebar } from "../../components/AppSidebar";

// Phase 7 Plan 07-06: literal English assertions resolved via the global
// react-i18next mock in vitest.setup.js (which reads the actual en/dashboard.json
// shard). Direct JSON import removed to satisfy check-no-direct-locale-import.
const en = {
  nav: { home: "Home", myComplaints: "My Complaints", profile: "Profile" },
};

const PROPS = {
  userId: "u-1",
  societyId: "s-1",
  societyName: "Lotus Heights",
  role: "member",
  fullName: "Aman Khan",
  memberships: [{ society_id: "s-1", society_name: "Lotus Heights" }],
};

describe("AppSidebar", () => {
  it("renders 3 nav items with hrefs /dashboard, /my-complaints, /profile", () => {
    render(<AppSidebar {...PROPS} />);
    expect(screen.getByText(en.nav.home).closest("a").getAttribute("href")).toBe("/dashboard");
    expect(screen.getByText(en.nav.myComplaints).closest("a").getAttribute("href")).toBe(
      "/my-complaints",
    );
    expect(screen.getByText(en.nav.profile).closest("a").getAttribute("href")).toBe("/profile");
  });

  it("Home is active when pathname is /dashboard (verified by data-active)", () => {
    render(<AppSidebar {...PROPS} />);
    const homeLink = screen.getByText(en.nav.home).closest("[data-active]");
    expect(homeLink.getAttribute("data-active")).toBe("true");
  });

  it("Profile is not active when pathname is /dashboard", () => {
    render(<AppSidebar {...PROPS} />);
    const profileLink = screen.getByText(en.nav.profile).closest("[data-active]");
    expect(profileLink.getAttribute("data-active")).toBe("false");
  });

  it("active link has aria-current='page'", () => {
    render(<AppSidebar {...PROPS} />);
    const homeLink = screen.getByText(en.nav.home).closest("a");
    expect(homeLink.getAttribute("aria-current")).toBe("page");
  });

  it("non-active link does NOT have aria-current", () => {
    render(<AppSidebar {...PROPS} />);
    const profileLink = screen.getByText(en.nav.profile).closest("a");
    expect(profileLink.getAttribute("aria-current")).toBeNull();
  });

  it("header hosts the SocietySwitcherDropdown and footer the ProfileMenuDropdown", () => {
    render(<AppSidebar {...PROPS} />);
    expect(screen.getByTestId("society-switcher-dropdown")).toBeInTheDocument();
    expect(screen.getByTestId("profile-menu-dropdown")).toBeInTheDocument();
  });
});
