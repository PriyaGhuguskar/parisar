// /onboarding — new resident wizard (society code -> details -> family -> PIN).
//
// Reached in `code` mode after OTP. The user is authenticated but has no
// membership yet, so the (protected) layout renders this bare (no sidebar).
// If they somehow already belong to a society, send them to the dashboard.

import { redirect } from "next/navigation";
import { OnboardingWizard } from "@/components/onboarding/OnboardingWizard";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const metadata = { title: "Join your society — Parisar" };

export default async function OnboardingPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: mem } = await supabase
    .from("society_memberships")
    .select("id")
    .eq("user_id", user.id)
    .maybeSingle();
  if (mem) redirect("/dashboard");

  // Prefill the name if we already have one (a profile from an earlier step, or
  // the name captured at sign-up). Brand-new residents start blank — we don't
  // know their name yet. The mobile, however, is always known and shown by the wizard.
  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name")
    .eq("user_id", user.id)
    .maybeSingle();
  const initialName = profile?.full_name ?? user.user_metadata?.full_name ?? "";

  const phone = user.phone ? `+${user.phone}` : "";
  return <OnboardingWizard phone={phone} userId={user.id} initialName={initialName} />;
}
