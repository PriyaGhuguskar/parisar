"use client";

// Step one of the tenant chain: the flat's owner approves or rejects. The owner
// sees the tenant's name and tenancy dates, never the tenant's phone.

import { ownerListTenantRequests, tenantOwnerDecide } from "@parisar/api-client";
import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { ErrorState, formatDateValue, LoadingState, Notice, SurfaceCard } from "@/components/kit";
import { StateBadge } from "@/components/onboarding/StateBadge";
import { TenantChain } from "@/components/onboarding/TenantChain";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { DecisionButtons } from "./DecisionButtons";

export function TenantFacts({ tenant }) {
  const { t, i18n } = useTranslation("resident-onboarding");
  const day = (iso) => (iso ? formatDateValue(String(iso).slice(0, 10), i18n.language) : iso);
  const rows = [
    [t("tenant.start"), day(tenant.agreement_start)],
    [t("tenant.end"), day(tenant.agreement_end)],
    [t("tenant.police"), t(`status.police.${tenant.police_status}`)],
  ];
  return (
    <dl className="grid gap-3 sm:grid-cols-3">
      {rows.map(([label, value]) => (
        <div key={label}>
          <dt className="type-caption text-muted-foreground">{label}</dt>
          <dd className="type-body text-foreground">{value || t("common.notGiven")}</dd>
        </div>
      ))}
    </dl>
  );
}

export function OwnerTenantRequests() {
  const { t } = useTranslation("resident-onboarding");
  const [items, setItems] = useState(null);
  const [failed, setFailed] = useState(false);
  const [notice, setNotice] = useState(null);

  const load = useCallback(async () => {
    setFailed(false);
    try {
      const res = await ownerListTenantRequests(createSupabaseBrowserClient());
      if (res?.error) throw new Error(res.error);
      setItems(Array.isArray(res) ? res : []);
    } catch {
      setFailed(true);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  if (failed) return <ErrorState description={t("approvals.loadError")} onRetry={load} />;
  if (!items) return <LoadingState variant="list" rows={2} />;

  return (
    <div className="flex flex-col gap-4">
      {notice ? (
        <Notice tone="success" onDismiss={() => setNotice(null)}>
          {notice}
        </Notice>
      ) : null}
      {items.length === 0 ? (
        <p className="type-body-sm text-muted-foreground">{t("approvals.ownerEmpty")}</p>
      ) : null}
      {items.map((r) => (
        <SurfaceCard key={r.id} className="flex flex-col gap-5 p-5 sm:p-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h3 className="type-h3 text-foreground">{r.full_name}</h3>
              <p className="type-body-sm mt-1 text-muted-foreground">
                {t("approvals.tenantFor", { flat: r.flat_label })}
              </p>
            </div>
            <StateBadge kind="tenant" status={r.status} />
          </div>
          <TenantFacts tenant={r} />
          <TenantChain tenant={r} />
          <DecisionButtons
            who={r.full_name}
            approveTitle={t("approvals.ownerApproveTitle", { name: r.full_name })}
            approveBody={t("approvals.ownerApproveBody")}
            decide={(approve, reason) =>
              tenantOwnerDecide(createSupabaseBrowserClient(), { tenantId: r.id, approve, reason })
            }
            onDecided={(_res, approve) => {
              setNotice(
                t(approve ? "approvals.ownerApprovedNotice" : "approvals.rejectedNotice", {
                  name: r.full_name,
                }),
              );
              load();
            }}
          />
        </SurfaceCard>
      ))}
    </div>
  );
}
