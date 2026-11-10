// /approvals: requests waiting on the signed-in member. The RPCs decide who may
// act on what; the role here only hides sections that would always be empty.

import { residentDashboard } from "@parisar/api-client";
import { redirect } from "next/navigation";
import { ApprovalsHome } from "@/components/approvals/ApprovalsHome";
import { isManagerRole, resolveActiveSociety } from "@/lib/auth/activeSociety";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const metadata = { title: "Approvals — Parisar" };

export default async function ApprovalsPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const active = await resolveActiveSociety(supabase, user);
  if (!active.societyId) redirect("/onboarding");

  let residentType = null;
  try {
    const home = await residentDashboard(supabase, active.societyId);
    residentType = home?.error ? null : (home?.resident_type ?? null);
  } catch {
    residentType = null; // sections still load and report their own errors
  }

  return (
    <ApprovalsHome
      societyId={active.societyId}
      userId={user.id}
      isManager={isManagerRole(active.role)}
      isOwner={residentType === "owner"}
    />
  );
}
