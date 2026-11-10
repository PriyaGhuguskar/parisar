"use client";

// The tenant approval chain, always visible: registered -> owner -> society -> active.
// Each step says in words whether it is done, waiting, skipped or rejected.

import { useTranslation } from "react-i18next";
import { formatDateValue, Stepper } from "@/components/kit";

/** Steps with status for the kit Stepper. Pure, for tests. */
export function tenantChainSteps(tenant, t, lng) {
  const day = (iso) => (iso ? formatDateValue(String(iso).slice(0, 10), lng) : "");
  const s = tenant.status;
  const rejectedAt = tenant.rejected_stage;

  const owner = (() => {
    if (rejectedAt === "owner") return { status: "error", description: t("chain.ownerRejected") };
    if (tenant.owner_step_skipped)
      return { status: "complete", description: t("chain.ownerSkipped") };
    if (tenant.owner_approved_at)
      return {
        status: "complete",
        description: t("chain.doneOn", { date: day(tenant.owner_approved_at) }),
      };
    return {
      status: s === "registered" ? "current" : "upcoming",
      description: t("chain.ownerWaiting"),
    };
  })();

  const society = (() => {
    if (rejectedAt === "admin") return { status: "error", description: t("chain.societyRejected") };
    if (tenant.admin_approved_at)
      return {
        status: "complete",
        description: t("chain.doneOn", { date: day(tenant.admin_approved_at) }),
      };
    return {
      status: s === "owner_approved" ? "current" : "upcoming",
      description: t("chain.societyWaiting"),
    };
  })();

  const active = (() => {
    if (s === "active")
      return {
        status: "complete",
        description: t("chain.doneOn", { date: day(tenant.activated_at) }),
      };
    if (s === "admin_approved")
      return {
        status: "current",
        description: t("chain.startsOn", { date: day(tenant.agreement_start) }),
      };
    return { status: "upcoming", description: t("chain.activeWaiting") };
  })();

  return [
    {
      id: "registered",
      label: t("chain.registered"),
      status: "complete",
      description: t("chain.doneOn", { date: day(tenant.created_at) }),
    },
    { id: "owner", label: t("chain.owner"), ...owner },
    { id: "society", label: t("chain.society"), ...society },
    { id: "active", label: t("chain.active"), ...active },
  ];
}

export function TenantChain({ tenant }) {
  const { t, i18n } = useTranslation("resident-onboarding");
  return (
    <Stepper
      orientation="vertical"
      steps={tenantChainSteps(tenant, t, i18n.language)}
      current={0}
      aria-label={t("chain.title")}
    />
  );
}
