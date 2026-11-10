// /import — society managers import residents from an Excel sheet.
//
// Manager-only, like the import RPCs themselves (they refuse everyone else,
// platform staff included). The society code is read here so the template and
// the page can show it; rows must carry it and the server checks each one.
//
// JavaScript only — no TypeScript per CLAUDE.md.

import { redirect } from "next/navigation";
import { ImportResidents } from "@/components/import/ImportResidents";
import { isManagerRole, resolveActiveSociety } from "@/lib/auth/activeSociety";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const metadata = { title: "Import residents — Parisar" };

export default async function ImportPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { societyId, role } = await resolveActiveSociety(supabase, user);
  if (!societyId) redirect("/onboarding");
  if (!isManagerRole(role)) redirect("/dashboard");

  const { data: code } = await supabase
    .from("society_codes")
    .select("code")
    .eq("society_id", societyId)
    .is("revoked_at", null)
    .limit(1)
    .maybeSingle();

  return <ImportResidents societyId={societyId} societyCode={code?.code ?? ""} />;
}
