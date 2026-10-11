// apps/mobile/__tests__/recent-joiners-section.test.jsx
// D-03 — RecentJoinersSection on the Member Directory screen (mobile).
//
// The api-client fetchRecentJoiners returns the EMBEDDED shape
//   { id, user_id, joined_at, profiles: { full_name }, flats: { number, wings: { name } } }
// (verified in packages/api-client/src/society.js line 331), NOT the flat
// { user_id, full_name, flat_label, joined_at } the plan assumed. The component
// adapts: name = profiles.full_name, flat = `${wing}-${number}`.

import { render, waitFor } from "@testing-library/react-native";

jest.mock("@parisar/api-client", () => ({
  fetchRecentJoiners: jest.fn(),
  // Phase 7 Plan 07-09 (WR-03) — avatar.js now imports `graphemes` from the
  // shared package. Provide a real implementation so initials/getAvatarColor
  // can iterate the name strings inside the component tree under test.
  graphemes: (str) => (str == null ? [] : Array.from(String(str))),
}));
jest.mock("../lib/supabase", () => ({ getSupabase: () => ({}) }));

import { fetchRecentJoiners } from "@parisar/api-client";
import { RecentJoinersSection } from "../components/directory/RecentJoinersSection";

function joiner(id, full_name, wing, number, daysAgo) {
  return {
    id,
    user_id: id,
    joined_at: new Date(Date.now() - daysAgo * 86400000).toISOString(),
    profiles: { full_name },
    flats: { number, wings: { name: wing } },
  };
}

describe("RecentJoinersSection (mobile)", () => {
  beforeEach(() => {
    fetchRecentJoiners.mockReset();
  });

  it("RJ-M1: renders 5 joiner rows when API returns 5", async () => {
    fetchRecentJoiners.mockResolvedValue([
      joiner("u1", "Aman Khan", "B", "203", 2),
      joiner("u2", "Sonia Mehra", "A", "101", 5),
      joiner("u3", "Rahul Verma", "C", "302", 7),
      joiner("u4", "Priya Singh", "B", "105", 10),
      joiner("u5", "Amit Joshi", "A", "201", 14),
    ]);
    const { findByText } = render(<RecentJoinersSection societyId="soc-1" />);
    expect(await findByText("Recently joined")).toBeTruthy();
    expect(await findByText("Aman Khan")).toBeTruthy();
    expect(await findByText("Amit Joshi")).toBeTruthy();
  });

  it("RJ-M2/RJ-M6: shows flat label + relative-time-ago in the secondary line", async () => {
    fetchRecentJoiners.mockResolvedValue([joiner("u1", "Aman Khan", "B", "203", 2)]);
    const { findByText } = render(<RecentJoinersSection societyId="soc-1" />);
    // flat label "B-203" and a relative-time suffix ("· 2 days ago" / "ago")
    expect(await findByText(/B-203/)).toBeTruthy();
    expect(await findByText(/ago/)).toBeTruthy();
  });

  it("RJ-M3: renders nothing (no header) when API returns empty array", async () => {
    fetchRecentJoiners.mockResolvedValue([]);
    const { queryByText } = render(<RecentJoinersSection societyId="soc-1" />);
    await waitFor(() => expect(fetchRecentJoiners).toHaveBeenCalled());
    expect(queryByText("Recently joined")).toBeNull();
  });

  it("RJ-M4: renders nothing when API rejects (silent failure per D-03)", async () => {
    fetchRecentJoiners.mockRejectedValue(new Error("network"));
    const { queryByText } = render(<RecentJoinersSection societyId="soc-1" />);
    await waitFor(() => expect(fetchRecentJoiners).toHaveBeenCalled());
    expect(queryByText("Recently joined")).toBeNull();
  });

  it("RJ-M5: avatar shows initials for each joiner (Wave 0 color cycle)", async () => {
    fetchRecentJoiners.mockResolvedValue([joiner("u1", "Aman Khan", "B", "203", 1)]);
    const { findByText } = render(<RecentJoinersSection societyId="soc-1" />);
    expect(await findByText("AK")).toBeTruthy();
  });

  it("does not fetch when societyId is undefined", () => {
    render(<RecentJoinersSection societyId={undefined} />);
    expect(fetchRecentJoiners).not.toHaveBeenCalled();
  });
});
