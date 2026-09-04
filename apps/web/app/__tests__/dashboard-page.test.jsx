/**
 * Unit tests for apps/web/app/(protected)/dashboard/DashboardClient.jsx
 * — Phase 04.1 Wave 2, Plan 03, Task 2.
 *
 * The /dashboard route is now a Server Component shell (page.jsx) that SSR-fetches
 * role + society identity + memberships and hands off to this client card grid.
 * The Server Component is not unit-tested here (it requires the Next.js request
 * context + a live Supabase client); its data-fetch contract is exercised by the
 * grep acceptance checks in the plan. This file covers the client surface:
 *
 *   1. Renders SocietyHeaderPill with the provided society name.
 *   2. role='member' → at least 9 tile buttons (3 live + 6 placeholders).
 *   3. role='secretary' → at least 11 tile buttons (5 live + 6 placeholders).
 *   4. Reviews tile badge hydrates from fetchPendingReviews().length.
 *   5. Tile grid uses grid-cols-2 md:grid-cols-3 lg:grid-cols-4.
 *   6. Tapping a live tile calls router.push.
 *   7. Tapping a placeholder tile does NOT navigate.
 *   8. Avatar shows initials from fullName.
 *
 * JavaScript only — no TypeScript per CLAUDE.md.
 */

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockPush = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush }),
}));

const fetchPendingReviews = vi.fn();
const mockGetDashboardSummary = vi.fn();
vi.mock("@parisar/api-client", () => ({
  fetchPendingReviews: (...a) => fetchPendingReviews(...a),
  fetchJoinPercent: vi.fn().mockResolvedValue(null),
  // Phase 7 Plan 07-08 — DashboardClient now transitively imports
  // getDashboardSummary via the Zustand store's fetchSummary action. Default
  // mock resolves to null so the store's status stays "ready" (after seed) or
  // transitions through loading->ready without surface to assert against here
  // (the new Plan 07-08 surface is covered by web-dashboard-summary-store.test.js
  // + web-dashboard-tile-preview.test.jsx).
  getDashboardSummary: (...a) => mockGetDashboardSummary(...a),
  // Phase 7 Plan 07-09 (WR-03) — ProfileMenuDropdown transitively imports
  // @/lib/avatar which now consumes the shared graphemes helper. Provide a
  // real Array.from implementation so getAvatarColor/initials don't crash on
  // an undefined named import inside the mocked package.
  graphemes: (str) => (str == null ? [] : Array.from(String(str))),
}));

// DashboardClient now issues a direct society_codes query for the D-05
// code-rotation badge: supabase.from(...).select().eq().is().maybeSingle().
// Return a chainable thenable that resolves to { data: null } so rotatesAt
// stays null and no badge renders (graceful degradation — society_codes has no
// rotates_at column today). fetchPendingReviews is mocked separately above.
//
// Phase 7 Plan 07-08 — DashboardClient also calls supabase.channel() and
// supabase.removeChannel() via subscribeDashboardRealtime. Mock both so the
// useEffect that wires Realtime + window-focus reconciliation doesn't throw.
// The subscribe callback fires "SUBSCRIBED" once so the first-connect arm
// path runs but no reconnect fires (matches the mobile home-screen.test.jsx
// mock pattern from Plan 07-07 — Rule 3 blocking fix).
vi.mock("@/lib/supabase/client", () => {
  // The chain must cover EVERY builder method the mounted tree calls, not just
  // the ones the dashboard itself uses. HighlightsStrip (society_highlights +
  // facility_events) mounts inside this page and chains .order()/.gte()/.limit(),
  // which the original mock lacked — so those calls returned undefined and threw
  // inside a useEffect. The assertions still passed, but vitest counted 18
  // unhandled rejections and failed the run. Missing links here are silent until
  // they are not, so the safe shape is "every builder method returns the chain".
  const query = {
    select: () => query,
    eq: () => query,
    neq: () => query,
    is: () => query,
    in: () => query,
    gt: () => query,
    gte: () => query,
    lt: () => query,
    lte: () => query,
    like: () => query,
    ilike: () => query,
    filter: () => query,
    match: () => query,
    order: () => query,
    limit: () => query,
    range: () => query,
    single: () => query,
    maybeSingle: () => query,
    then: (resolve) => {
      resolve({ data: null, error: null });
      return query;
    },
    catch: () => query,
  };
  const channel = {
    on: () => channel,
    subscribe: (cb) => {
      try {
        cb?.("SUBSCRIBED");
      } catch {
        // ignore — first-connect arm path is fire-and-forget in the helper.
      }
      return channel;
    },
  };
  return {
    createSupabaseBrowserClient: () => ({
      from: () => query,
      channel: () => channel,
      removeChannel: () => ({}),
    }),
  };
});

// The heading-row avatar is now the ProfileMenuDropdown trigger (DT-08). Keep
// the real component (its own behavior is covered by profile-menu.test.jsx) but
// stub the server-action + flat-label dependencies it pulls in.
vi.mock("@/app/actions/auth", () => ({ signOutAction: vi.fn() }));
vi.mock("@/lib/flat-label", () => ({ fetchFlatLabel: vi.fn().mockResolvedValue("—") }));

