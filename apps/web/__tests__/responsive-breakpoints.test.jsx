// apps/web/__tests__/responsive-breakpoints.test.jsx
// Phase 7 — Plan 07-10 Task 1 (WEB-02 automated sanity floor).
//
// JSDOM cannot truly evaluate Tailwind responsive utilities (no real CSS engine
// + no real viewport-based media-query resolution). What it CAN do is render
// each component and assert that the responsive utility CLASSES are present on
// the rendered DOM. The deep visual audit lives in 07-HUMAN-UAT.md (phone /
// tablet / desktop × en / hi / mr × every screen).
//
// Behaviours under test (per 07-10-PLAN.md must_haves):
//   1. DashboardTile carries `aspect-square` + bottom-pin flex classes so the
//      grid keeps a stable visual rhythm at every viewport.
//   2. DashboardTilePreview row text carries `line-clamp-1` (Devanagari
//      truncation safety — the analogue of mobile's numberOfLines={1}).
//   3. LanguageSelector dialog content caps at `max-w-[360px]` (UI-SPEC §Screen 4
//      Web) so phone widths don't render a stretched modal.
//   4. AppSidebar uses `collapsible="offcanvas"` so the sidebar collapses to an
//      offcanvas drawer below the tablet breakpoint (UI-SPEC §Screen 6 audit
//      criterion #4).
//
// Test-runner notes:
//   - Uses the global apps/web/vitest.setup.js mock of react-i18next (Plan
//     07-06) so `useTranslation('<ns>')` resolves keys against the actual
//     English JSON shards. No per-test wrapping needed.
//   - shadcn Dialog's Portal renders into document.body — we query the document
//     instead of the render container for max-width assertions.

import { render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

// Stub usePathname so AppSidebar's "active route" logic doesn't blow up.
vi.mock("next/navigation", () => ({
  usePathname: () => "/dashboard",
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn(), back: vi.fn() }),
}));

// Mock shadcn sidebar primitives to forward the `collapsible` prop as a
// data attribute we can grep for. The real shadcn Sidebar only writes
// `data-collapsible` AFTER collapse — in JSDOM (default expanded state) the
// attribute is empty string, so we mock the primitive to forward the prop
// value directly. The AppSidebar test (apps/web/app/__tests__/AppSidebar.test.jsx)
// uses the same pattern.
vi.mock("../components/ui/sidebar", () => ({
  Sidebar: ({ children, collapsible }) => (
    <aside data-testid="sidebar" data-collapsible-prop={collapsible}>
      {children}
    </aside>
  ),
  SidebarHeader: ({ children }) => <div>{children}</div>,
  SidebarContent: ({ children }) => <div>{children}</div>,
  SidebarFooter: ({ children }) => <div>{children}</div>,
  SidebarMenu: ({ children }) => <ul>{children}</ul>,
  SidebarMenuItem: ({ children }) => <li>{children}</li>,
  SidebarMenuButton: ({ children }) => <span>{children}</span>,
}));

// Mock the two dropdown children — their own behavior is covered by
// society-switcher.test.jsx / profile-menu.test.jsx. Without these mocks the
// ProfileMenuDropdown would try to call createSupabaseBrowserClient() which
// requires NEXT_PUBLIC_SUPABASE_* env vars that the test env doesn't set.
vi.mock("../components/dashboard/SocietySwitcherDropdown", () => ({
  SocietySwitcherDropdown: () => <div data-testid="society-switcher" />,
}));
vi.mock("../components/dashboard/ProfileMenuDropdown", () => ({
  ProfileMenuDropdown: () => <div data-testid="profile-menu" />,
}));

import { AppSidebar } from "../components/AppSidebar";
import { DashboardTile } from "../components/dashboard/DashboardTile";
import { DashboardTilePreview } from "../components/dashboard/DashboardTilePreview";
import { LanguageSelector } from "../components/profile/LanguageSelector";

// A minimal lucide-react icon stub for the tile.
function StubIcon({ size = 24, color = "#000" }) {
  return <svg width={size} height={size} data-testid="stub-icon" data-color={color} />;
}

