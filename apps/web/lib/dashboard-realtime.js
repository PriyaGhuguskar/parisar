// apps/web/lib/dashboard-realtime.js
// Phase 7 Plan 07-08 — Web Dashboard-summary Realtime subscription helper
// (DASH-03 / D-02 / D-03). Mirrors apps/mobile/lib/dashboard-realtime.js 1:1
// — same channel name shape, same 8 watched tables, same per-society server
// filter, same reconnect heuristic, same idempotent unsubscribe.
//
// Opens a per-society Postgres CDC channel that fans 8 watched tables into a
// single onPatch callback. The dashboard-summary-store applies the patches.
// Detects re-subscription transitions and invokes onReconnect so the
// DashboardClient can refetch the summary (D-03 reconcile-on-reconnect).
//
// Channel naming: `dashboard:<societyId>`. We deliberately use a NEW channel
// name (not piggy-backing per-feature channels) because the dashboard watches
// 8 tables; per-feature channels are scoped to their screen's lifecycle and
// sharing them would couple Home's freshness to whether the user has visited
// each feature recently. Channel names are namespaces — collisions don't
// cause cross-talk, just extra wire traffic.
//
// Security (07-08-PLAN <threat_model> + <security_contract>):
//   - T-07-25 / T-07-26 / T-07-28: every postgres_changes config carries
//     `filter: society_id=eq.<societyId>` so the Realtime server sends only
//     society-scoped events. The backend RLS on each source table is the
//     authoritative gate; the client filter is UX (and a defense-in-depth
//     bandwidth optimization).
//   - We do NOT trust the event's `society_id` inside the patch reducer;
//     scoping is enforced by the channel filter itself.
//   - T-07-32 (subscription leak on route change): the caller MUST invoke
//     the returned unsubscribe in its useEffect cleanup; the function itself
//     swallows removeChannel errors so cleanup paths stay quiet on hot
//     reload / React 18 Strict Mode double-effects / unmount.
//
// Reconnect heuristic (D-03):
//   - First `SUBSCRIBED` status arms a flag; subsequent `SUBSCRIBED`s mean a
//     reconnect happened (network drop, tab suspend on mobile Safari, etc.).
//   - When we observe the second-and-later SUBSCRIBED, fire onReconnect().
//   - We do NOT debounce reconnect here — the DashboardClient owns refetch
//     cadence; Supabase Realtime itself debounces reconnect attempts.
//
// JavaScript only — no TypeScript per CLAUDE.md.

// The 8 source tables that feed the dashboard tiles (07-08-PLAN must_haves
// + 07-07 mirror). Order is informational only — events are dispatched
// independently.
export const WATCHED_TABLES = [
  "complaints",
  "complaint_responses",
  "notifications",
  "poll_votes",
  "bookings",
  "flat_actions",
  "posts",
  "post_comments",
];

/**
 * Subscribe to the per-society dashboard Realtime channel.
 *
 * @param {object} supabase
 *   Authenticated supabase-js client (RLS-scoped JWT).
 * @param {string} societyId
 *   Caller's active society. Required — without it the function returns a
 *   no-op unsubscribe (we never open a channel without a filter, per
 *   T-07-25).
 * @param {(event: {table: string, eventType: 'INSERT'|'UPDATE'|'DELETE', new: any, old: any}) => void} onPatch
 *   Called with every CDC event the server sends. Errors thrown by the
 *   handler are caught and logged so a buggy reducer can't tear down the
 *   subscription.
 * @param {() => void} [onReconnect]
 *   Called when the channel SUBSCRIBES for the 2nd+ time (reconnect). The
 *   first SUBSCRIBED is treated as the initial connection and does NOT fire
 *   onReconnect — the caller already loaded its initial data via SSR or
 *   fetchSummary.
 * @returns {() => void}
 *   Idempotent unsubscribe. Tearing down a non-existent channel never throws.
 */
export function subscribeDashboardRealtime(supabase, societyId, onPatch, onReconnect) {
  if (!supabase || !societyId) {
    // No society → no channel. Returning a no-op unsubscribe keeps callers'
    // useEffect cleanup paths straightforward (always callable).
    return () => {};
  }

  const channelName = `dashboard:${societyId}`;
  const channel = supabase.channel(channelName);
  let armedOnce = false;

  for (const table of WATCHED_TABLES) {
    channel.on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table,
        filter: `society_id=eq.${societyId}`,
      },
      (payload) => {
        // payload shape: { schema, table, commit_timestamp, eventType, new, old, errors }
        try {
          onPatch?.({
            table,
            eventType: payload?.eventType,
            new: payload?.new ?? null,
            old: payload?.old ?? null,
          });
        } catch (err) {
          // A buggy reducer must NOT take the channel down.
          console.warn("[dashboard-realtime] onPatch threw for table", table, err?.message ?? err);
        }
      },
    );
  }

  channel.subscribe((status) => {
    if (status === "SUBSCRIBED") {
      if (armedOnce) {
        // Reconnect — fire reconciliation.
        try {
          onReconnect?.();
        } catch (err) {
          console.warn("[dashboard-realtime] onReconnect threw:", err?.message ?? err);
        }
      }
      armedOnce = true;
    }
  });

  return () => {
    try {
      supabase.removeChannel(channel);
    } catch {
      // Idempotent — Supabase removeChannel is safe to call twice; we eat the
      // error so callers' cleanup paths stay quiet on hot reload / unmount.
    }
  };
}
