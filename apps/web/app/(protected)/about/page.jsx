// /about — About & Help (web, all roles). UI-SPEC Screen 9b (COMM-05).
//
// Server component: surfaces the Grievance Officer READ-ONLY (defaults to the
// Secretary via the server COALESCE when unset — the IT Rules 2021 named-officer
// requirement is never unmet) + a minimal app/version block.

import { getGrievanceOfficer } from "@parisar/api-client";
import Link from "next/link";
import { redirect } from "next/navigation";
import { GrievanceOfficerCard } from "../../../components/community/GrievanceOfficerCard";
import { initTranslations, readLocaleFromCookies } from "../../../lib/i18n/server";
import { createSupabaseServerClient } from "../../../lib/supabase/server";

export const dynamic = "force-dynamic";

const APP_VERSION = "0.1.0";

export default async function AboutPage() {
  const lng = await readLocaleFromCookies();
  const { t } = await initTranslations(lng, ["moderation"]);
  const supabase = await createSupabaseServerClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

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
        <h1 className="text-xl font-semibold text-[#171717] truncate">{t("about.title")}</h1>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-6 flex flex-col gap-4">
        <GrievanceOfficerCard officer={officer} />

        <div className="bg-white rounded-xl p-6 flex flex-col gap-1">
          <span className="text-xl font-semibold text-[#171717]">Parisar</span>
          <span className="text-sm text-[#6e6e6e]">Version {APP_VERSION}</span>
        </div>
      </main>
    </div>
  );
}
