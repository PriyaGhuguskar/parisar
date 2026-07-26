// packages/api-client/src/dashboard.js
// Phase 7 DASH-03 — single-round-trip dashboard aggregation helper.
// Mirrors the Phase 4/5/6 thin-wrapper-over-rpc pattern (see complaints.js,
// bookings.js).
//
// The RPC body lives in
// supabase/migrations/20260603000010_phase7_dashboard_summary.sql and returns:
//   { role,                                            // 'secretary' | 'co_secretary' | 'board_member' | 'member'
//     // secretary/board branch (role in {board_member,co_secretary,secretary}):
//     complaints:    { count, previews[{id,title,flat}] },
//     bookings:      { count, previews[{id,amenity,slot,flat}] },
//     notifications: { count, previews[{id,title}] },
//     flatActions:   { count, previews[{id,kind,flat}] },
//     // member branch:
//     myComplaints:  { count, previews[{id,title,status}] },
//     notifications: { count, previews[{id,title}] },
//     myBookings:    { count, previews[{id,amenity,slot,status}] },
//     community:     { count, previews[{id,author,flat,title}] } }
//
// `normalize()` defensively ensures every tile key the caller might consume is
// present as `{ count: 0, previews: [] }` rather than `undefined` — so the
// dashboard UI can do `summary.myBookings.count` without role-aware
// branching at the call site. The role flag drives which keys actually carry
// real data; the empty keys are filtered out by the role-aware tile config.

const EMPTY_TILE = { count: 0, previews: [] };

/**
 * Fetch the role-aware dashboard summary in a single round-trip.
 *
 * Calls the parameterless `get_dashboard_summary()` SECURITY DEFINER RPC.
 * RLS is bypassed inside the RPC body; the body itself filters every
 * sub-query by `society_id = current_society_id()` (and, for the member
 * branch, by `auth.uid()`). Cross-society leakage is locked by
 * tests/isolation/dashboard-summary.test.js (T-07-04).
 *
 * @param {object} supabase Authenticated supabase-js client
 * @returns {Promise<{
 *   role: string,
 *   complaints:    {count: number, previews: Array<object>},
 *   bookings:      {count: number, previews: Array<object>},
 *   notifications: {count: number, previews: Array<object>},
 *   flatActions:   {count: number, previews: Array<object>},
 *   myComplaints:  {count: number, previews: Array<object>},
 *   myBookings:    {count: number, previews: Array<object>},
 *   community:     {count: number, previews: Array<object>}
 * }>}
 * @throws Error when the RPC raises (e.g. AUTH_REQUIRED, NO_SOCIETY) or when
 *         the network call fails.
 */
export async function getDashboardSummary(supabase) {
  const { data, error } = await supabase.rpc("get_dashboard_summary");
  if (error) throw error;
  return normalize(data);
}

/**
 * Normalize the RPC return so every tile key exists with at least
 * `{ count: 0, previews: [] }`. The `role` flag drives which keys actually
 * carry server-side data; the dashboard UI's role-aware tile config picks
 * the right ones to render.
 *
 * Defensive against:
 *   - the RPC returning null/undefined (e.g. transient PostgREST quirk)
 *   - a partial response shape (e.g. a future RPC tweak removes a tile)
 *
 * @param {unknown} d
 */
function normalize(d) {
  if (!d || typeof d !== "object") {
    return {
      role: "member",
      complaints: EMPTY_TILE,
      bookings: EMPTY_TILE,
      notifications: EMPTY_TILE,
      flatActions: EMPTY_TILE,
      myComplaints: EMPTY_TILE,
      myBookings: EMPTY_TILE,
      community: EMPTY_TILE,
    };
  }
  return {
    role: d.role ?? "member",
    complaints: d.complaints ?? EMPTY_TILE,
    bookings: d.bookings ?? EMPTY_TILE,
    notifications: d.notifications ?? EMPTY_TILE,
    flatActions: d.flatActions ?? EMPTY_TILE,
    myComplaints: d.myComplaints ?? EMPTY_TILE,
    myBookings: d.myBookings ?? EMPTY_TILE,
    community: d.community ?? EMPTY_TILE,
  };
}
