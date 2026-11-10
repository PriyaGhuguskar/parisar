"use client";

// One record the society added for this verified phone: the details as the society
// has them, and the three choices. Phones are never shown here.

import { residentConfirmRecord } from "@parisar/api-client";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { ConfirmDialog, Notice, SurfaceCard } from "@/components/kit";
import { errorMessage } from "@/components/onboarding/lib/errors";
import { StateBadge } from "@/components/onboarding/StateBadge";
import { Button } from "@/components/ui/button";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { CorrectionForm } from "./CorrectionForm";
import { ReportIncorrectForm } from "./ReportIncorrectForm";

export function RecordCard({ record, onConfirmed, onUpdated }) {
  const { t } = useTranslation("resident-onboarding");
  const [mode, setMode] = useState("view"); // view | edit | report
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmError, setConfirmError] = useState(null);
  const [notice, setNotice] = useState(null);
  const r = record;
  const open = r.status === "pending";

  async function confirm() {
    setConfirmError(null);
    let res;
    try {
      const supabase = createSupabaseBrowserClient();
      res = await residentConfirmRecord(supabase, r.id);
      if (!res?.error && res.refresh_required) await supabase.auth.refreshSession();
    } catch {
      setConfirmError(t("errors.generic"));
      throw new Error("FAILED");
    }
    if (res?.error) {
      setConfirmError(errorMessage(t, res));
      throw new Error(res.error);
    }
    onConfirmed(r, res);
  }

  function done(updated, message) {
    setMode("view");
    setNotice(message);
    onUpdated(updated);
  }

  const proposed =
    r.proposed_changes && Object.keys(r.proposed_changes).length ? r.proposed_changes : null;

  return (
    <SurfaceCard className="flex flex-col gap-5 p-5 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="type-h3 text-foreground">{r.society_name}</h2>
          <p className="type-body-sm mt-1 text-muted-foreground">
            {t(r.source === "import" ? "verify.sourceImport" : "verify.sourceManual")}
          </p>
        </div>
        <StateBadge kind="record" status={r.status} />
      </div>

      <dl className="grid gap-4 sm:grid-cols-2">
        <Field label={t("verify.name")} value={r.full_name} />
        <Field label={t("verify.flat")} value={r.flat_label} />
        <Field label={t("verify.residentType")} value={t(`residentType.${r.resident_type}`)} />
        <Field label={t("verify.email")} value={r.email} />
      </dl>

      {notice ? (
        <Notice tone="success" onDismiss={() => setNotice(null)}>
          {notice}
        </Notice>
      ) : null}

      {r.status === "needs_correction" ? (
        <Notice tone="warning" title={t("verify.waitingTitle")}>
          {r.reported_incorrect ? t("verify.waitingReported") : t("verify.waitingCorrection")}
          {proposed ? (
            <ul className="mt-2 list-disc ps-5">
              {Object.entries(proposed).map(([k, v]) => (
                <li key={k}>
                  {t(`verify.field.${k}`)}:{" "}
                  {k === "resident_type" ? t(`residentType.${v}`) : String(v)}
                </li>
              ))}
            </ul>
          ) : null}
        </Notice>
      ) : null}

      {open && mode === "view" ? (
        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
          <Button type="button" size="touch" onClick={() => setConfirmOpen(true)}>
            {t("verify.correct")}
          </Button>
          <Button type="button" variant="outline" size="touch" onClick={() => setMode("edit")}>
            {t("verify.edit")}
          </Button>
          <Button type="button" variant="ghost" size="touch" onClick={() => setMode("report")}>
            {t("verify.report")}
          </Button>
        </div>
      ) : null}

      {open && mode === "edit" ? (
        <CorrectionForm record={r} onDone={done} onCancel={() => setMode("view")} />
      ) : null}
      {open && mode === "report" ? (
        <ReportIncorrectForm record={r} onDone={done} onCancel={() => setMode("view")} />
      ) : null}

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        destructive={false}
        title={t("verify.confirmTitle")}
        description={t("verify.confirmBody", { flat: r.flat_label, society: r.society_name })}
        confirmLabel={t("verify.confirmYes")}
        errorMessage={confirmError ?? undefined}
        onConfirm={confirm}
      />
    </SurfaceCard>
  );
}

function Field({ label, value }) {
  const { t } = useTranslation("resident-onboarding");
  return (
    <div>
      <dt className="type-caption text-muted-foreground">{label}</dt>
      <dd className="type-body text-foreground">{value || t("common.notGiven")}</dd>
    </div>
  );
}
