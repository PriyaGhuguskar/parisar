// /staff/manage/new — add a staff member (society managers only).
// JavaScript only — no TypeScript per CLAUDE.md.

import { redirect } from "next/navigation";
import { StaffForm } from "@/components/staff/StaffForm";
import { isManagerRole, resolveActiveSociety } from "@/lib/auth/activeSociety";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function NewStaffPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { societyId, role } = await resolveActiveSociety(supabase, user);
  if (!societyId) redirect("/onboarding");
  if (!isManagerRole(role)) redirect("/staff");
  return <StaffForm societyId={societyId} userId={user.id} />;
}
