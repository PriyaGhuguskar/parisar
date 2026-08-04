"use client";

// SocietyProfileClient — the Society profile page shell: the wings/flats/guards
// overview (SocietyOverview) plus amenities-with-status (AmenitiesSection).

import { useTranslation } from "react-i18next";
import { PageHeader, PageShell } from "@/components/kit";
import { SocietyOverview } from "@/components/profile/SocietyOverview";
import { AmenitiesSection } from "./AmenitiesSection";

export function SocietyProfileClient({ society, structure }) {
  const { t } = useTranslation("auth");
  const { t: tNav } = useTranslation("dashboard");

  return (
    <PageShell>
      <PageHeader
        backHref="/dashboard"
        backLabel={tNav("nav.home")}
        title={t("profile.societyProfile")}
        description={t("profile.societyProfileLead")}
      />
      <div className="flex flex-col gap-10">
        <SocietyOverview society={society} structure={structure} />
        <AmenitiesSection societyId={society.id} />
      </div>
    </PageShell>
  );
}
