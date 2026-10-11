// apps/web/app/(protected)/visitors/page.jsx
// Resident's visitor inbox — gate requests for their flat to approve or deny.
// Data is RLS-scoped (visitor_requests_resident_read) so the client fetches its
// own rows; this server shell only confirms auth.
//
// JavaScript only — no TypeScript per CLAUDE.md.

import { redirect } from "next/navigation";
import { VisitorInbox } from "../../../components/visitors/VisitorInbox";
import { resolveActiveSociety } from "../../../lib/auth/activeSociety";
import { createSupabaseServerClient } from "../../../lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function VisitorsPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  // Scope the realtime channel to the active society (RLS still filters rows).
  const { societyId } = await resolveActiveSociety(supabase, user);
  if (!societyId) redirect("/onboarding");
  return <VisitorInbox societyId={societyId} />;
}
