// /bookings/new — amenity-booking request form (UI-SPEC Screen 5).
//
// Server component:
//   1. Validates session + reads societyId from JWT app_metadata.
//   2. SSR-fetches the society amenities (open/close hours hint, RLS-scoped).
//   3. Renders the client BookingForm. Members + board may request (BOOK-01).

import { listAmenities } from "@parisar/api-client";
import Link from "next/link";
import { redirect } from "next/navigation";
import { BookingForm } from "../../../../components/bookings/BookingForm";
import { resolveActiveSociety } from "../../../../lib/auth/activeSociety";
import { initTranslations, readLocaleFromCookies } from "../../../../lib/i18n/server";
import { createSupabaseServerClient } from "../../../../lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function NewBookingPage() {
  const lng = await readLocaleFromCookies();
  const { t } = await initTranslations(lng, ["bookings"]);
  const supabase = await createSupabaseServerClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { societyId } = await resolveActiveSociety(supabase, user);
  if (!societyId) redirect("/onboarding");

  let amenities = [];
  try {
    amenities = await listAmenities(supabase);
  } catch {
    amenities = [];
  }

  return (
    <div className="min-h-screen bg-[var(--color-neutral-50)]">
      <header className="bg-white border-b border-neutral-200 px-4 h-14 flex items-center gap-3">
        <Link
          href="/bookings"
          className="text-sm text-[#0E5A48] hover:underline"
          aria-label="Back to bookings"
        >
          ← Back
        </Link>
        <h1 className="text-xl font-semibold text-[#171717] truncate">
          {t("booking.requestTitle")}
        </h1>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-6">
        <div className="bg-white rounded-2xl p-6">
          <BookingForm amenities={amenities} hasAmenities={amenities.length > 0} />
        </div>
      </main>
    </div>
  );
}
