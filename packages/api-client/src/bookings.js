// Shared amenity-booking helpers used by BOTH the web and mobile Phase 5 flows.
// Single source of truth: all Supabase calls for bookings live here so neither
// client duplicates RPC signatures or Realtime channel shapes.
//
// All RPC param names match the migration in
// supabase/migrations/20260528000008_phase5_notifications_bookings.sql.
//
// Functions exported:
//   1. listAmenities(supabase)
//   2. listBookings(supabase, opts)
//   3. requestBooking(supabase, opts)
//   4. approveBooking(supabase, { bookingId })  ← surfaces slot_taken / race_lost as typed results
//   5. rejectBooking(supabase, { bookingId, reason })
//   6. subscribeToBookings(supabase, societyId, handlers)

import { BOOKING_STATUS } from "@parisar/shared-types";

// Re-export so callers can pull the enum from the bookings module.
export { BOOKING_STATUS };

// ---------------------------------------------------------------------------
// Reads (RLS scopes server-side: requester sees own; board sees the society queue)
// ---------------------------------------------------------------------------

/**
 * List the society's amenities with their open/close hours (BOOK-01 picker hint).
 *
 * @param {object} supabase
 * @returns {Promise<Array<{ id, name, open_time, close_time }>>}
 */
export async function listAmenities(supabase) {
  const { data, error } = await supabase
    .from("amenities")
    .select("id, name, open_time, close_time")
    .order("name", { ascending: true });
  if (error) throw error;
  return data ?? [];
}

/**
 * List bookings.
 *
 * - mode='mine':  the requester's own bookings (RLS already scopes to requester).
 * - mode='queue': the society's board queue (RLS scopes to same-society board via
 *   can_see_booking). Pending first, then by created_at desc so the action queue
 *   floats to the top.
 *
 * Embeds amenity name + requester/approver/rejecter flat for attribution (BOOK-06/07).
 *
 * @param {object} supabase
 * @param {{ mode?: 'mine'|'queue', limit?: number }} [opts]
 * @returns {Promise<Array>}
 */
export async function listBookings(supabase, { mode = "mine", limit = 30 } = {}) {
  let q = supabase
    .from("bookings")
    .select(
      `
        id,
        society_id,
        amenity_id,
        requester_id,
        requester_flat_id,
        time_range,
        purpose,
        status,
        approved_by,
        approver_flat_id,
        approved_at,
        rejected_by,
        rejecter_flat_id,
        rejection_reason,
        rejected_at,
        created_at,
        amenity:amenity_id ( id, name, open_time, close_time ),
        requester:requester_id ( user_id, full_name ),
        requester_flat:requester_flat_id ( number, wing:wing_id ( name ) ),
        approver_flat:approver_flat_id ( number, wing:wing_id ( name ) ),
        rejecter_flat:rejecter_flat_id ( number, wing:wing_id ( name ) )
      `,
    )
    .limit(limit);

  if (mode === "queue") {
    // Pending-first so the board's action queue floats up, then newest first.
    q = q
      .order("status", { ascending: true }) // pending < approved < rejected lexically? no — order in JS below
      .order("created_at", { ascending: false });
  } else {
    q = q.order("created_at", { ascending: false });
  }

  const { data, error } = await q;
  if (error) throw error;

  const rows = data ?? [];
  if (mode === "queue") {
    // Deterministic pending-first ordering regardless of enum sort semantics.
    return [...rows].sort((a, b) => {
      const aPending = a.status === BOOKING_STATUS.PENDING ? 0 : 1;
      const bPending = b.status === BOOKING_STATUS.PENDING ? 0 : 1;
      if (aPending !== bPending) return aPending - bPending;
      return new Date(b.created_at) - new Date(a.created_at);
    });
  }
  return rows;
}

// ---------------------------------------------------------------------------
// Writes (SECURITY DEFINER RPCs — direct table writes are REVOKED, T-05-15)
// ---------------------------------------------------------------------------

