import { fireEvent, render } from "@testing-library/react-native";
import React from "react";

// Mocks
const mockPush = jest.fn();
jest.mock("expo-router", () => ({
  useRouter: () => ({ push: mockPush }),
  useFocusEffect: (cb) => {
    // Run callback once on mount to simulate first focus.
    const React = require("react");
    React.useEffect(() => {
      const cleanup = cb();
      return cleanup;
    }, []);
  },
}));

jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 24, bottom: 24, left: 0, right: 0 }),
}));

const mockFetchPendingReviews = jest.fn();
// Phase 7 Plan 07-07: HomeScreen now imports getDashboardSummary
// (via the dashboard-summary-store) — mock it to avoid live RPCs in tests.
const mockGetDashboardSummary = jest.fn().mockResolvedValue(null);
jest.mock("@parisar/api-client", () => ({
  fetchPendingReviews: (...args) => mockFetchPendingReviews(...args),
  fetchJoinPercent: jest.fn().mockResolvedValue(null),
  getDashboardSummary: (...args) => mockGetDashboardSummary(...args),
  // Phase 7 Plan 07-09 (WR-03) — ProfileMenuSheet transitively imports
  // ../lib/avatar which now consumes the shared graphemes helper. Provide a
  // real Array.from implementation so getAvatarColor/initials don't crash on
  // an undefined named import inside the mocked package.
  graphemes: (str) => (str == null ? [] : Array.from(String(str))),
}));

// getSupabase — the Home screen fetches society_memberships on focus (for the
// society switcher) AND society_codes.rotates_at (D-05 code-rotation badge).
// Plan 07-07 additionally opens a Realtime channel via supabase.channel().
// Provide a chainable query builder that supports both chains AND a no-op
// channel:
//   .select().eq().then()                       -> memberships ([] => no switcher)
//   .select().eq().is().maybeSingle().then()     -> society_codes (null => no badge)
//   .channel(name).on(...).subscribe(cb)         -> dashboard-realtime no-op
jest.mock("../lib/supabase", () => {
  const query = {
    select: () => query,
    eq: () => query,
    is: () => query,
    maybeSingle: () => query,
    // Terminal: memberships resolve to [], society_codes to { data: null }.
    // Both consumers tolerate either shape (data ?? [] / data?.rotates_at ?? null).
    // Return `query` so a trailing `.catch(...)` stays chainable (the real
    // PostgREST builder is a thenable; this mock approximates it).
    then: (resolve) => {
      resolve({ data: [], error: null });
      return query;
    },
    catch: () => query,
  };
  // Realtime channel stub — `.on()` chains, `.subscribe(cb)` invokes the
  // callback once with "SUBSCRIBED" so the first-connect path runs but we
  // never simulate a reconnect (armedOnce stays at first SUBSCRIBED).
  const channel = {
    on: () => channel,
    subscribe: (cb) => {
      if (typeof cb === "function") cb("SUBSCRIBED");
      return channel;
    },
  };
  return {
    getSupabase: () => ({
      from: () => query,
      channel: () => channel,
      removeChannel: () => {},
    }),
  };
});

// useAuthStore — controllable per test. Variable is prefixed with `mock` so
// Jest's mock-factory hoisting permits referencing it inside jest.mock().
let mockStoreState = { session: null, loading: true };
jest.mock("../lib/auth-store", () => ({
  useAuthStore: (selector) => selector(mockStoreState),
}));

import HomeScreen from "../app/(protected)/(tabs)/index";

function setSession({ role, societyId = "soc-1", fullName = "Aman Khan" }) {
  mockStoreState = {
    loading: false,
    session: {
      user: {
        id: "user-1",
        app_metadata: {
          society_id: societyId,
          society_name: "Lotus Heights",
          role,
          full_name: fullName,
        },
      },
    },
  };
}

describe("HomeScreen", () => {
  beforeEach(() => {
    mockPush.mockReset();
    mockFetchPendingReviews.mockReset();
    mockFetchPendingReviews.mockResolvedValue([]);
    // Phase 7 Plan 07-07: reset the dashboard-summary store between tests
    // so leaked state from one test doesn't trigger a previewNode render in
    // the next.
    mockGetDashboardSummary.mockReset();
    mockGetDashboardSummary.mockResolvedValue(null);
    const { useDashboardSummary } = require("../lib/dashboard-summary-store");
    useDashboardSummary.getState().reset();
    mockStoreState = { session: null, loading: true };
  });

  it("renders null while auth-store is loading", () => {
    const { toJSON } = render(<HomeScreen />);
    expect(toJSON()).toBeNull();
  });

  it("member role renders at least 8 tile/avatar buttons", async () => {
    setSession({ role: "member" });
    const { findAllByRole } = render(<HomeScreen />);
    const buttons = await findAllByRole("button");
    // member set = 9 tiles + 1 avatar
    expect(buttons.length).toBeGreaterThanOrEqual(8);
  });

  it("secretary role renders at least 11 tile/avatar buttons", async () => {
    setSession({ role: "secretary" });
    const { findAllByRole } = render(<HomeScreen />);
    const buttons = await findAllByRole("button");
    // secretary set = 11 tiles + 1 avatar
    expect(buttons.length).toBeGreaterThanOrEqual(11);
  });

  it("tapping live Member-Directory tile pushes its (tabs) route", async () => {
    setSession({ role: "member" });
    const { findByLabelText } = render(<HomeScreen />);
    const dirTile = await findByLabelText("Member Directory");
    fireEvent.press(dirTile);
    expect(mockPush).toHaveBeenCalledWith("/(protected)/(tabs)/directory");
  });

  it("tapping the now-live 'Notices' tile pushes its (tabs) route (DT-02)", async () => {
    setSession({ role: "member" });
    const { findByLabelText } = render(<HomeScreen />);
    // Post-DT-02 the Notices tile is live — its a11y label is the plain title
    // (no "Coming soon" suffix) and tapping navigates.
    const notices = await findByLabelText("Notices");
    fireEvent.press(notices);
    expect(mockPush).toHaveBeenCalledWith("/(protected)/(tabs)/notices");
  });

  it("tapping the now-live 'Bookings' tile pushes its (tabs) route (DT-02)", async () => {
    setSession({ role: "member" });
    const { findByLabelText } = render(<HomeScreen />);
    const bookings = await findByLabelText("Bookings");
    fireEvent.press(bookings);
    expect(mockPush).toHaveBeenCalledWith("/(protected)/(tabs)/bookings");
  });

  it("Reviews badge count reflects fetchPendingReviews result", async () => {
    setSession({ role: "secretary" });
    mockFetchPendingReviews.mockResolvedValue([{}, {}, {}]); // 3 pending
    const { findByText } = render(<HomeScreen />);
    expect(await findByText("3")).toBeTruthy();
  });

  it("renders SocietyHeaderPill with society name", async () => {
    setSession({ role: "member" });
    const { findByText } = render(<HomeScreen />);
    expect(await findByText("Lotus Heights")).toBeTruthy();
  });

  it("avatar shows initials from full_name", async () => {
    setSession({ role: "member", fullName: "Aman Khan" });
    const { findByText } = render(<HomeScreen />);
    expect(await findByText("AK")).toBeTruthy();
  });
});
