// /onboarding/status: tenant registrations and household requests still waiting
// on someone else's approval. Signed in only; no membership needed.

import { redirect } from "next/navigation";
import { OnboardingStatus } from "@/components/onboarding/OnboardingStatus";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const metadata = { title: "Your requests — Parisar" };

export default async function OnboardingStatusPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  return <OnboardingStatus userId={user.id} />;
}
