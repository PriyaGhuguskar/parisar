// /bookings — SSR booking list (member My Bookings / board queue).
//
// Server component (Phase 4 SSR+CSR split):
//   1. Validates session + reads societyId + role from JWT app_metadata.
//   2. Board roles → listBookings({ mode: 'queue' }) (pending-first society queue,
//      BOOK-02). Members → listBookings({ mode: 'mine' }) (own requests, BOOK-07).
//   3. Hands off to BookingListClient (Realtime UPDATE flip + approve/reject row).

import { listBookings } from "@parisar/api-client";
import { redirect } from "next/navigation";
import { BookingListClient } from "../../../components/bookings/BookingListClient";
import { resolveActiveSociety } from "../../../lib/auth/activeSociety";
import { createSupabaseServerClient } from "../../../lib/supabase/server";

export const dynamic = "force-dynamic";

const BOARD_ROLES = new Set(["board_member", "co_secretary", "secretary"]);

export default async function BookingsPage() {
  const supabase = await createSupabaseServerClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { societyId, role } = await resolveActiveSociety(supabase, user);
  if (!societyId) redirect("/onboarding");

  const isBoard = BOARD_ROLES.has(role);
  const mode = isBoard ? "queue" : "mine";

  let initialBookings = [];
  let loadError = null;
  try {
    initialBookings = await listBookings(supabase, { mode });
  } catch (err) {
    loadError = err?.message ?? "load_failed";
  }

  return (
    <BookingListClient
      initialBookings={initialBookings}
      societyId={societyId}
      role={role}
      loadError={loadError}
    />
  );
}
