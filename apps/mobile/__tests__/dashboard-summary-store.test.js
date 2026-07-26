// Phase 7 — Plan 07-07 Task 1: Dashboard summary Zustand store tests.
//
// Behaviours under test (per 07-07-PLAN.md <behavior>):
//   1. Initial state: { summary: null, status: "idle", error: null }.
//   2. fetchSummary success → idle → loading → ready.
//   3. fetchSummary failure → status "error", error populated, summary unchanged.
//   4. patchEvent INSERT complaint, secretary view: count++, prepend preview,
//      cap at 2 entries (oldest drops). Threat T-07-27 reducer-safety.
//   5. patchEvent INSERT complaint, member view + author_id matches:
//      myComplaints.count++ (NOT complaints.count).
//   6. patchEvent INSERT complaint, member view + author_id mismatch: no change.
//   7. patchEvent INSERT booking, secretary view, status="pending": bookings.count++;
//      status != "pending" → no change.
//   8. patchEvent INSERT notification: notifications.count++ in both views.
//   9. patchEvent UPDATE post hidden_at set: drops matching preview from
//      community.previews (T-07-05 + threat T-07-27 safety).
//   10. reconcile: fetchSummary after a patch sequence replaces summary atomically.
//
// JavaScript only — no TypeScript per CLAUDE.md.

// Mock @parisar/api-client.getDashboardSummary so we can drive fetchSummary
// success/failure cases without needing a live Supabase. Capture the spy so
// individual tests can mock the next resolution.
const mockGetDashboardSummary = jest.fn();
jest.mock("@parisar/api-client", () => ({
  getDashboardSummary: (...args) => mockGetDashboardSummary(...args),
}));

import { DASHBOARD_TILE_KEYS, useDashboardSummary } from "../lib/dashboard-summary-store";

// Build a stable secretary-view summary fixture. The shape mirrors what
// @parisar/api-client normalize() returns.
function secretarySummary(overrides = {}) {
  return {
    role: "secretary",
    complaints: {
      count: 2,
      previews: [
        { id: "c-old-1", title: "leak A", flat: "A-101" },
        { id: "c-old-2", title: "leak B", flat: "A-102" },
      ],
    },
    bookings: {
      count: 1,
      previews: [{ id: "b-old-1", amenity: "Gym", slot: "Jul 01 10:00", flat: "A-101" }],
    },
    notifications: { count: 0, previews: [] },
    flatActions: { count: 0, previews: [] },
    myComplaints: { count: 0, previews: [] },
    myBookings: { count: 0, previews: [] },
    community: { count: 0, previews: [] },
    ...overrides,
  };
}

function memberSummary(overrides = {}) {
  return {
    role: "member",
    complaints: { count: 0, previews: [] },
    bookings: { count: 0, previews: [] },
    notifications: { count: 0, previews: [] },
    flatActions: { count: 0, previews: [] },
    myComplaints: {
      count: 1,
      previews: [{ id: "mc-old-1", title: "my old complaint", status: "open" }],
    },
    myBookings: { count: 0, previews: [] },
    community: {
      count: 2,
      previews: [
        { id: "p-old-1", author: "Aman", flat: "B-203", title: "old post 1" },
        { id: "p-old-2", author: "Riya", flat: "B-204", title: "old post 2" },
      ],
    },
    ...overrides,
  };
}

