"use client";

// Household requests this person may decide: an owner of the flat (any), a tenant
// of the flat (family only), or a society manager. The requester's full phone is
// never shown, only its last four digits to help recognise them.

import { householdDecideRequest, householdPendingForMe } from "@parisar/api-client";
import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { ErrorState, LoadingState, Notice, SurfaceCard } from "@/components/kit";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { DecisionButtons } from "./DecisionButtons";

export function HouseholdRequests({ onCount }) {
  const { t } = useTranslation("resident-onboarding");
  const [items, setItems] = useState(null);
  const [failed, setFailed] = useState(false);
  const [notice, setNotice] = useState(null);

  const load = useCallback(async () => {
    setFailed(false);
    try {
      const res = await householdPendingForMe(createSupabaseBrowserClient());
      if (res?.error) throw new Error(res.error);
      const list = Array.isArray(res) ? res : [];
      setItems(list);
      onCount?.(list.length);
    } catch {
      setFailed(true);
    }
  }, [onCount]);

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
        <p className="type-body-sm text-muted-foreground">{t("approvals.householdEmpty")}</p>
      ) : null}
      {items.map((r) => (
        <SurfaceCard key={r.id} className="flex flex-col gap-4 p-5 sm:p-6">
          <div>
            <h3 className="type-h3 text-foreground">{r.full_name}</h3>
            <p className="type-body-sm mt-1 text-muted-foreground">
              {t("approvals.householdLine", {
                flat: r.flat_label,
                relationship: t(`relationship.${r.relationship}`),
                type: t(`residentType.${r.resident_type}`),
              })}
            </p>
            {r.phone_last4 ? (
              <p className="type-body-sm text-muted-foreground tabular-nums">
                {t("approvals.phoneEnding", { digits: r.phone_last4 })}
              </p>
            ) : null}
          </div>
          {r.message ? (
            <p className="type-body rounded-lg bg-muted p-3 text-foreground">{r.message}</p>
          ) : null}
          <DecisionButtons
            who={r.full_name}
            approveTitle={t("approvals.householdApproveTitle", {
              name: r.full_name,
              flat: r.flat_label,
            })}
            approveBody={t("approvals.householdApproveBody")}
            decide={(approve, reason) =>
              householdDecideRequest(createSupabaseBrowserClient(), {
                requestId: r.id,
                approve,
                reason,
              })
            }
            onDecided={(_res, approve) => {
              setNotice(
                t(approve ? "approvals.approvedNotice" : "approvals.rejectedNotice", {
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
