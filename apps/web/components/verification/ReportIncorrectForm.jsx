"use client";

// "Report incorrect": the details are not about this person, or are wrong in a way
// they cannot fix themselves. The society reviews it.

import { residentReportIncorrect } from "@parisar/api-client";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { FormActions, FormField, Notice, SurfaceCard, TextArea } from "@/components/kit";
import { errorMessage } from "@/components/onboarding/lib/errors";
import { checkReason } from "@/components/onboarding/lib/validation";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

export function ReportIncorrectForm({ record, onDone, onCancel }) {
  const { t } = useTranslation("resident-onboarding");
  const [reason, setReason] = useState("");
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [serverError, setServerError] = useState(null);

  async function submit(e) {
    e.preventDefault();
    const problem = checkReason(reason);
    setError(problem);
    if (problem) {
      document.getElementById(`report-${record.id}`)?.focus();
      return;
    }
    setBusy(true);
    setServerError(null);
    try {
      const res = await residentReportIncorrect(createSupabaseBrowserClient(), {
        recordId: record.id,
        reason: reason.trim(),
      });
      if (res?.error) {
        setServerError(errorMessage(t, res));
        return;
      }
      onDone(res, t("verify.reportSent"));
    } catch {
      setServerError(t("errors.generic"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-5" noValidate>
      <SurfaceCard className="flex flex-col gap-5 p-5 sm:p-6">
        <h3 className="type-h3 text-foreground">{t("verify.reportTitle")}</h3>
        <FormField
          label={t("verify.reportReason")}
          required
          hint={t("verify.reportHint")}
          error={error ? t(error) : undefined}
        >
          <TextArea
            id={`report-${record.id}`}
            rows={4}
            maxLength={500}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
        </FormField>
      </SurfaceCard>
      {serverError ? <Notice tone="danger">{serverError}</Notice> : null}
      <FormActions
        submitLabel={t("verify.sendReport")}
        submitting={busy}
        onCancel={onCancel}
        cancelLabel={t("common.cancel")}
      />
    </form>
  );
}
