"use client";

// Manager review of one resident record: see what the resident proposed or
// reported, then apply changes (optionally moving the record to another flat),
// reject with a reason, or reopen. Verified records are read-only.

import { managerReviewResidentRecord } from "@parisar/api-client";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { FormField, Notice, SearchableSelect, SurfaceCard, TextArea } from "@/components/kit";
import { errorMessage } from "@/components/onboarding/lib/errors";
import { checkReason } from "@/components/onboarding/lib/validation";
import { StateBadge } from "@/components/onboarding/StateBadge";
import { Button } from "@/components/ui/button";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

export function ReviewPanel({ record, flatOptions, onDone, onClose }) {
  const { t } = useTranslation("resident-onboarding");
  const r = record;
  const [flatId, setFlatId] = useState("");
  const [reason, setReason] = useState("");
  const [reasonError, setReasonError] = useState(null);
  const [busy, setBusy] = useState(null);
  const [error, setError] = useState(null);
  const proposal =
    r.proposed_changes && Object.keys(r.proposed_changes).length ? r.proposed_changes : null;
  const canApply = r.status === "needs_correction" || r.status === "pending";

  async function act(action) {
    setError(null);
    if (action === "reject") {
      const problem = checkReason(reason);
      setReasonError(problem);
      if (problem) {
        document.getElementById("review-reason")?.focus();
        return;
      }
    }
    if (action === "apply_changes" && !proposal && !flatId) {
      setError(t("admin.nothingToApply"));
      return;
    }
    setBusy(action);
    try {
      const res = await managerReviewResidentRecord(createSupabaseBrowserClient(), {
        recordId: r.id,
        action,
        flatId: action === "apply_changes" && flatId ? flatId : null,
        reason: action === "reject" ? reason.trim() : null,
      });
      if (res?.error) {
        setError(errorMessage(t, res));
        return;
      }
      onDone(res, t(`admin.done.${action}`));
    } catch {
      setError(t("errors.generic"));
    } finally {
      setBusy(null);
    }
  }

  return (
    <SurfaceCard className="flex flex-col gap-5 p-5 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 id="review-heading" tabIndex={-1} className="type-h3 text-foreground">
            {t("admin.reviewTitle", { name: r.full_name })}
          </h2>
          <p className="type-body-sm mt-1 text-muted-foreground">
            {r.flat_label} · {t(`residentType.${r.resident_type}`)} · {r.phone}
          </p>
        </div>
        <StateBadge kind="record" status={r.status} />
      </div>

      {r.reported_incorrect ? (
        <Notice tone="warning" title={t("admin.reported")}>
          {r.correction_note || t("common.notGiven")}
        </Notice>
      ) : null}
      {proposal ? (
        <Notice tone="info" title={t("admin.proposal")}>
          <ul className="list-disc ps-5">
            {Object.entries(proposal).map(([k, v]) => (
              <li key={k}>
                {t(`verify.field.${k}`)}:{" "}
                {k === "resident_type" ? t(`residentType.${v}`) : String(v)}
              </li>
            ))}
          </ul>
          {r.correction_note && !r.reported_incorrect ? (
            <p className="mt-2">{r.correction_note}</p>
          ) : null}
        </Notice>
      ) : null}
      {r.status === "rejected" && r.rejection_reason ? (
        <p className="type-body-sm text-muted-foreground">
          {t("statusPage.reason", { reason: r.rejection_reason })}
        </p>
      ) : null}

      {canApply ? (
        <FormField label={t("admin.moveFlat")} optional hint={t("admin.moveFlatHint")}>
          <SearchableSelect
            options={flatOptions ?? []}
            loading={!flatOptions}
            value={flatId}
            clearable
            placeholder={t("details.flatPlaceholder")}
            emptyText={t("details.noMatch")}
            onChange={(v) => setFlatId(v)}
          />
        </FormField>
      ) : null}
      {r.status !== "verified" && r.status !== "rejected" ? (
        <FormField
          label={t("admin.rejectReason")}
          hint={t("admin.rejectHint")}
          error={reasonError ? t(reasonError) : undefined}
        >
          <TextArea
            id="review-reason"
            rows={2}
            maxLength={500}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
        </FormField>
      ) : null}

      {error ? <Notice tone="danger">{error}</Notice> : null}

      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
        {canApply ? (
          <Button
            type="button"
            size="touch"
            disabled={Boolean(busy)}
            onClick={() => act("apply_changes")}
          >
            {t("admin.apply")}
          </Button>
        ) : null}
        {r.status === "needs_correction" || r.status === "rejected" ? (
          <Button
            type="button"
            variant="outline"
            size="touch"
            disabled={Boolean(busy)}
            onClick={() => act("reopen")}
          >
            {t("admin.reopen")}
          </Button>
        ) : null}
        {r.status !== "verified" && r.status !== "rejected" ? (
          <Button
            type="button"
            variant="destructive"
            size="touch"
            disabled={Boolean(busy)}
            onClick={() => act("reject")}
          >
            {t("admin.reject")}
          </Button>
        ) : null}
        <Button
          type="button"
          variant="ghost"
          size="touch"
          disabled={Boolean(busy)}
          onClick={onClose}
        >
          {t("common.close")}
        </Button>
      </div>
    </SurfaceCard>
  );
}
