// /setup/structure — a society authority sets up wings + flats after claiming.
//
// Guarded: only an active authority (secretary or co-secretary) of a society that
// has no flats yet belongs
// here. Anyone else is redirected — a resident cannot reach the society-setup
// screen, and an authority whose society already has flats is sent on.

import { redirect } from "next/navigation";
import { StructureSetup } from "@/components/setup/StructureSetup";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const metadata = { title: "Set up your society — Parisar" };

export default async function StructurePage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // The caller's active authority membership, if any. RLS scopes this to them.
  // Must accept co-secretaries too: /dashboard sends every flat-less authority
  // here, so a narrower check bounced them back and forth forever.
  const { data: mem } = await supabase
    .from("society_memberships")
    .select("society_id, role")
    .eq("user_id", user.id)
    .in("role", ["secretary", "co_secretary"])
    .eq("status", "active")
    .limit(1)
    .maybeSingle();
  if (!mem) redirect("/dashboard");

  // Already has flats? Setup is done.
  const { count } = await supabase
    .from("flats")
    .select("id", { count: "exact", head: true })
    .eq("society_id", mem.society_id);
  if ((count ?? 0) > 0) redirect("/dashboard");

  // The name we already have for the chairman (from society creation, carried
  // into their profile at claim). Pre-filled and editable on the setup screen.
  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name")
    .eq("user_id", user.id)
    .maybeSingle();

  return <StructureSetup societyId={mem.society_id} initialName={profile?.full_name ?? ""} />;
}
