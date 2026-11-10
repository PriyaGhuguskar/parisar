// /household: the signed-in resident's own flat (owners, proofs, tenancy, family
// invites). resident_dashboard resolves the active society and flat server-side.

import { residentDashboard } from "@parisar/api-client";
import { redirect } from "next/navigation";
import { HouseholdHome } from "@/components/household/HouseholdHome";
import { ErrorState, PageShell } from "@/components/kit";
import { getServerT } from "@/lib/i18n/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const metadata = { title: "My household — Parisar" };

export default async function HouseholdPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  let home;
  try {
    home = await residentDashboard(supabase);
  } catch {
    const { t } = await getServerT(["resident-onboarding"]);
    return (
      <PageShell width="narrow">
        <ErrorState description={t("householdPage.loadError")} />
      </PageShell>
    );
  }
  if (home?.error || !home?.flat_id) redirect("/onboarding");

  return (
    <HouseholdHome
      societyId={home.society_id}
      flatId={home.flat_id}
      flatLabel={home.flat_label}
      residentType={home.resident_type}
      userId={user.id}
    />
  );
}
