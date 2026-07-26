"use client";

// ReportReasonSheet — reason chooser → confirm (web). UI-SPEC Screen 7. Reused for
// post + comment via `targetKind`. shadcn Dialog shell; single-choice reason rows
// (the established aria-checked button-radio idiom — base-ui RadioGroup's value API
// is avoided for build-safety) + an optional note + a danger Confirm.
//
// On confirm → reportContentAction. The PARENT swaps the reported item to a
// HiddenPendingBanner for the reporter only (D-03); this sheet just reports + closes.

import { Loader2 } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { reportContentAction } from "../../app/(protected)/community/actions";
import { Dialog, DialogContent, DialogTitle } from "../ui/dialog";

const MAX_NOTE = 300;

/**
 * @param {{
 *   open: boolean,
 *   onOpenChange: (open: boolean) => void,
 *   targetKind: 'post'|'comment',
 *   targetId: string,
 *   onReported?: () => void,
 * }} props
 */
export function ReportReasonSheet({ open, onOpenChange, targetKind, targetId, onReported }) {
  const { t } = useTranslation("community");
  // PAR-001 fix: labels call t(), so this table is built inside the component.
  const REASONS = [
    { key: "spam", label: t("community.reason.spam") },
    { key: "harassment", label: t("community.reason.harassment") },
    { key: "inappropriate", label: t("community.reason.inappropriate") },
    { key: "misinfo", label: t("community.reason.misinfo") },
    { key: "other", label: t("community.reason.other") },
  ];
  const [reason, setReason] = useState(null);
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  const targetLabel =
    targetKind === "comment" ? t("community.targetComment") : t("community.targetPost");
  const title = t("community.reportTitle").replace("{{target}}", targetLabel);

  function reset() {
    setReason(null);
    setNote("");
    setError(null);
    setSubmitting(false);
  }

  function handleOpenChange(next) {
    if (!next) reset();
    onOpenChange?.(next);
  }

  async function handleConfirm() {
    if (!reason || submitting) return;
    setError(null);
    setSubmitting(true);
    try {
      const res = await reportContentAction({
        targetKind,
        targetId,
        reason,
        note: note.trim() ? note.trim() : null,
      });
      if (!res.ok) {
        setError(t("community.reportError"));
        return;
      }
      onReported?.();
      handleOpenChange(false);
    } catch {
      setError(t("community.reportError"));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-md">
        <DialogTitle>{title}</DialogTitle>
        <p className="text-base text-[#525252]">{t("community.reportSubhead")}</p>

        <fieldset className="flex flex-col gap-2 mt-2 border-0 p-0 m-0">
          <legend className="sr-only">{title}</legend>
          {REASONS.map((r) => (
            // biome-ignore lint/a11y/useSemanticElements: button + role=radio is the single-choice idiom (matches FileComplaintForm)
            <button
              key={r.key}
              type="button"
              role="radio"
              aria-checked={reason === r.key}
              onClick={() => setReason(r.key)}
              className={`flex items-center min-h-[48px] px-3 rounded-xl text-left text-base transition-colors ${
                reason === r.key
                  ? "bg-[#f5f7ff] text-[#171717] border border-[#12715A]"
                  : "bg-white text-[#525252] border border-neutral-200 hover:bg-neutral-50"
              }`}
            >
              {r.label}
            </button>
          ))}
        </fieldset>

        <div className="flex flex-col gap-1 mt-2">
          <input
            type="text"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder={t("community.reportNotePlaceholder")}
            maxLength={MAX_NOTE}
            aria-label={t("community.reportNotePlaceholder")}
            className="w-full rounded-lg border border-neutral-200 bg-white px-3 py-2 text-base text-[#171717] focus:outline-none focus:ring-2 focus:ring-[#12715A]"
          />
        </div>

        {error ? (
          <p role="alert" className="text-sm text-[#c81e1e]">
            {error}
          </p>
        ) : null}

        <div className="flex items-center gap-3 mt-2">
          <button
            type="button"
            onClick={handleConfirm}
            disabled={!reason || submitting}
            className="inline-flex items-center justify-center gap-2 h-12 px-6 rounded-xl bg-[#c81e1e] text-white text-base font-semibold transition-colors hover:bg-[#dc2626] disabled:bg-neutral-200 disabled:text-[#6e6e6e] disabled:cursor-not-allowed"
          >
            {submitting ? <Loader2 size={16} className="animate-spin" aria-hidden="true" /> : null}
            {t("community.reportConfirm")}
          </button>
          <button
            type="button"
            onClick={() => handleOpenChange(false)}
            className="text-sm text-[#525252] hover:underline"
          >
            Cancel
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
