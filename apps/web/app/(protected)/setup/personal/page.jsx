// /setup/personal — an authority whose society is set up but who has no flat
// and has not said they only manage it (setup_state needs_personal_onboarding).
// They either pick their flat (/onboarding) or skip. Manager-only, like /setup.
//
// JavaScript only — no TypeScript per CLAUDE.md.

import { redirect } from "next/navigation";
import { PersonalChoicePage } from "@/components/setup/PersonalChoicePage";
import { isManagerRole, resolveActiveSociety } from "@/lib/auth/activeSociety";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const metadata = { title: "Your place in the society — Parisar" };

export default async function PersonalSetupPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { societyId, role } = await resolveActiveSociety(supabase, user);
  if (!societyId) redirect("/onboarding");
  if (!isManagerRole(role)) redirect("/dashboard");

  return <PersonalChoicePage societyId={societyId} />;
}
