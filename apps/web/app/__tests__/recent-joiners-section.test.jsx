// apps/web/app/__tests__/recent-joiners-section.test.jsx
// D-03 — RecentJoinersSection on the Member Directory page (web mirror).
//
// fetchRecentJoiners returns the embedded shape
//   { id, user_id, joined_at, profiles: { full_name }, flats: { number, wings: { name } } }
// (packages/api-client/src/society.js). The component derives
//   name = profiles.full_name, flat = `${wing}-${number}`.

import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const fetchRecentJoiners = vi.fn();
vi.mock("@parisar/api-client", () => ({
  fetchRecentJoiners: (...a) => fetchRecentJoiners(...a),
  // Phase 7 Plan 07-09 (WR-03) — avatar.js now imports `graphemes` from the
  // shared package. Provide a real implementation so initials/getAvatarColor
  // can iterate the name strings inside the component tree under test.
  graphemes: (str) => (str == null ? [] : Array.from(String(str))),
}));
vi.mock("@/lib/supabase/client", () => ({
  createSupabaseBrowserClient: () => ({}),
}));

import { RecentJoinersSection } from "../../components/directory/RecentJoinersSection";

function joiner(id, full_name, wing, number, daysAgo) {
  return {
    id,
    user_id: id,
    joined_at: new Date(Date.now() - daysAgo * 86400000).toISOString(),
    profiles: { full_name },
    flats: { number, wings: { name: wing } },
  };
}

describe("RecentJoinersSection (web)", () => {
  beforeEach(() => {
    fetchRecentJoiners.mockReset();
  });

  it("RJ-W1: renders joiner rows when API returns data", async () => {
    fetchRecentJoiners.mockResolvedValue([joiner("u1", "Aman Khan", "B", "203", 1)]);
    render(<RecentJoinersSection societyId="soc-1" />);
    await waitFor(() => expect(screen.getByText("Aman Khan")).toBeInTheDocument());
    expect(screen.getByText("Recently joined")).toBeInTheDocument();
  });

  it("RJ-W2: shows flat label + relative-time-ago", async () => {
    fetchRecentJoiners.mockResolvedValue([joiner("u1", "Aman Khan", "B", "203", 2)]);
    render(<RecentJoinersSection societyId="soc-1" />);
    await waitFor(() => expect(screen.getByText(/B-203/)).toBeInTheDocument());
    expect(screen.getByText(/ago/)).toBeInTheDocument();
  });

  it("RJ-W3: renders nothing when API returns empty array", async () => {
    fetchRecentJoiners.mockResolvedValue([]);
    render(<RecentJoinersSection societyId="soc-1" />);
    await waitFor(() => expect(fetchRecentJoiners).toHaveBeenCalled());
    expect(screen.queryByText("Recently joined")).toBeNull();
  });

  it("RJ-W4: renders nothing on fetch rejection (silent)", async () => {
    fetchRecentJoiners.mockRejectedValue(new Error("net"));
    render(<RecentJoinersSection societyId="soc-1" />);
    await waitFor(() => expect(fetchRecentJoiners).toHaveBeenCalled());
    expect(screen.queryByText("Recently joined")).toBeNull();
  });

  it("does not fetch when societyId is undefined", () => {
    render(<RecentJoinersSection societyId={undefined} />);
    expect(fetchRecentJoiners).not.toHaveBeenCalled();
  });
});
