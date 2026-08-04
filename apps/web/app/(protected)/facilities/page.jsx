// apps/web/app/(protected)/facilities/page.jsx
// Facility calendar — society-ops schedule. Secretary schedules; everyone sees.
// JavaScript only — no TypeScript per CLAUDE.md.

import { redirect } from "next/navigation";
import { FacilityCalendar } from "../../../components/facilities/FacilityCalendar";
import { resolveActiveSociety } from "../../../lib/auth/activeSociety";
import { createSupabaseServerClient } from "../../../lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function FacilitiesPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { societyId, role } = await resolveActiveSociety(supabase, user);
  if (!societyId) redirect("/onboarding");
  return <FacilityCalendar societyId={societyId} role={role} />;
}
