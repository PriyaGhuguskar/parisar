// /complaints/new — File a Complaint form.
//
// Server component wrapper:
//   1. Validates session.
//   2. Reads societyId from JWT app_metadata.
//   3. Looks up the current user's active membership to get their flat_id
//      (needed for the file_complaint RPC's p_reporter_flat_id arg).
//   4. Renders the client FileComplaintForm.

import Link from "next/link";
import { redirect } from "next/navigation";
import { FileComplaintForm } from "../../../../components/complaints/FileComplaintForm";
import { resolveActiveSociety } from "../../../../lib/auth/activeSociety";
import { initTranslations, readLocaleFromCookies } from "../../../../lib/i18n/server";
import { createSupabaseServerClient } from "../../../../lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function NewComplaintPage() {
  const lng = await readLocaleFromCookies();
  const { t } = await initTranslations(lng, ["complaints"]);
  const supabase = await createSupabaseServerClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { societyId } = await resolveActiveSociety(supabase, user);
  if (!societyId) redirect("/onboarding");

  // Resolve the caller's flat_id from their active membership in this society.
  let reporterFlatId = null;
  try {
    const { data: membership } = await supabase
      .from("society_memberships")
      .select("flat_id")
      .eq("user_id", user.id)
      .eq("society_id", societyId)
      .eq("status", "active")
      .maybeSingle();
    reporterFlatId = membership?.flat_id ?? null;
  } catch {
    reporterFlatId = null;
  }

  if (!reporterFlatId) {
    // Caller has no active flat membership — can't file a complaint.
    return (
      <div className="min-h-screen bg-[var(--color-neutral-50)] flex flex-col items-center justify-center gap-3 px-8 text-center">
        <h2 className="text-xl font-semibold text-[#171717]">{t("complaint.notActiveMember")}</h2>
        <Link
          href="/complaints"
          className="inline-flex items-center justify-center h-10 px-4 rounded-lg border border-neutral-200 text-sm font-semibold text-[#171717] hover:bg-neutral-50 transition-colors mt-2"
        >
          Back to complaints
        </Link>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[var(--color-neutral-50)]">
      <header className="bg-white border-b border-neutral-200 px-4 h-14 flex items-center gap-3">
        <Link
          href="/complaints"
          className="text-sm text-[#0E5A48] hover:underline"
          aria-label="Back to complaints"
        >
          ← Back
        </Link>
        <h1 className="text-xl font-semibold text-[#171717] truncate">
          {t("complaint.fileTitle")}
        </h1>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-6">
        <div className="bg-white rounded-2xl p-6">
          <FileComplaintForm societyId={societyId} reporterFlatId={reporterFlatId} />
        </div>
      </main>
    </div>
  );
}
