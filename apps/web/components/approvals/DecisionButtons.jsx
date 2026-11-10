"use client";

// Approve / Reject pair. Rejecting needs a reason (3 to 500), asked inside the
// dialog. `decide(approve, reason)` returns the RPC result; an { error } keeps the
// dialog open with the message, so a failed decision never looks done.

import { useState } from "react";
import { useTranslation } from "react-i18next";
import { ConfirmDialog, FormField, TextArea } from "@/components/kit";
import { errorMessage } from "@/components/onboarding/lib/errors";
import { checkReason } from "@/components/onboarding/lib/validation";
import { Button } from "@/components/ui/button";

export function DecisionButtons({
  decide,
  onDecided,
  approveTitle,
  approveBody,
  approveLabel,
  who,
}) {
  const { t } = useTranslation("resident-onboarding");
  const [open, setOpen] = useState(null); // "approve" | "reject"
  const [reason, setReason] = useState("");
  const [reasonError, setReasonError] = useState(null);
  const [error, setError] = useState(null);

  async function run(approve) {
    setError(null);
    if (!approve) {
      const problem = checkReason(reason);
      setReasonError(problem);
      if (problem) {
        setError(t(problem));
        throw new Error(problem);
      }
    }
    let res;
    try {
      res = await decide(approve, approve ? null : reason.trim());
    } catch {
      setError(t("errors.generic"));
      throw new Error("FAILED");
    }
    if (res?.error) {
      setError(errorMessage(t, res));
      throw new Error(res.error);
    }
    setReason("");
    onDecided(res, approve);
  }

  function openDialog(kind) {
    setError(null);
    setReasonError(null);
    setOpen(kind);
  }

  return (
    <>
      <div className="flex flex-col gap-2 sm:flex-row">
        <Button type="button" size="touch" onClick={() => openDialog("approve")}>
          {approveLabel ?? t("approvals.approve")}
        </Button>
        <Button type="button" variant="outline" size="touch" onClick={() => openDialog("reject")}>
          {t("approvals.reject")}
        </Button>
      </div>
      <ConfirmDialog
        open={open === "approve"}
        onOpenChange={(o) => !o && setOpen(null)}
        destructive={false}
        title={approveTitle}
        description={approveBody}
        confirmLabel={approveLabel ?? t("approvals.approve")}
        errorMessage={error ?? undefined}
        onConfirm={() => run(true)}
      />
      <ConfirmDialog
        open={open === "reject"}
        onOpenChange={(o) => !o && setOpen(null)}
        title={t("approvals.rejectTitle", { who })}
        description={t("approvals.rejectBody")}
        confirmLabel={t("approvals.reject")}
        errorMessage={error ?? undefined}
        onConfirm={() => run(false)}
      >
        <FormField
          label={t("approvals.reason")}
          required
          error={reasonError ? t(reasonError) : undefined}
        >
          <TextArea
            rows={3}
            maxLength={500}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
        </FormField>
      </ConfirmDialog>
    </>
  );
}
