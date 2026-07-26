// apps/web/lib/dashboard-summary-store.js
// Phase 7 Plan 07-08 — Web Zustand store for the live dashboard summary
// (DASH-03 web parity). Mirrors apps/mobile/lib/dashboard-summary-store.js 1:1.
//
// Holds the role-aware summary returned by `get_dashboard_summary()` plus an
// incremental patch reducer for Realtime CDC events (Design Decision D-02).
// The DashboardClient calls `fetchSummary(supabase)` on window focus
// (D-03 reconciliation — web analogue of mobile useFocusEffect) and routes
// per-table INSERT/UPDATE events through `patchEvent` so counts + previews
// tick without waiting for a full refetch.
//
// Threat model (07-08-PLAN <threat_model>):
//   - T-07-27 (DoS via unbounded preview growth): `prepend` caps at 2 entries.
//     The cap is defensive even though the RPC already enforces LIMIT 2 — bad
//     CDC bursts must never grow arrays past the contract.
//   - T-07-29 (SSR/info-disclosure): backend RLS authoritative; this reducer
//     does NOT trust the event payload's `society_id` — the dashboard
//     subscription itself filters per-society (dashboard-realtime.js).
//   - Bad/missing CDC payload → no-op (defensive `if (!nu) return`); the next
//     focus-reconcile refetch self-heals (D-03).
//
// Immutability discipline (CLAUDE.md §Coding Style): every state update
// produces a new top-level summary object via spread; nested tile buckets are
// replaced (not mutated). Zustand selectors stay shallow-comparable.
//
// JavaScript only — no TypeScript per CLAUDE.md.

import { getDashboardSummary } from "@parisar/api-client";
import { create } from "zustand";

// The seven tile-bucket keys callers will iterate over. The dashboard UI's
// role-aware tile config picks which subset to render (e.g. members never see
// `flatActions`); the role flag on the summary itself drives that decision.
export const DASHBOARD_TILE_KEYS = [
  "complaints",
  "bookings",
  "notifications",
  "flatActions",
  "myComplaints",
  "myBookings",
  "community",
];

// Hard preview cap — UI-SPEC §Screen 1 contract is "max 2 rows per tile" and
// the RPC enforces LIMIT 2; this is the client-side defensive enforcement
// (T-07-27).
const PREVIEW_CAP = 2;

const BOARD_LIKE = new Set(["board_member", "co_secretary", "secretary"]);

function isBoardLike(role) {
  return BOARD_LIKE.has(role);
}

/**
 * Return a new array with `item` prepended, capped at PREVIEW_CAP entries.
 * Pure: never mutates the input.
 */
function prepend(list, item) {
  const head = item ? [item] : [];
  const tail = Array.isArray(list) ? list : [];
  return [...head, ...tail].slice(0, PREVIEW_CAP);
}

/**
 * Return a new array with any element matching `id` removed.
 * Pure: never mutates the input.
 */
function dropById(list, id) {
  if (!Array.isArray(list)) return [];
  return list.filter((p) => p?.id !== id);
}