describe("dashboard-summary-store (Phase 7 Plan 07-07)", () => {
  beforeEach(() => {
    // Reset the store between tests — Zustand persists module-singleton state.
    useDashboardSummary.getState().reset();
    mockGetDashboardSummary.mockReset();
  });

  it("exports DASHBOARD_TILE_KEYS with all 7 tile-bucket keys", () => {
    // Sanity check: callers will iterate this list. The exact membership is
    // locked here so future refactors can't silently drop a key.
    expect(DASHBOARD_TILE_KEYS).toEqual(
      expect.arrayContaining([
        "complaints",
        "bookings",
        "notifications",
        "flatActions",
        "myComplaints",
        "myBookings",
        "community",
      ]),
    );
  });

  // -------------------------------------------------------------------------
  // Behaviour 1 — initial state
  // -------------------------------------------------------------------------
  it("initial state is { summary: null, status: 'idle', error: null }", () => {
    const s = useDashboardSummary.getState();
    expect(s.summary).toBeNull();
    expect(s.status).toBe("idle");
    expect(s.error).toBeNull();
  });

  // -------------------------------------------------------------------------
  // Behaviour 2 — fetchSummary success
  // -------------------------------------------------------------------------
  it("fetchSummary success transitions idle → loading → ready and stores the data", async () => {
    const fake = secretarySummary();
    mockGetDashboardSummary.mockResolvedValueOnce(fake);

    const fakeSupabase = {};
    const pending = useDashboardSummary.getState().fetchSummary(fakeSupabase);
    // While the promise is pending the status should be "loading".
    expect(useDashboardSummary.getState().status).toBe("loading");

    await pending;
    expect(useDashboardSummary.getState().status).toBe("ready");
    expect(useDashboardSummary.getState().summary).toEqual(fake);
    expect(useDashboardSummary.getState().error).toBeNull();
    expect(mockGetDashboardSummary).toHaveBeenCalledWith(fakeSupabase);
  });

  // -------------------------------------------------------------------------
  // Behaviour 3 — fetchSummary failure
  // -------------------------------------------------------------------------
  it("fetchSummary failure sets status 'error', populates error, leaves summary unchanged", async () => {
    // Seed summary first (so we can prove it doesn't get clobbered on failure).
    useDashboardSummary.getState().setSummary(secretarySummary());
    const before = useDashboardSummary.getState().summary;

    const err = new Error("AUTH_REQUIRED");
    mockGetDashboardSummary.mockRejectedValueOnce(err);

    await expect(useDashboardSummary.getState().fetchSummary({})).rejects.toThrow("AUTH_REQUIRED");

    const after = useDashboardSummary.getState();
    expect(after.status).toBe("error");
    expect(after.error).toBe(err);
    // Summary is intentionally NOT cleared on failure — the UI keeps showing
    // the last-known good data rather than collapsing to a skeleton.
    expect(after.summary).toBe(before);
  });

  // -------------------------------------------------------------------------
  // Behaviour 4 — patchEvent INSERT complaint, secretary view, cap at 2
  // -------------------------------------------------------------------------
  it("patchEvent INSERT complaint (secretary view): count++, prepend preview, CAP AT 2", () => {
    useDashboardSummary.getState().setSummary(secretarySummary());

    useDashboardSummary.getState().patchEvent(
      {
        table: "complaints",
        eventType: "INSERT",
        new: {
          id: "c-new",
          description: "leak C",
          flat_id: "B-203",
          status: "open",
          reporter_id: "someone-else",
        },
        old: null,
      },
      "user-1",
    );

    const s = useDashboardSummary.getState().summary;
    expect(s.complaints.count).toBe(3);
    // Cap enforced — only 2 previews allowed.
    expect(s.complaints.previews).toHaveLength(2);
    // Newest row is prepended.
    expect(s.complaints.previews[0].id).toBe("c-new");
    // Oldest row dropped.
    expect(s.complaints.previews.map((p) => p.id)).not.toContain("c-old-2");
    // Member view buckets untouched.
    expect(s.myComplaints.count).toBe(0);
  });

  // -------------------------------------------------------------------------
  // Behaviour 5 — patchEvent INSERT complaint, member view + author matches
  // -------------------------------------------------------------------------
  it("patchEvent INSERT complaint (member view, reporter_id matches): myComplaints.count++", () => {
    useDashboardSummary.getState().setSummary(memberSummary());

    useDashboardSummary.getState().patchEvent(
      {
        table: "complaints",
        eventType: "INSERT",
        new: {
          id: "mc-new",
          description: "my new complaint",
          flat_id: "B-203",
          status: "open",
          reporter_id: "user-1",
        },
        old: null,
      },
      "user-1",
    );

    const s = useDashboardSummary.getState().summary;
    expect(s.myComplaints.count).toBe(2);
    expect(s.myComplaints.previews[0].id).toBe("mc-new");
    // Secretary-view bucket untouched.
    expect(s.complaints.count).toBe(0);
  });

  // -------------------------------------------------------------------------
  // Behaviour 6 — patchEvent INSERT complaint, member view + author mismatch
  // -------------------------------------------------------------------------
  it("patchEvent INSERT complaint (member view, reporter_id mismatch): no change", () => {
    useDashboardSummary.getState().setSummary(memberSummary());
    const before = useDashboardSummary.getState().summary;

    useDashboardSummary.getState().patchEvent(
      {
        table: "complaints",
        eventType: "INSERT",
        new: {
          id: "mc-other",
          description: "someone else's complaint",
          reporter_id: "user-2",
        },
        old: null,
      },
      "user-1",
    );

    const after = useDashboardSummary.getState().summary;
    expect(after.myComplaints.count).toBe(before.myComplaints.count);
    expect(after.myComplaints.previews).toEqual(before.myComplaints.previews);
  });

  // -------------------------------------------------------------------------
  // Behaviour 7 — patchEvent INSERT booking, secretary view, status filter
  // -------------------------------------------------------------------------
  it("patchEvent INSERT booking (secretary view): status='pending' bumps count; other status no-op", () => {
    useDashboardSummary.getState().setSummary(secretarySummary());

    // First — pending booking → count++.
    useDashboardSummary.getState().patchEvent(
      {
        table: "bookings",
        eventType: "INSERT",
        new: {
          id: "b-new-1",
          status: "pending",
          flat_id: "C-301",
          requester_id: "user-9",
        },
        old: null,
      },
      "user-1",
    );
    let s = useDashboardSummary.getState().summary;
    expect(s.bookings.count).toBe(2);
    expect(s.bookings.previews[0].id).toBe("b-new-1");

    // Second — approved booking → no change.
    const beforeCount = s.bookings.count;
    const beforePreviewIds = s.bookings.previews.map((p) => p.id);
    useDashboardSummary.getState().patchEvent(
      {
        table: "bookings",
        eventType: "INSERT",
        new: {
          id: "b-new-2",
          status: "approved",
          flat_id: "C-302",
          requester_id: "user-9",
        },
        old: null,
      },
      "user-1",
    );
    s = useDashboardSummary.getState().summary;
    expect(s.bookings.count).toBe(beforeCount);
    expect(s.bookings.previews.map((p) => p.id)).toEqual(beforePreviewIds);
  });

  // -------------------------------------------------------------------------
  // Behaviour 8 — patchEvent INSERT notification (both views)
  // -------------------------------------------------------------------------
  it("patchEvent INSERT notification: notifications.count++ regardless of view", () => {
    // Secretary view.
    useDashboardSummary.getState().setSummary(secretarySummary());
    useDashboardSummary.getState().patchEvent(
      {
        table: "notifications",
        eventType: "INSERT",
        new: { id: "n-1", title: "Society announcement" },
        old: null,
      },
      "user-1",
    );
    let s = useDashboardSummary.getState().summary;
    expect(s.notifications.count).toBe(1);
    expect(s.notifications.previews[0]).toEqual(
      expect.objectContaining({ id: "n-1", title: "Society announcement" }),
    );

    // Member view.
    useDashboardSummary.getState().setSummary(memberSummary());
    useDashboardSummary.getState().patchEvent(
      {
        table: "notifications",
        eventType: "INSERT",
        new: { id: "n-2", title: "Water cut tomorrow" },
        old: null,
      },
      "user-1",
    );
    s = useDashboardSummary.getState().summary;
    expect(s.notifications.count).toBe(1);
    expect(s.notifications.previews[0].id).toBe("n-2");
  });

  // -------------------------------------------------------------------------
  // Behaviour 9 — patchEvent UPDATE post hidden_at (member view)
  // -------------------------------------------------------------------------
  it("patchEvent UPDATE post hidden_at: drops matching preview AND decrements community.count", () => {
    useDashboardSummary.getState().setSummary(memberSummary());

    useDashboardSummary.getState().patchEvent(
      {
        table: "posts",
        eventType: "UPDATE",
        new: { id: "p-old-1", hidden_at: "2026-06-15T09:00:00Z" },
        old: { id: "p-old-1", hidden_at: null },
      },
      "user-1",
    );

    const s = useDashboardSummary.getState().summary;
    expect(s.community.previews.find((p) => p.id === "p-old-1")).toBeUndefined();
    expect(s.community.count).toBe(1); // was 2, now 1
  });

  // -------------------------------------------------------------------------
  // Behaviour 10 — reconcile via fetchSummary after patches
  // -------------------------------------------------------------------------
  it("fetchSummary after patches replaces the summary atomically (D-03 reconcile)", async () => {
    useDashboardSummary.getState().setSummary(secretarySummary());
    // Apply a patch — bumps complaints.count to 3.
    useDashboardSummary.getState().patchEvent(
      {
        table: "complaints",
        eventType: "INSERT",
        new: { id: "c-new", description: "leak C", flat_id: "B-203" },
        old: null,
      },
      "user-1",
    );
    expect(useDashboardSummary.getState().summary.complaints.count).toBe(3);

    // Now reconcile — the server says count is 4 (someone else's patch is in
    // the ground truth). The store must adopt the new value exactly.
    const reconciled = secretarySummary({
      complaints: {
        count: 4,
        previews: [
          { id: "c-srv-1", title: "fresh complaint", flat: "C-301" },
          { id: "c-srv-2", title: "another fresh", flat: "C-302" },
        ],
      },
    });
    mockGetDashboardSummary.mockResolvedValueOnce(reconciled);

    await useDashboardSummary.getState().fetchSummary({});
    const after = useDashboardSummary.getState().summary;
    expect(after).toEqual(reconciled);
    expect(after.complaints.count).toBe(4);
    expect(after.complaints.previews).toHaveLength(2);
    expect(after.complaints.previews[0].id).toBe("c-srv-1");
  });

  // -------------------------------------------------------------------------
  // Bonus — T-07-27 reducer safety: bad CDC event → no-op (do not crash)
  // -------------------------------------------------------------------------
  it("patchEvent ignores bad/unknown CDC events without crashing", () => {
    useDashboardSummary.getState().setSummary(secretarySummary());
    const before = useDashboardSummary.getState().summary;

    // Unknown table.
    expect(() =>
      useDashboardSummary
        .getState()
        .patchEvent(
          { table: "unknown_table", eventType: "INSERT", new: { id: "x" }, old: null },
          "user-1",
        ),
    ).not.toThrow();
    // Missing payload.
    expect(() =>
      useDashboardSummary
        .getState()
        .patchEvent({ table: "complaints", eventType: "INSERT", new: null, old: null }, "user-1"),
    ).not.toThrow();

    const after = useDashboardSummary.getState().summary;
    expect(after).toEqual(before);
  });

  // -------------------------------------------------------------------------
  // Bonus — patchEvent with no summary loaded: no-op
  // -------------------------------------------------------------------------
  it("patchEvent before any summary loaded is a no-op", () => {
    expect(useDashboardSummary.getState().summary).toBeNull();
    expect(() =>
      useDashboardSummary.getState().patchEvent(
        {
          table: "complaints",
          eventType: "INSERT",
          new: { id: "c", description: "x" },
          old: null,
        },
        "user-1",
      ),
    ).not.toThrow();
    expect(useDashboardSummary.getState().summary).toBeNull();
  });
});
