// /complaints — SSR initial complaint list.
//
// Pattern (RESEARCH.md "Next.js web pattern"):
//   1. Server component runs a cookie-bound supabase server client.
//   2. Pulls initial complaints with full reporter/flat/wing joins (50 max).
//   3. Hands off to ComplaintListClient which subscribes to Realtime + handles
//      tabs, animations, navigation.
//
// Auth/society are already validated by middleware + (protected)/layout.jsx
// upstream — we still read JWT app_metadata for role and society_id (these
// shape the client's behaviour: board vs member view).

import { listComplaints } from "@parisar/api-client";
import { redirect } from "next/navigation";
import { ComplaintListClient } from "../../../components/complaints/ComplaintListClient";
import { resolveActiveSociety } from "../../../lib/auth/activeSociety";
import { createSupabaseServerClient } from "../../../lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function ComplaintsPage() {
  const supabase = await createSupabaseServerClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { societyId, role } = await resolveActiveSociety(supabase, user);

  // No society yet → send them to onboarding (mirrors dashboard guard).
  if (!societyId) redirect("/onboarding");

  let initialComplaints = [];
  let loadError = null;
  try {
    initialComplaints = await listComplaints(supabase, { limit: 50 });
  } catch (err) {
    loadError = err?.message ?? "load_failed";
  }

  return (
    <ComplaintListClient
      initialComplaints={initialComplaints}
      societyId={societyId}
      role={role}
      userId={user.id}
      loadError={loadError}
    />
  );
}
