"use client";

// Step two of the tenant chain, for society managers: review details and
// documents, approve or reject, record police verification, and activate an
// approved tenancy. A registered request can be decided here only when the flat
// has no owner on record; otherwise the server answers OWNER_APPROVAL_REQUIRED.

import {
  managerListTenants,
  managerSetTenantPoliceStatus,
  tenantActivate,
  tenantAdminDecide,
} from "@parisar/api-client";
import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  ErrorState,
  FormField,
  LoadingState,
  Notice,
  SearchableSelect,
  SurfaceCard,
} from "@/components/kit";
import { errorMessage } from "@/components/onboarding/lib/errors";
import { ProofList } from "@/components/onboarding/ProofList";
import { StateBadge } from "@/components/onboarding/StateBadge";
import { TenantChain } from "@/components/onboarding/TenantChain";
import { TENANT_DOCS, TENANT_REQUIRED_DOCS } from "@/components/onboarding/TenantRegistrationCard";
import { Button } from "@/components/ui/button";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { DecisionButtons } from "./DecisionButtons";
import { TenantFacts } from "./OwnerTenantRequests";

const WAITING = ["owner_approved", "registered", "admin_approved"];
const POLICE = ["not_submitted", "submitted", "verified", "rejected"];

export function AdminTenantApprovals({ societyId, userId }) {
  const { t } = useTranslation("resident-onboarding");
  const [items, setItems] = useState(null);
  const [failed, setFailed] = useState(false);
  const [notice, setNotice] = useState(null);

  const load = useCallback(async () => {
    setFailed(false);
    try {
      const sb = createSupabaseBrowserClient();
      const pages = await Promise.all(
        WAITING.map((status) => managerListTenants(sb, { societyId, status, limit: 100 })),
      );
      const bad = pages.find((p) => p?.error);
      if (bad) throw new Error(bad.error);
      setItems(pages.flatMap((p) => p.items ?? []));
    } catch {
      setFailed(true);
    }
  }, [societyId]);

  useEffect(() => {
    load();
  }, [load]);

  function report(message) {
    setNotice(message);
    load();
  }

  if (failed) return <ErrorState description={t("approvals.loadError")} onRetry={load} />;
  if (!items) return <LoadingState variant="list" rows={2} />;

  return (
    <div className="flex flex-col gap-4">
      {notice ? (
        <Notice tone={notice.tone} onDismiss={() => setNotice(null)}>
          {notice.text}
        </Notice>
      ) : null}
      {items.length === 0 ? (
        <p className="type-body-sm text-muted-foreground">{t("approvals.adminEmpty")}</p>
      ) : null}
      {items.map((r) => (
        <AdminTenantCard
          key={r.id}
          tenant={r}
          societyId={societyId}
          userId={userId}
          onReport={report}
        />
      ))}
    </div>
  );
}

function AdminTenantCard({ tenant: r, societyId, userId, onReport }) {
  const { t } = useTranslation("resident-onboarding");
  const [police, setPolice] = useState(r.police_status);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  async function run(fn, successKey) {
    setBusy(true);
    setError(null);
    try {
      const res = await fn(createSupabaseBrowserClient());
      if (res?.error) {
        setError(errorMessage(t, res));
        return;
      }
      onReport({ tone: "success", text: t(successKey, { name: r.full_name }) });
    } catch {
      setError(t("errors.generic"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <SurfaceCard className="flex flex-col gap-5 p-5 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="type-h3 text-foreground">{r.full_name}</h3>
          <p className="type-body-sm mt-1 text-muted-foreground tabular-nums">
            {t("approvals.tenantFor", { flat: r.flat_label })}
            {r.phone ? ` · ${r.phone}` : ""}
          </p>
          {r.owner_name ? (
            <p className="type-body-sm text-muted-foreground">
              {t("approvals.ownerTyped", {
                name: r.owner_name,
                phone: r.owner_phone ?? t("common.notGiven"),
              })}
            </p>
          ) : null}
        </div>
        <StateBadge kind="tenant" status={r.status} />
      </div>
      <TenantFacts tenant={r} />
      <TenantChain tenant={r} />

      <div className="flex flex-col gap-3">
        <h4 className="type-label text-foreground">{t("tenantCard.docs")}</h4>
        <ProofList
          subjectKind="tenant"
          subjectId={r.id}
          societyId={societyId}
          userId={userId}
          docTypes={TENANT_DOCS}
          required={TENANT_REQUIRED_DOCS}
          canUpload={false}
        />
      </div>

      <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
        <FormField label={t("tenant.police")} className="flex-1">
          <SearchableSelect
            options={POLICE.map((p) => ({ value: p, label: t(`status.police.${p}`) }))}
            value={police}
            onChange={(v) => v && setPolice(v)}
          />
        </FormField>
        <Button
          type="button"
          variant="outline"
          size="touch"
          disabled={busy || police === r.police_status}
          onClick={() =>
            run(
              (sb) => managerSetTenantPoliceStatus(sb, { tenantId: r.id, status: police }),
              "approvals.policeSaved",
            )
          }
        >
          {t("approvals.savePolice")}
        </Button>
      </div>

      {error ? <Notice tone="danger">{error}</Notice> : null}

      {r.status === "admin_approved" ? (
        <Button
          type="button"
          size="touch"
          className="self-start"
          disabled={busy}
          onClick={() => run((sb) => tenantActivate(sb, r.id), "approvals.activatedNotice")}
        >
          {t("approvals.activate")}
        </Button>
      ) : (
        <DecisionButtons
          who={r.full_name}
          approveTitle={t("approvals.adminApproveTitle", { name: r.full_name })}
          approveBody={t("approvals.adminApproveBody")}
          decide={(approve, reason) =>
            tenantAdminDecide(createSupabaseBrowserClient(), { tenantId: r.id, approve, reason })
          }
          onDecided={(_res, approve) =>
            onReport({
              tone: "success",
              text: t(approve ? "approvals.adminApprovedNotice" : "approvals.rejectedNotice", {
                name: r.full_name,
              }),
            })
          }
        />
      )}
    </SurfaceCard>
  );
}