describe("responsive breakpoints — automated class-presence floor", () => {
  // -------------------------------------------------------------------------
  // 1. DashboardTile keeps its aspect-square + bottom-pinned flex layout
  //    across every breakpoint. The grid container uses
  //    `grid-cols-2 md:grid-cols-3 lg:grid-cols-4` (DashboardClient); each
  //    individual tile MUST stay square-shaped + keep the label pinned to the
  //    bottom so the visual rhythm survives the 2/3/4-column collapse.
  // -------------------------------------------------------------------------
  it("DashboardTile root has aspect-square + flex-col so 2/3/4-col grid stays balanced", () => {
    const { container } = render(
      <DashboardTile icon={StubIcon} label="Complaints" onPress={() => {}} />,
    );
    const button = container.querySelector("button");
    expect(button).not.toBeNull();
    expect(button.className).toContain("aspect-square");
    expect(button.className).toContain("flex");
    expect(button.className).toContain("flex-col");
    // The label sits in an `mt-auto` block so it stays pinned to the bottom of
    // the tile regardless of icon-row height variance.
    expect(container.querySelector(".mt-auto")).not.toBeNull();
  });

  it("DashboardTile label uses line-clamp-2 so long Devanagari labels survive narrow phone tiles", () => {
    const { container } = render(
      <DashboardTile icon={StubIcon} label="कोड रोटेशन" onPress={() => {}} />,
    );
    expect(container.querySelector(".line-clamp-2")).not.toBeNull();
  });

  // -------------------------------------------------------------------------
  // 2. DashboardTilePreview row text is clamped to a single line so Devanagari
  //    conjunct stacks (e.g. "नई शिकायत: रिसता नल") truncate cleanly instead
  //    of wrapping and breaking the aspect-square grid.
  // -------------------------------------------------------------------------
  it("DashboardTilePreview preview row carries line-clamp-1 (Devanagari truncation safety)", () => {
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

  it("DashboardTilePreview empty-state line carries line-clamp-1 too", () => {
    const { getByText } = render(
      <DashboardTilePreview
        status="ready"
        tileKey="myComplaints"
        tile={{ count: 0, previews: [] }}
      />,
    );
    expect(getByText("All clear").className).toContain("line-clamp-1");
  });

  // -------------------------------------------------------------------------
  // 3. LanguageSelector caps the dialog content at max-w-[360px] so phone
  //    width (375px) doesn't render the modal full-width and tablet/desktop
  //    don't stretch the 3-option selector across the page. UI-SPEC §Screen 4
  //    Web "Language Selector modal max-width (web) | 360px".
  // -------------------------------------------------------------------------
  it("LanguageSelector dialog content has max-w-[360px] (UI-SPEC §Screen 4 Web)", () => {
    render(<LanguageSelector open={true} onOpenChange={() => {}} />);
    // shadcn Dialog portals into document.body, not the render container.
    // Find the DialogContent via its role + the max-w class.
    const dialog = document.querySelector(".max-w-\\[360px\\]");
    expect(dialog).not.toBeNull();
  });

  // -------------------------------------------------------------------------
  // 4. AppSidebar uses collapsible="offcanvas" so the sidebar collapses to an
  //    offcanvas drawer on phone/tablet widths instead of squashing the main
  //    pane. UI-SPEC §Screen 6 audit criterion #4 ("Sidebar collapses to
  //    offcanvas below 768px").
  // -------------------------------------------------------------------------
  it("AppSidebar uses collapsible='offcanvas' so it drawer-collapses below tablet width", () => {
    const { container } = render(
      <AppSidebar userId="u1" societyId="s1" role="member" fullName="Test User" memberships={[]} />,
    );
    // The mocked shadcn Sidebar (above) forwards the `collapsible` prop as a
    // data attribute so the test can assert AppSidebar passes the right value.
    const sidebar = container.querySelector("[data-collapsible-prop='offcanvas']");
    expect(sidebar).not.toBeNull();
  });
});
