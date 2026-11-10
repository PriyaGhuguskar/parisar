"use client";

// Page frame for /setup/personal around the shared PersonalChoice.

import { useTranslation } from "react-i18next";
import { PageHeader, PageShell } from "@/components/kit";
import { PersonalChoice } from "./PersonalChoice";

export function PersonalChoicePage({ societyId }) {
  const { t } = useTranslation("setup-wizard");
  return (
    <PageShell>
      <PageHeader title={t("personal.pageTitle")} />
      <PersonalChoice societyId={societyId} />
    </PageShell>
  );
}
