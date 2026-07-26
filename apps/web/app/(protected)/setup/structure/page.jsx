// /setup/structure — chairman sets up wings + flats after claiming.
//
// Guarded: only the active secretary of a society that has no flats yet belongs
// here. Anyone else is redirected — a resident cannot reach the society-setup
// screen, and a chairman who already finished setup is sent to the dashboard.

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

  // The caller's active secretary membership, if any. RLS scopes this to them.
  const { data: mem } = await supabase
    .from("society_memberships")
    .select("society_id, role")
    .eq("user_id", user.id)
    .eq("role", "secretary")
    .eq("status", "active")
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
