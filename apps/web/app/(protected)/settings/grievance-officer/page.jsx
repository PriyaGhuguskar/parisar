// /settings/grievance-officer — admin-only Grievance Officer settings (web). UI-SPEC
// Screen 9a (D-06).
//
// Server component:
//   1. Validates session + reads societyId + role from JWT app_metadata.
//   2. ADMIN-GATE (T-06-27 defence in depth): non-admin roles redirect to /dashboard.
//      set_grievance_officer is also admin-gated server-side.
//   3. getGrievanceOfficer (COALESCEs to the Secretary; is_default flags it) →
//      pre-fills the form.
//   4. Renders the client GrievanceOfficerForm (Save → setGrievanceOfficerAction).

import { getGrievanceOfficer } from "@parisar/api-client";
import Link from "next/link";
import { redirect } from "next/navigation";
import { GrievanceOfficerForm } from "../../../../components/community/GrievanceOfficerForm";
import { resolveActiveSociety } from "../../../../lib/auth/activeSociety";
import { initTranslations, readLocaleFromCookies } from "../../../../lib/i18n/server";
import { createSupabaseServerClient } from "../../../../lib/supabase/server";

export const dynamic = "force-dynamic";

const ADMIN_ROLES = new Set(["co_secretary", "secretary"]);

export default async function GrievanceOfficerSettingsPage() {
  const lng = await readLocaleFromCookies();
  const { t } = await initTranslations(lng, ["moderation"]);
  const supabase = await createSupabaseServerClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { societyId, role } = await resolveActiveSociety(supabase, user);
  if (!societyId) redirect("/onboarding");

  // Admin-gate (D-06): only the Secretary/Co-Secretary set the Grievance Officer.
  if (!ADMIN_ROLES.has(role)) redirect("/dashboard");

  let officer = null;
  try {
    officer = await getGrievanceOfficer(supabase);
  } catch {
    officer = null;
  }

  return (
    <div className="min-h-screen bg-[var(--color-neutral-50)]">
      <header className="bg-white border-b border-neutral-200 px-4 h-14 flex items-center gap-3">
        <Link
          href="/dashboard"
          className="text-sm text-[#0E5A48] hover:underline"
          aria-label="Back to dashboard"
        >
          ← Dashboard
        </Link>
        <h1 className="text-xl font-semibold text-[#171717] truncate">
          {t("grievance.settingsTitle")}
        </h1>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-6">
        <div className="bg-white rounded-2xl p-6">
          <GrievanceOfficerForm
            initialName={officer?.is_default ? "" : (officer?.name ?? "")}
            initialContact={officer?.is_default ? "" : (officer?.contact ?? "")}
            isDefault={!!officer?.is_default}
          />
        </div>
      </main>
    </div>
  );
}
