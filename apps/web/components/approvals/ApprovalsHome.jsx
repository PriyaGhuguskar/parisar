"use client";

// /approvals: everything waiting on this person's decision. Household requests
// and tenant requests for flats they own; for society managers also the
// society's step of the tenant chain. Sections the person cannot act on are not shown.

import { useTranslation } from "react-i18next";
import { PageHeader, PageShell } from "@/components/kit";
import { AdminTenantApprovals } from "./AdminTenantApprovals";
import { HouseholdRequests } from "./HouseholdRequests";
import { OwnerTenantRequests } from "./OwnerTenantRequests";

export function ApprovalsHome({ societyId, userId, isManager, isOwner }) {
  const { t } = useTranslation("resident-onboarding");
  return (
    <PageShell>
      <PageHeader
        title={t("approvals.title")}
        description={t("approvals.sub")}
        backHref="/dashboard"
        backLabel={t("common.dashboard")}
      />
      <div className="flex flex-col gap-10">
        <section aria-labelledby="ap-household" className="flex flex-col gap-4">
          <div>
            <h2 id="ap-household" className="type-h2 text-foreground">
              {t("approvals.householdSection")}
            </h2>
            <p className="type-body-sm mt-1 text-muted-foreground">
              {t("approvals.householdHint")}
            </p>
          </div>
          <HouseholdRequests />
        </section>

        {isOwner ? (
          <section aria-labelledby="ap-owner" className="flex flex-col gap-4">
            <div>
              <h2 id="ap-owner" className="type-h2 text-foreground">
                {t("approvals.ownerSection")}
              </h2>
              <p className="type-body-sm mt-1 text-muted-foreground">{t("approvals.ownerHint")}</p>
            </div>
            <OwnerTenantRequests />
          </section>
        ) : null}

        {isManager ? (
          <section aria-labelledby="ap-admin" className="flex flex-col gap-4">
            <div>
              <h2 id="ap-admin" className="type-h2 text-foreground">
                {t("approvals.adminSection")}
              </h2>
              <p className="type-body-sm mt-1 text-muted-foreground">{t("approvals.adminHint")}</p>
            </div>
            <AdminTenantApprovals societyId={societyId} userId={userId} />
          </section>
        ) : null}
      </div>
    </PageShell>
  );
}
