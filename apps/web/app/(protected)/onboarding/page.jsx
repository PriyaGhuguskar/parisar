// /onboarding — new resident wizard (society code -> details -> family -> PIN).
//
// Reached in `code` mode after OTP (the user is authenticated but has no
// membership yet, so the (protected) layout renders this bare), and by a society
// authority who has claimed but not yet picked their own flat: their flat-less
// authority membership is completed here like any resident's. For them the
// society code is pre-filled, and the PIN step is skipped if they already set one
// during wings/flats setup. Anyone who already has a flat goes to the dashboard.

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

  const { data: memberships } = await supabase
    .from("society_memberships")
    .select("id, society_id, flat_id, status")
    .eq("user_id", user.id);
  const rows = memberships ?? [];
  const flatless = rows.find((m) => m.status === "active" && !m.flat_id) ?? null;
  // Already a resident (any membership that is not a flat-less authority one).
  if (rows.length > 0 && !flatless) redirect("/dashboard");

  // Prefill the name if we already have one (a profile from an earlier step, or
  // the name captured at sign-up). Brand-new residents start blank — we don't
  // know their name yet. The mobile, however, is always known and shown by the wizard.
  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name, pin_set")
    .eq("user_id", user.id)
    .maybeSingle();
  let initialName = profile?.full_name ?? user.user_metadata?.full_name ?? "";

  // An authority already belongs to the society. If its wings/flats haven't been
  // set up yet, that comes first (any authority can do it); otherwise fill in the
  // society code for them so they go straight to picking their flat.
  let initialCode = "";
  if (flatless) {
    const { count: flatCount } = await supabase
      .from("flats")
      .select("id", { count: "exact", head: true })
      .eq("society_id", flatless.society_id);
    if ((flatCount ?? 0) === 0) redirect("/setup/structure");

    const { data: code } = await supabase
      .from("society_codes")
      .select("code")
      .eq("society_id", flatless.society_id)
      .is("revoked_at", null)
      .limit(1)
      .maybeSingle();
    initialCode = code?.code ?? "";

    // Staff already entered the authority's name when adding them — reuse it
    // instead of asking again (they can still edit it in the wizard).
    if (!initialName) {
      const { data: authority } = await supabase
        .from("society_authorities")
        .select("full_name")
        .eq("society_id", flatless.society_id)
        .eq("user_id", user.id)
        .maybeSingle();
      initialName = authority?.full_name ?? "";
    }
  }

  const phone = user.phone ? `+${user.phone}` : "";
  return (
    <OnboardingWizard
      phone={phone}
      userId={user.id}
      initialName={initialName}
      initialCode={initialCode}
      pinAlreadySet={Boolean(flatless && profile?.pin_set)}
    />
  );
}
