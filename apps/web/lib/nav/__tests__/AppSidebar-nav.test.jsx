// AppSidebar navigation by role and by the society's switched-on features.
// The sidebar primitives and dropdowns are stubbed (covered by AppSidebar.test.jsx).
// JavaScript only — no TypeScript per CLAUDE.md.

import { fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const features = vi.hoisted(() => ({ value: null }));

vi.mock("next/navigation", () => ({
  usePathname: () => "/residents/tenants",
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));
vi.mock("@/lib/supabase/client", () => ({
  createSupabaseBrowserClient: () => ({ auth: { refreshSession: vi.fn() } }),
}));
vi.mock("../../supabase/client", () => ({
  createSupabaseBrowserClient: () => ({ auth: { refreshSession: vi.fn() } }),
}));
vi.mock("../useSocietyFeatures", () => ({ useSocietyFeatures: () => features.value }));
vi.mock("../../../components/ui/sidebar", async () => {
  const { cloneElement } = await import("react");
  return {
    Sidebar: ({ children }) => <aside>{children}</aside>,
    SidebarHeader: ({ children }) => <div>{children}</div>,
    SidebarContent: ({ children }) => <div>{children}</div>,
    SidebarFooter: ({ children }) => <div>{children}</div>,
    SidebarMenu: ({ children }) => <ul>{children}</ul>,
    SidebarMenuItem: ({ children }) => <li>{children}</li>,
    SidebarMenuButton: ({ children, render: el }) => cloneElement(el, {}, children),
  };
});
vi.mock("../../../components/dashboard/SocietySwitcherDropdown", () => ({
  SocietySwitcherDropdown: () => null,
}));
vi.mock("../../../components/dashboard/ProfileMenuDropdown", () => ({
  ProfileMenuDropdown: () => null,
}));
vi.mock("../../../components/sos/SosButton", () => ({ SosButton: () => null }));

import { AppSidebar } from "../../../components/AppSidebar";
import { featureChecker } from "../sidebarNav";

const PROPS = { userId: "u1", societyId: "s1", fullName: "Asha", memberships: [] };
// `role` is the membership role prop, passed by spread (not an ARIA role).
const as = (role) => ({ ...PROPS, role });
const ready = (keys) => ({
  status: "ready",
  isEnabled: featureChecker(new Set(keys)),
  retry: vi.fn(),
});
const ALL = [
  "notices",
  "complaints",
  "sos",
  "polls",
  "community",
  "directory",
  "visitors",
  "staff_directory",
  "bookings",
  "facility_calendar",
  "flat_actions",
];

beforeEach(() => {
  features.value = ready(ALL);
});

describe("AppSidebar navigation", () => {
  it("gives an authority the Society Admin groups with real routes", () => {
    render(<AppSidebar {...as("secretary")} />);
    const nav = screen.getByRole("navigation", { name: "Main navigation" });
    for (const group of [
      "Society",
      "Residents",
      "Security",
      "Services",
      "Communication",
      "Settings",
    ]) {
      expect(within(nav).getByRole("heading", { name: group })).toBeInTheDocument();
    }
    expect(within(nav).queryByRole("heading", { name: /Finance|Documents|Reports/ })).toBeNull();
    expect(screen.getByRole("link", { name: "Society Dashboard" })).toHaveAttribute(
      "href",
      "/society-dashboard",
    );
    expect(screen.getByRole("link", { name: "Import residents" })).toHaveAttribute(
      "href",
      "/import",
    );
  });

  it("marks the current page", () => {
    render(<AppSidebar {...as("secretary")} />);
    expect(screen.getByRole("link", { name: "Tenants" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "Owners" })).not.toHaveAttribute("aria-current");
  });

  it("hides switched-off modules", () => {
    features.value = ready(["notices", "complaints", "sos"]);
    render(<AppSidebar {...as("secretary")} />);
    expect(screen.queryByRole("link", { name: "Polls" })).toBeNull();
    expect(screen.queryByRole("link", { name: "Staff management" })).toBeNull();
    expect(screen.queryByRole("heading", { name: "Security" })).toBeNull();
    expect(screen.getByRole("link", { name: "Notices" })).toBeInTheDocument();
  });

  it("shows residents only resident items", () => {
    render(<AppSidebar {...as("member")} />);
    expect(screen.queryByRole("link", { name: "Society Dashboard" })).toBeNull();
    expect(screen.queryByRole("link", { name: "Owners" })).toBeNull();
    expect(screen.getByRole("link", { name: "My Complaints" })).toBeInTheDocument();
  });

  it("offers a retry when the feature list failed", () => {
    const retry = vi.fn();
    features.value = { status: "error", isEnabled: featureChecker(null), retry };
    render(<AppSidebar {...as("secretary")} />);
    expect(screen.getByText("Some menu items could not load.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(retry).toHaveBeenCalled();
  });
});
