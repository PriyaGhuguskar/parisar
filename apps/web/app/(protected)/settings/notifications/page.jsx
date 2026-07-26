// /settings/notifications — notification preferences (UI-SPEC Screen 7).
//
// Server component (D-05/D-06):
//   1. Validates session + reads societyId from JWT app_metadata.
//   2. ensureNotificationPreferences (idempotent UPSERT, D-05) so a row exists.
//   3. getNotificationPreferences reads the EFFECTIVE VIEW (D-06) so the D-04
//      defaults render instantly (no blank/loading state) and match the fan-out.
//   4. Hands the effective prefs to PreferencesClient (debounced server-action writes).

import { ensureNotificationPreferences, getNotificationPreferences } from "@parisar/api-client";
import Link from "next/link";
import { redirect } from "next/navigation";
import { PreferencesClient } from "../../../../components/settings/PreferencesClient";
import { resolveActiveSociety } from "../../../../lib/auth/activeSociety";
import { initTranslations, readLocaleFromCookies } from "../../../../lib/i18n/server";
import { createSupabaseServerClient } from "../../../../lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function NotificationSettingsPage() {
  const lng = await readLocaleFromCookies();
  const { t } = await initTranslations(lng, ["preferences"]);
  const supabase = await createSupabaseServerClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { societyId } = await resolveActiveSociety(supabase, user);
  if (!societyId) redirect("/onboarding");

  // D-05 backstop: ensure the row exists before reading the effective VIEW.
  try {
    await ensureNotificationPreferences(supabase, societyId);
  } catch {
    // The effective VIEW COALESCEs defaults even without a row, so a failed
    // ensure is non-fatal — defaults still render (D-06).
  }

  let prefs = null;
  try {
    prefs = await getNotificationPreferences(supabase, societyId, user.id);
  } catch {
    prefs = null;
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
        <h1 className="text-xl font-semibold text-[#171717] truncate">{t("prefs.title")}</h1>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-6">
        <PreferencesClient societyId={societyId} initialPrefs={prefs} />
      </main>
    </div>
  );
}