export const useDashboardSummary = create((set, get) => ({
  summary: null,
  status: "idle", // 'idle' | 'loading' | 'ready' | 'error'
  error: null,

  /**
   * Fetch the role-aware summary from the RPC. Status transitions
   * idle → loading → ready on success, idle → loading → error on failure.
   * On failure the prior `summary` is preserved (UI keeps last-known-good).
   */
  async fetchSummary(supabase) {
    set({ status: "loading", error: null });
    try {
      const data = await getDashboardSummary(supabase);
      set({ summary: data, status: "ready", error: null });
      return data;
    } catch (err) {
      set({ status: "error", error: err });
      throw err;
    }
  },

  /**
   * Replace the summary atomically (used by SSR seeding, reconnect-reconcile,
   * and tests). Status becomes "ready".
   */
  setSummary(data) {
    set({ summary: data, status: "ready", error: null });
  },

  /**
   * Apply one Realtime CDC event to the in-memory summary (D-02).
   *
   * Unknown tables / missing payloads / unknown role views are no-ops —
   * the next focus-reconcile refetch self-heals (D-03).
   *
   * @param {{table: string, eventType: 'INSERT'|'UPDATE'|'DELETE', new: any, old: any}} event
   * @param {string|null|undefined} currentUserId - used to scope member-view "mine" rows
   */
  patchEvent(event, currentUserId) {
    if (!event || typeof event !== "object") return;
    const { table, eventType, new: nu } = event;
    const s = get().summary;
    if (!s) return;
    const role = s.role;

    // ---- complaints ----
    if (table === "complaints" && eventType === "INSERT") {
      if (!nu) return;
      if (isBoardLike(role)) {
        const preview = {
          id: nu.id,
          title: nu.description ?? "",
          flat: nu.flat_id ?? nu.reporter_flat_id ?? "",
        };
        set({
          summary: {
            ...s,
            complaints: {
              count: (s.complaints?.count ?? 0) + 1,
              previews: prepend(s.complaints?.previews, preview),
            },
          },
        });
        return;
      }
      // Member view: only mine.
      if (nu.reporter_id && currentUserId && nu.reporter_id === currentUserId) {
        const preview = {
          id: nu.id,
          title: nu.description ?? "",
          status: nu.status ?? "open",
        };
        set({
          summary: {
            ...s,
            myComplaints: {
              count: (s.myComplaints?.count ?? 0) + 1,
              previews: prepend(s.myComplaints?.previews, preview),
            },
          },
        });
      }
      return;
    }

    // ---- bookings ----
    if (table === "bookings" && eventType === "INSERT") {
      if (!nu) return;
      // Secretary queue tracks pending bookings only — D-02.
      if (isBoardLike(role) && nu.status === "pending") {
        const preview = {
          id: nu.id,
          amenity: nu.amenity_name ?? "",
          slot: "",
          flat: nu.flat_id ?? nu.requester_flat_id ?? "",
        };
        set({
          summary: {
            ...s,
            bookings: {
              count: (s.bookings?.count ?? 0) + 1,
              previews: prepend(s.bookings?.previews, preview),
            },
          },
        });
        return;
      }
      // Member self-bookings.
      if (
        !isBoardLike(role) &&
        nu.requester_id &&
        currentUserId &&
        nu.requester_id === currentUserId
      ) {
        const preview = {
          id: nu.id,
          amenity: nu.amenity_name ?? "",
          slot: "",
          status: nu.status ?? "pending",
        };
        set({
          summary: {
            ...s,
            myBookings: {
              count: (s.myBookings?.count ?? 0) + 1,
              previews: prepend(s.myBookings?.previews, preview),
            },
          },
        });
      }
      return;
    }

    // ---- notifications ----
    if (table === "notifications" && eventType === "INSERT") {
      if (!nu) return;
      const preview = { id: nu.id, title: nu.title ?? "" };
      set({
        summary: {
          ...s,
          notifications: {
            count: (s.notifications?.count ?? 0) + 1,
            previews: prepend(s.notifications?.previews, preview),
          },
        },
      });
      return;
    }

    // ---- flat_actions (secretary only) ----
    if (table === "flat_actions" && eventType === "INSERT" && isBoardLike(role)) {
      if (!nu) return;
      const preview = {
        id: nu.id,
        kind: nu.kind != null ? String(nu.kind) : "",
        flat: nu.flat_id ?? "",
      };
      set({
        summary: {
          ...s,
          flatActions: {
            count: (s.flatActions?.count ?? 0) + 1,
            previews: prepend(s.flatActions?.previews, preview),
          },
        },
      });
      return;
    }

    // ---- posts (community — member view) ----
    if (table === "posts" && !isBoardLike(role)) {
      if (!nu) return;
      if (eventType === "INSERT" && nu.hidden_at == null && nu.deleted_at == null) {
        const preview = {
          id: nu.id,
          author: "",
          flat: "",
          title: typeof nu.body === "string" ? nu.body.slice(0, 60) : "",
        };
        set({
          summary: {
            ...s,
            community: {
              count: (s.community?.count ?? 0) + 1,
              previews: prepend(s.community?.previews, preview),
            },
          },
        });
        return;
      }
      if (eventType === "UPDATE" && nu.hidden_at != null) {
        // Post got hidden → drop from previews; decrement count defensively.
        set({
          summary: {
            ...s,
            community: {
              count: Math.max(0, (s.community?.count ?? 0) - 1),
              previews: dropById(s.community?.previews, nu.id),
            },
          },
        });
      }
      return;
    }

    // Unknown table or unhandled event → no-op (focus-reconcile self-heals).
  },

  /**
   * Reset to initial state. Used by tests and on sign-out / society-switch.
   */
  reset() {
    set({ summary: null, status: "idle", error: null });
  },
}));
