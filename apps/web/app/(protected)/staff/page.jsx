// apps/web/app/(protected)/staff/page.jsx
// Shared staff contact directory — any resident adds, everyone sees.
// JavaScript only — no TypeScript per CLAUDE.md.

import { redirect } from "next/navigation";
import { StaffDirectory } from "../../../components/staff/StaffDirectory";
import { resolveActiveSociety } from "../../../lib/auth/activeSociety";
import { createSupabaseServerClient } from "../../../lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function StaffPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { societyId, role } = await resolveActiveSociety(supabase, user);
  if (!societyId) redirect("/onboarding");
  return <StaffDirectory societyId={societyId} userId={user.id} role={role} />;
}
