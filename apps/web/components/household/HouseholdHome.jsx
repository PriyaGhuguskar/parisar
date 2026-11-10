"use client";

// /household: my flat. Owners (and my owner details and proofs), family invites
// for owners and tenants, and my tenancy with its documents for tenants.

import { myTenantRegistrations } from "@parisar/api-client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Notice, PageHeader, PageShell } from "@/components/kit";
import { TenantRegistrationCard } from "@/components/onboarding/TenantRegistrationCard";
import { buttonVariants } from "@/components/ui/button";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { FamilyInvites } from "./FamilyInvites";
import { OwnerSection } from "./OwnerSection";

export function HouseholdHome({ societyId, flatId, flatLabel, residentType, userId }) {
  const { t } = useTranslation("resident-onboarding");
  const canInvite = residentType === "owner" || residentType === "tenant";
  const [tenancy, setTenancy] = useState(undefined);
  const [tenancyFailed, setTenancyFailed] = useState(false);

  async function loadTenancy() {
    setTenancyFailed(false);
    try {
      const res = await myTenantRegistrations(createSupabaseBrowserClient());
      if (res?.error) throw new Error(res.error);
      setTenancy(
        (Array.isArray(res) ? res : []).find(
          (r) => r.flat_id === flatId && r.status === "active",
        ) ?? null,
      );
    } catch {
      setTenancyFailed(true);
    }
  }

  // biome-ignore lint/correctness/useExhaustiveDependencies: load once for this flat
  useEffect(() => {
    if (residentType === "tenant") loadTenancy();
  }, [residentType, flatId]);

  return (
    <PageShell>
      <PageHeader
        title={t("householdPage.title", { flat: flatLabel ?? "" })}
        description={t(`householdPage.sub.${residentType ?? "unknown"}`)}
        actions={
          <Link href="/approvals" className={buttonVariants({ variant: "outline", size: "touch" })}>
            {t("householdPage.approvals")}
          </Link>
        }
      />
      <div className="flex flex-col gap-10">
        <section aria-labelledby="hh-owners" className="flex flex-col gap-4">
          <h2 id="hh-owners" className="type-h2 text-foreground">
            {t("householdPage.ownersSection")}
          </h2>
          <OwnerSection
            societyId={societyId}
            flatId={flatId}
            userId={userId}
            isOwner={residentType === "owner"}
          />
        </section>

        {residentType === "tenant" ? (
          <section aria-labelledby="hh-tenancy" className="flex flex-col gap-4">
            <h2 id="hh-tenancy" className="type-h2 text-foreground">
              {t("householdPage.tenancySection")}
            </h2>
            {tenancyFailed ? (
              <Notice tone="danger">{t("householdPage.tenancyError")}</Notice>
            ) : null}
            {tenancy ? (
              <TenantRegistrationCard
                registration={tenancy}
                userId={userId}
                onChanged={loadTenancy}
              />
            ) : null}
            {tenancy === null ? (
              <p className="type-body-sm text-muted-foreground">{t("householdPage.noTenancy")}</p>
            ) : null}
          </section>
        ) : null}

        <section aria-labelledby="hh-family" className="flex flex-col gap-4">
          <h2 id="hh-family" className="type-h2 text-foreground">
            {t("householdPage.familySection")}
          </h2>
          {canInvite ? (
            <FamilyInvites societyId={societyId} />
          ) : (
            <p className="type-body-sm text-muted-foreground">
              {t("householdPage.familyOnlyOwners")}
            </p>
          )}
        </section>
      </div>
    </PageShell>
  );
}
