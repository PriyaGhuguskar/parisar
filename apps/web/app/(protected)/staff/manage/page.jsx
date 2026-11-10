// /staff/manage — Staff Management for society managers. Everyone else is sent to
// the shared staff contact list. The RPCs enforce the same manager-only rule.
// JavaScript only — no TypeScript per CLAUDE.md.

import { redirect } from "next/navigation";
import { StaffManagement } from "@/components/staff/StaffManagement";
import { isManagerRole, resolveActiveSociety } from "@/lib/auth/activeSociety";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function StaffManagePage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { societyId, role } = await resolveActiveSociety(supabase, user);
  if (!societyId) redirect("/onboarding");
  if (!isManagerRole(role)) redirect("/staff");
  return <StaffManagement societyId={societyId} />;
}
