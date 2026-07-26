// /flat-actions/new — admin-only Issue Action form (web). UI-SPEC Screen 1.
//
// Server component:
//   1. Validates session + reads societyId + role from JWT app_metadata.
//   2. ADMIN-GATE (T-06-17 defence in depth): non-admin roles redirect to
//      /flat-actions. The issue_flat_action RPC also enforces admin-only server-side.
//   3. Loads the society's flats for the picker.
//   4. Renders the client IssueActionForm.

import Link from "next/link";
import { redirect } from "next/navigation";
import { IssueActionForm } from "../../../../components/flat-actions/IssueActionForm";
import { resolveActiveSociety } from "../../../../lib/auth/activeSociety";
import { initTranslations, readLocaleFromCookies } from "../../../../lib/i18n/server";
import { createSupabaseServerClient } from "../../../../lib/supabase/server";

export const dynamic = "force-dynamic";

const ADMIN_ROLES = new Set(["co_secretary", "secretary"]);

export default async function NewFlatActionPage() {
  const lng = await readLocaleFromCookies();
  const { t } = await initTranslations(lng, ["flat-actions"]);
  const supabase = await createSupabaseServerClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { societyId, role } = await resolveActiveSociety(supabase, user);
  if (!societyId) redirect("/onboarding");

  // Admin-gate: only the Secretary/Co-Secretary issue flat actions (FLAT-01 / D-04).
  if (!ADMIN_ROLES.has(role)) redirect("/flat-actions");

  let flats = [];
  try {
    const { data } = await supabase
      .from("flats")
      .select("id, number, wing:wing_id ( name )")
      .eq("society_id", societyId)
      .order("number", { ascending: true });
    flats = data ?? [];
  } catch {
    flats = [];
  }

  return (
    <div className="min-h-screen bg-[var(--color-neutral-50)]">
      <header className="bg-white border-b border-neutral-200 px-4 h-14 flex items-center gap-3">
        <Link
          href="/flat-actions"
          className="text-sm text-[#0E5A48] hover:underline"
          aria-label="Back to flat actions"
        >
          ← Back
        </Link>
        <h1 className="text-xl font-semibold text-[#171717] truncate">
          {t("flatAction.issueTitle")}
        </h1>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-6">
        <div className="bg-white rounded-2xl p-6">
          <IssueActionForm societyId={societyId} flats={flats} />
        </div>
      </main>
    </div>
  );
}