import { useDashboardSummary } from "@/lib/dashboard-summary-store";
import { DashboardClient } from "../(protected)/dashboard/DashboardClient";

describe("DashboardClient (web)", () => {
  beforeEach(() => {
    mockPush.mockReset();
    fetchPendingReviews.mockReset();
    fetchPendingReviews.mockResolvedValue([]);
    // Phase 7 Plan 07-08 — reset the Zustand dashboard-summary store between
    // tests so a fast-resolving mock from one test (e.g. summary="ready" with
    // previews) doesn't leak into the next test that expects clean state.
    mockGetDashboardSummary.mockReset();
    mockGetDashboardSummary.mockResolvedValue(null);
    useDashboardSummary.getState().reset();
  });

  it("renders SocietyHeaderPill with society name", () => {
    render(
      <DashboardClient
        userId="u1"
        role="member"
        societyId="soc-1"
        societyName="Lotus Heights"
        fullName="Aman Khan"
        memberships={[]}
      />,
    );
    expect(screen.getByText("Lotus Heights")).toBeInTheDocument();
  });

  it("member role renders at least 9 tile buttons", () => {
    render(
      <DashboardClient
        userId="u1"
        role="member"
        societyId="soc-1"
        societyName="X"
        fullName="Y"
        memberships={[]}
      />,
    );
    const tiles = screen.getAllByRole("button");
    // 9 tiles + 1 avatar
    expect(tiles.length).toBeGreaterThanOrEqual(9);
  });

  it("secretary role renders at least 11 tile buttons", () => {
    render(
      <DashboardClient
        userId="u1"
        role="secretary"
        societyId="soc-1"
        societyName="X"
        fullName="Y"
        memberships={[]}
      />,
    );
    const tiles = screen.getAllByRole("button");
    expect(tiles.length).toBeGreaterThanOrEqual(11);
  });

  it("Reviews tile shows the pendingCount from fetchPendingReviews", async () => {
    fetchPendingReviews.mockResolvedValue([{}, {}, {}, {}]); // 4 pending
    render(
      <DashboardClient
        userId="u1"
        role="secretary"
        societyId="soc-1"
        societyName="X"
        fullName="Y"
        memberships={[]}
      />,
    );
    await waitFor(() => expect(screen.getByText("4")).toBeInTheDocument());
  });

  it("tile grid has responsive Tailwind classes grid-cols-2 md:grid-cols-3 lg:grid-cols-4", () => {
    const { container } = render(
      <DashboardClient
        userId="u1"
        role="member"
        societyId="soc-1"
        societyName="X"
        fullName="Y"
        memberships={[]}
      />,
    );
    const grid = container.querySelector(".grid");
    expect(grid.className).toMatch(/grid-cols-2/);
    expect(grid.className).toMatch(/md:grid-cols-3/);
    expect(grid.className).toMatch(/lg:grid-cols-4/);
  });

  it("tapping a live tile calls router.push with its route", () => {
    render(
      <DashboardClient
        userId="u1"
        role="member"
        societyId="soc-1"
        societyName="X"
        fullName="Y"
        memberships={[]}
      />,
    );
    // Directory tile should be present and live.
    const dir = screen.getByRole("button", { name: "Member Directory" });
    fireEvent.click(dir);
    expect(mockPush).toHaveBeenCalled();
  });

  it("tapping the now-live Notices tile (DT-02) navigates to /notices", () => {
    render(
      <DashboardClient
        userId="u1"
        role="member"
        societyId="soc-1"
        societyName="X"
        fullName="Y"
        memberships={[]}
      />,
    );
    // Phase 5 DT-02: Notices is live → clicking navigates to /notices.
    const notices = screen.getByRole("button", { name: /^Notices$/ });
    fireEvent.click(notices);
    expect(mockPush).toHaveBeenCalledWith("/notices");
  });

  it("tapping the live Community tile (Phase 6 DT-02) navigates to /community", () => {
    render(
      <DashboardClient
        userId="u1"
        role="member"
        societyId="soc-1"
        societyName="X"
        fullName="Y"
        memberships={[]}
      />,
    );
    // Phase 6 DT-02: Community is live for all roles → clicking navigates to /community.
    const community = screen.getByRole("button", { name: /^Community$/ });
    fireEvent.click(community);
    expect(mockPush).toHaveBeenCalledWith("/community");
  });

  it("heading-row profile trigger (DT-08) shows initials from fullName", () => {
    render(
      <DashboardClient
        userId="u1"
        role="member"
        societyId="soc-1"
        societyName="X"
        fullName="Aman Khan"
        memberships={[]}
      />,
    );
    // The avatar is now the ProfileMenuDropdown's default trigger (DT-08 second
    // entry point); its initials still derive from fullName.
    expect(screen.getByTestId("profile-menu-trigger")).toHaveTextContent("AK");
  });
});
