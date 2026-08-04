// apps/web/app/guard/page.jsx
// The gate guard's home — deliberately OUTSIDE (protected) so a guard never gets
// the resident sidebar/shell. A guard has no society_membership; we resolve their
// society from society_guards (RLS society_guards_self scopes it to their own row).
// Anyone who isn't an active guard is bounced to /login (revealing nothing).
//
// JavaScript only — no TypeScript per CLAUDE.md.

import { redirect } from "next/navigation";
import { GuardClient } from "../../components/guard/GuardClient";
import { createSupabaseServerClient } from "../../lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function GuardPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: guard } = await supabase
    .from("society_guards")
    .select("id, society_id, name, societies:society_id(name)")
    .eq("user_id", user.id)
    .eq("status", "active")
    .maybeSingle();

  if (!guard) redirect("/login");

  return <GuardClient guardName={guard.name} societyName={guard.societies?.name ?? "Society"} />;
}