/**
 * Request a booking. The RPC builds the tstzrange and enforces lead-time (≥1h),
 * horizon (≤30d), duration (≤4h), and amenity open/close hours (IST) server-side
 * (BOOK-01). Named exceptions (TIME_ORDER / LEAD_TIME / TOO_FAR / DURATION /
 * OUTSIDE_HOURS) propagate as thrown errors whose message the UI maps to the right
 * inline copy.
 *
 * Calls: request_booking(p_amenity_id, p_starts_at, p_ends_at, p_purpose)
 *
 * @param {object} supabase
 * @param {{ amenityId: string, startsAt: string, endsAt: string, purpose?: string|null }} opts
 *   startsAt/endsAt are ISO timestamps (timestamptz).
 * @returns {Promise<{ bookingId: string }>}
 */
export async function requestBooking(supabase, { amenityId, startsAt, endsAt, purpose = null }) {
  const { data, error } = await supabase.rpc("request_booking", {
    p_amenity_id: amenityId,
    p_starts_at: startsAt,
    p_ends_at: endsAt,
    p_purpose: purpose,
  });
  if (error) throw error;
  return { bookingId: data.booking_id };
}

/**
 * Approve a booking (atomic first-approval, BOOK-03).
 *
 * The RPC returns a typed jsonb result that this wrapper passes through CLEANLY —
 * it never throws for the business outcomes:
 *   - { approved: true,  booking }                          → won
 *   - { approved: false, reason: 'race_lost_or_not_pending' } → another board member won
 *   - { approved: false, reason: 'slot_taken' }              → exclusion constraint 23P01 (BOOK-05)
 * Only a genuine transport/RLS error throws.
 *
 * Calls: approve_booking(p_booking_id)
 *
 * @param {object} supabase
 * @param {{ bookingId: string }} opts
 * @returns {Promise<{ approved: boolean, reason?: string, booking?: object }>}
 */
export async function approveBooking(supabase, { bookingId }) {
  const { data, error } = await supabase.rpc("approve_booking", { p_booking_id: bookingId });
  if (error) throw error;
  // Pass the server's typed result straight through — the UI decides how to render
  // won / race_lost / slot_taken. We do not reshape or re-throw business outcomes.
  return data;
}

/**
 * Reject a booking with an optional reason (BOOK-04). Board-gated server-side.
 *
 * Calls: reject_booking(p_booking_id, p_reason)
 *
 * @param {object} supabase
 * @param {{ bookingId: string, reason?: string|null }} opts
 * @returns {Promise<object>} the RPC jsonb result
 */
export async function rejectBooking(supabase, { bookingId, reason = null }) {
  const { data, error } = await supabase.rpc("reject_booking", {
    p_booking_id: bookingId,
    p_reason: reason,
  });
  if (error) throw error;
  return data;
}

// ---------------------------------------------------------------------------
// Realtime subscriptions
// ---------------------------------------------------------------------------

/**
 * Subscribe to booking inserts + decisions for a society (BOOK-03 board feel).
 *
 * `bookings` is in the supabase_realtime publication (Plan 05-01). When one board
 * member approves/rejects, the others receive the UPDATE and re-render the card
 * read-only with the winner's banner (the "loser sees read-only" requirement).
 *
 * @param {object} supabase
 * @param {string} societyId
 * @param {{ onInsert?: Function, onUpdate?: Function, onConnected?: Function }} handlers
 * @returns {Function} cleanup
 */
export function subscribeToBookings(supabase, societyId, handlers) {
  const channel = supabase
    .channel(`bookings-${societyId}`)
    .on(
      "postgres_changes",
      {
        event: "INSERT",
        schema: "public",
        table: "bookings",
        filter: `society_id=eq.${societyId}`,
      },
      (payload) => handlers.onInsert?.(payload.new),
    )
    .on(
      "postgres_changes",
      {
        event: "UPDATE",
        schema: "public",
        table: "bookings",
        filter: `society_id=eq.${societyId}`,
      },
      (payload) => handlers.onUpdate?.(payload.new),
    )
    .subscribe((status) => {
      if (status === "SUBSCRIBED") {
        handlers.onConnected?.();
      }
    });

  return () => {
    supabase.removeChannel(channel);
  };
}
