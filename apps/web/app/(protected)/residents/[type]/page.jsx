// /residents/{owners|tenants|family} — society-wide lists by resident type.
// Society managers only (the RPC enforces the same rule); everyone else goes home.
// JavaScript only — no TypeScript per CLAUDE.md.

import { notFound, redirect } from "next/navigation";
import { ResidentTypeList } from "@/components/residents/ResidentTypeList";
import { isManagerRole, resolveActiveSociety } from "@/lib/auth/activeSociety";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const SLUGS = new Set(["owners", "tenants", "family"]);

export default async function ResidentTypePage({ params }) {
  const { type } = await params;
  if (!SLUGS.has(type)) notFound();

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { societyId, role } = await resolveActiveSociety(supabase, user);
  if (!societyId) redirect("/onboarding");
  if (!isManagerRole(role)) redirect("/dashboard");

  // Keyed by type so switching tabs starts a fresh list (search, filter, page).
  return <ResidentTypeList key={type} societyId={societyId} slug={type} />;
}
