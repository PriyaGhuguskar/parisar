"use server";

// Server actions for Phase 5 amenity-booking mutations (web).
//
// Each action creates a cookie-bound @supabase/ssr server client and delegates to
// the shared api-client function. RLS/RPC guards do the real enforcement; the
// approve/reject RPCs are board-gated server-side (T-05-02). Atomic first-approval
// outcomes (won / race_lost / slot_taken) are returned as TYPED results — never
// thrown — so the client renders the right banner (BOOK-03/05).
//
// revalidatePath('/bookings') after each mutation so a subsequent SSR navigation
// re-hydrates the queue.

import { approveBooking, rejectBooking, requestBooking } from "@parisar/api-client";
import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "../../lib/supabase/server";

// Map request_booking RPC error messages → UI error codes the client maps to copy.
function mapRequestError(message) {
  const m = String(message ?? "");
  if (m.includes("TIME_ORDER")) return "time_order";
  if (m.includes("LEAD_TIME")) return "lead_time";
  if (m.includes("TOO_FAR")) return "too_far";
  if (m.includes("DURATION")) return "duration";
  if (m.includes("OUTSIDE_HOURS")) return "hours";
  return "submit_failed";
}

/**
 * Request a booking. The RPC builds the tstzrange and enforces lead-time / horizon
 * / duration / amenity-hours server-side; named errors map to inline copy codes.
 *
 * @param {{ amenityId: string, startsAt: string, endsAt: string, purpose?: string|null }} input
 * @returns {Promise<{ ok: boolean, bookingId?: string, error?: string }>}
 */
export async function requestBookingAction(input) {
  const supabase = await createSupabaseServerClient();
  try {
    const result = await requestBooking(supabase, {
      amenityId: input.amenityId,
      startsAt: input.startsAt,
      endsAt: input.endsAt,
      purpose: input.purpose ?? null,
    });
    revalidatePath("/bookings");
    return { ok: true, bookingId: result.bookingId };
  } catch (err) {
    return { ok: false, error: mapRequestError(err?.message) };
  }
}

/**
 * Approve a booking (atomic first-approval, BOOK-03). Returns the RPC's typed
 * result straight through:
 *   { approved: true,  booking }                            → won
 *   { approved: false, reason: 'race_lost_or_not_pending' } → another board member won
 *   { approved: false, reason: 'slot_taken' }               → exclusion constraint (BOOK-05)
 *
 * @param {string} bookingId
 * @returns {Promise<{ ok: boolean, approved?: boolean, reason?: string, booking?: object, error?: string }>}
 */
export async function approveBookingAction(bookingId) {
  const supabase = await createSupabaseServerClient();
  try {
    const result = await approveBooking(supabase, { bookingId });
    revalidatePath("/bookings");
    return {
      ok: true,
      approved: !!result?.approved,
      reason: result?.reason ?? null,
      booking: result?.booking ?? null,
    };
  } catch (err) {
    return { ok: false, error: err?.message ?? "approve_failed" };
  }
}

/**
 * Reject a booking with an optional reason (BOOK-04). Board-gated server-side.
 *
 * @param {string} bookingId
 * @param {string|null} reason
 * @returns {Promise<{ ok: boolean, result?: object, error?: string }>}
 */
export async function rejectBookingAction(bookingId, reason) {
  const supabase = await createSupabaseServerClient();
  try {
    const result = await rejectBooking(supabase, { bookingId, reason: reason ?? null });
    revalidatePath("/bookings");
    return { ok: true, result };
  } catch (err) {
    return { ok: false, error: err?.message ?? "reject_failed" };
  }
}
