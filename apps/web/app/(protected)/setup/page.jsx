// /setup — the society setup wizard for society authorities.
//
// Reached after an authority signs in and claims a society whose setup is not
// complete (setup_state needs_setup), and from the Society Dashboard. Guarded
// here as well as in every setup RPC (assert_can_manage): only a live secretary
// or co-secretary of the ACTIVE society gets the wizard; anyone else goes home.
//
// JavaScript only — no TypeScript per CLAUDE.md.

import { redirect } from "next/navigation";
import { SetupWizard } from "@/components/setup/SetupWizard";
import { isManagerRole, resolveActiveSociety } from "@/lib/auth/activeSociety";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const metadata = { title: "Set up your society — Parisar" };

export default async function SetupPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { societyId, role } = await resolveActiveSociety(supabase, user);
  if (!societyId) redirect("/onboarding");
  if (!isManagerRole(role)) redirect("/dashboard");

  return <SetupWizard societyId={societyId} />;
}
