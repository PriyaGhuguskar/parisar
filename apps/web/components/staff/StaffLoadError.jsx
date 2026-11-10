"use client";

// Shown when a staff record could not be loaded (network or server trouble, not
// "not found", which is a 404). Retry re-runs the server page.
// JavaScript only — no TypeScript per CLAUDE.md.

import { useRouter } from "next/navigation";
import { useTranslation } from "react-i18next";
import { ErrorState, PageHeader, PageShell } from "@/components/kit";

export function StaffLoadError() {
  const { t } = useTranslation("staff-nav");
  const router = useRouter();
  return (
    <PageShell width="narrow">
      <PageHeader
        title={t("staffList.title")}
        backHref="/staff/manage"
        backLabel={t("nav.staffManage")}
      />
      <ErrorState description={t("staffForm.loadFailed")} onRetry={() => router.refresh()} />
    </PageShell>
  );
}
