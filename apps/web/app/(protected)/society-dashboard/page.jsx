// /society-dashboard — the Society Dashboard for society authorities.
//
// An authority is a person on the society's authority list (the chairman or any
// member chosen to run the app), whatever their society title. Claiming makes
// them a secretary, so the role check covers almost everyone; a claimed
// authority whose role was later changed still gets in through the authority
// list (my_authority_societies, matched on their OTP-verified phone only).
// Anyone else goes back to /dashboard. Every RPC on the page checks again.

import { myAuthoritySocieties } from "@parisar/api-client";
import { redirect } from "next/navigation";
import { SocietyDashboardClient } from "@/components/authorities/SocietyDashboardClient";
import { isManagerRole, resolveActiveSociety } from "@/lib/auth/activeSociety";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const metadata = { title: "Society Dashboard — Parisar" };

/** True when the caller has claimed an authority row for this society. */
async function isClaimedAuthority(supabase, societyId) {
  try {
    const res = await myAuthoritySocieties(supabase);
    if (res?.error) return false;
    return (res?.societies ?? []).some((s) => s.society_id === societyId && s.claimed);
  } catch {
    return false;
  }
}

export default async function SocietyDashboardPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { societyId, role } = await resolveActiveSociety(supabase, user);
  if (!societyId) redirect("/onboarding");
  const manager = isManagerRole(role);
  if (!manager && !(await isClaimedAuthority(supabase, societyId))) redirect("/dashboard");

  return <SocietyDashboardClient societyId={societyId} userId={user.id} />;
}
