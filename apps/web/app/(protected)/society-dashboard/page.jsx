// /society-dashboard — the Society Dashboard for society authorities.
//
// Authorities (membership role secretary / co-secretary) reach it from their
// resident dashboard or the sidebar. It holds the Society Authorities list (add
// more at any time) and links to the society-management pages that already
// exist. Same gate as /society: anyone else goes back to /dashboard.

import { redirect } from "next/navigation";
import { SocietyDashboardClient } from "@/components/authorities/SocietyDashboardClient";
import { resolveActiveSociety } from "@/lib/auth/activeSociety";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const metadata = { title: "Society Dashboard — Parisar" };

const AUTHORITY_ROLES = new Set(["secretary", "co_secretary"]);

export default async function SocietyDashboardPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { societyId, role } = await resolveActiveSociety(supabase, user);
  if (!societyId) redirect("/onboarding");
  if (!AUTHORITY_ROLES.has(role)) redirect("/dashboard");

  return <SocietyDashboardClient societyId={societyId} userId={user.id} />;
}
