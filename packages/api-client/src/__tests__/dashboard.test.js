// Unit tests for src/dashboard.js (Phase 7 DASH-03).
// Real DB behavior is exercised by tests/isolation/dashboard-summary.test.js
// (Plan 07-02 Task 1). Here we mock the supabase client and assert wiring shape.

import { describe, expect, it, vi } from "vitest";
import { getDashboardSummary } from "../dashboard.js";

function makeRpcClient(rpcImpl) {
  return { rpc: vi.fn(rpcImpl) };
}

// ---------------------------------------------------------------------------
// Test 1 — wiring: getDashboardSummary calls supabase.rpc('get_dashboard_summary')
//          with no args and returns the parsed envelope.
// ---------------------------------------------------------------------------
describe("getDashboardSummary — happy path", () => {
  it("calls supabase.rpc('get_dashboard_summary') with no args and returns the envelope", async () => {
    const payload = {
      role: "secretary",
      complaints: { count: 3, previews: [{ id: "c1", title: "Lift down", flat: "A-101" }] },
      bookings: {
        count: 2,
        previews: [{ id: "b1", amenity: "Clubhouse", slot: "Jun 04 14:00", flat: "A-101" }],
      },
      notifications: { count: 1, previews: [{ id: "n1", title: "Diwali notice" }] },
      flatActions: { count: 1, previews: [{ id: "fa1", kind: "warning", flat: "A-101" }] },
    };
    const supabase = makeRpcClient(async () => ({ data: payload, error: null }));

    const result = await getDashboardSummary(supabase);

    // Wiring assertions.
    expect(supabase.rpc).toHaveBeenCalledTimes(1);
    expect(supabase.rpc).toHaveBeenCalledWith("get_dashboard_summary");

    // Envelope shape.
    expect(result.role).toBe("secretary");
    expect(result.complaints.count).toBe(3);
    expect(result.complaints.previews[0].title).toBe("Lift down");
    expect(result.bookings.count).toBe(2);
    expect(result.notifications.count).toBe(1);
    expect(result.flatActions.count).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Test 2 — error path: a non-null error from supabase.rpc is rethrown.
// ---------------------------------------------------------------------------
describe("getDashboardSummary — error path", () => {
  it("throws when supabase.rpc returns a non-null error", async () => {
    const err = new Error("AUTH_REQUIRED");
    const supabase = makeRpcClient(async () => ({ data: null, error: err }));
    await expect(getDashboardSummary(supabase)).rejects.toThrow("AUTH_REQUIRED");
  });

  it("throws when supabase.rpc returns a NO_SOCIETY error", async () => {
    const err = new Error("NO_SOCIETY");
    const supabase = makeRpcClient(async () => ({ data: null, error: err }));
    await expect(getDashboardSummary(supabase)).rejects.toThrow("NO_SOCIETY");
  });
});

// ---------------------------------------------------------------------------
// Test 3 — normalization: missing tile keys are filled with the empty tile
//          fallback so the UI never crashes on `summary.myBookings.count`.
// ---------------------------------------------------------------------------
describe("getDashboardSummary — normalization", () => {
  it("falls back to { count:0, previews:[] } when a tile key is absent", async () => {
    // Server response with ONLY the member-branch keys (no secretary keys).
    const partial = {
      role: "member",
      myComplaints: { count: 0, previews: [] },
      notifications: { count: 4, previews: [] },
      myBookings: { count: 1, previews: [] },
      community: { count: 0, previews: [] },
    };
    const supabase = makeRpcClient(async () => ({ data: partial, error: null }));
    const result = await getDashboardSummary(supabase);

    // The role is preserved.
    expect(result.role).toBe("member");
    // Member-branch keys come through verbatim.
    expect(result.myComplaints.count).toBe(0);
    expect(result.notifications.count).toBe(4);
    expect(result.myBookings.count).toBe(1);
    expect(result.community.count).toBe(0);
    // Secretary-branch keys absent from the RPC → empty fallback (NOT undefined).
    expect(result.complaints).toEqual({ count: 0, previews: [] });
    expect(result.bookings).toEqual({ count: 0, previews: [] });
    expect(result.flatActions).toEqual({ count: 0, previews: [] });
  });

  it("returns a fully-normalized envelope when the RPC returns null", async () => {
    const supabase = makeRpcClient(async () => ({ data: null, error: null }));
    const result = await getDashboardSummary(supabase);
    expect(result.role).toBe("member");
    expect(result.complaints).toEqual({ count: 0, previews: [] });
    expect(result.bookings).toEqual({ count: 0, previews: [] });
    expect(result.notifications).toEqual({ count: 0, previews: [] });
    expect(result.flatActions).toEqual({ count: 0, previews: [] });
    expect(result.myComplaints).toEqual({ count: 0, previews: [] });
    expect(result.myBookings).toEqual({ count: 0, previews: [] });
    expect(result.community).toEqual({ count: 0, previews: [] });
  });
});
