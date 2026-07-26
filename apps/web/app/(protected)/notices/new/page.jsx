// /notices/new — board-only society-notice composer (UI-SPEC Screen 2).
//
// Server component:
//   1. Validates the session + reads societyId + role from JWT app_metadata.
//   2. BOARD-GATE (T-05-02 defense in depth): non-board roles are redirected to
//      /notices. The file_notification RPC also enforces the role server-side.
//   3. Renders the client NoticeComposer.

import { redirect } from "next/navigation";
import { PageHeader, PageShell, SurfaceCard } from "@/components/kit";
import { NoticeComposer } from "../../../../components/notices/NoticeComposer";
import { resolveActiveSociety } from "../../../../lib/auth/activeSociety";
import { initTranslations, readLocaleFromCookies } from "../../../../lib/i18n/server";
import { createSupabaseServerClient } from "../../../../lib/supabase/server";

export const dynamic = "force-dynamic";

const BOARD_ROLES = new Set(["board_member", "co_secretary", "secretary"]);

export default async function NewNoticePage() {
  const lng = await readLocaleFromCookies();
  const { t } = await initTranslations(lng, ["notifications"]);
  const supabase = await createSupabaseServerClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { societyId, role } = await resolveActiveSociety(supabase, user);
  if (!societyId) redirect("/onboarding");

  // Board-gate: members never reach the composer (NOTF-01).
  if (!BOARD_ROLES.has(role)) redirect("/notices");

  return (
    <div className="min-h-screen bg-[var(--color-neutral-50)]">
      <PageShell width="narrow">
        <PageHeader
          title={t("notice.composeTitle")}
          backHref="/notices"
          backLabel={t("notice.listTitle")}
        />
        <SurfaceCard className="pk-in p-5 sm:p-6">
          <NoticeComposer societyId={societyId} />
        </SurfaceCard>
      </PageShell>
    </div>
  );
}
