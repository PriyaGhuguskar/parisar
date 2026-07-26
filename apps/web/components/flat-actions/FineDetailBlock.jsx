"use client";

// FineDetailBlock — the fine sub-block on the flat-action detail (web). UI-SPEC
// Screen 2b §Section 2.
//
// Renders, for kind=fine:
//   - Amount (Heading) + "Fine amount" label
//   - Due-date line; "Overdue by {{n}} days" in danger.500 when derived-overdue
//   - FineStatusBadge
//   - Optional bylaw/AGM PDF pill (opens the SSR-signed URL in a new tab)
//   - The LOCKED no-payment footer VERBATIM from flatAction.noPaymentFooter (FLAT-05 /
//     DD4 / T-06-29) — on EVERY render, non-dismissible, auto-height for Devanagari
//   - Role-gated action row:
//       * Member resident + outstanding → Acknowledge (brand.500), with the
//         "not a payment" hint (D-04 / DD13)
//       * Admin (secretary/co_secretary) + outstanding|acknowledged → Waive
//         (neutral.600 outlined, inline reveal→confirm). Gated on isAdmin ONLY —
//         a board_member NEVER sees Waive (D-04 / T-06-32); the admin-only
//         waive_fine RPC + server action are the authority.
//
// No optimistic UI — awaits the server action; parent + Realtime re-render the badge.

import { format } from "date-fns";
import { CheckCircle2, FileText, Info, Loader2 } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { acknowledgeFineAction, waiveFineAction } from "../../app/(protected)/flat-actions/actions";
import { isOverdue, overdueDays } from "../../lib/fine-overdue";
import { FineStatusBadge } from "./FineStatusBadge";

function safeDate(value) {
  if (!value) return "";
  try {
    return format(new Date(value), "dd MMM yyyy");
  } catch {
    return String(value);
  }
}

/**
 * @param {{
 *   action: object,                 // flat_action row (id, amount, due_date, fine_status, ...)
 *   pdf?: { url: string|null, fileName?: string } | null,
 *   isAdmin: boolean,               // secretary || co_secretary — gates Waive ONLY
 *   isMemberResident: boolean,      // caller's flat is the target flat — gates Acknowledge
 *   onStatusChange?: (next: object) => void,
 * }} props
 */
export function FineDetailBlock({ action, pdf = null, isAdmin, isMemberResident, onStatusChange }) {
  const { t } = useTranslation("flat-actions");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [waiveArmed, setWaiveArmed] = useState(false);
  const [doneToast, setDoneToast] = useState(null);

  const status = action?.fine_status ?? "outstanding";
  const dueDate = action?.due_date ?? null;
  const overdue = isOverdue(status, dueDate);
  const amount = action?.amount ?? 0;

  const dueLine = overdue
    ? t("flatAction.overdueBy").replace("{{days}}", String(overdueDays(status, dueDate)))
    : t("flatAction.dueOn").replace("{{date}}", safeDate(dueDate));

  async function handleAcknowledge() {
    if (busy) return;
    setError(null);
    setBusy(true);
    try {
      const res = await acknowledgeFineAction(action.id);
      if (!res.ok) {
        setError(t("flatAction.acknowledgeError"));
        return;
      }
      setDoneToast(t("flatAction.acknowledgeSuccess"));
      onStatusChange?.({ ...action, fine_status: "acknowledged" });
    } catch {
      setError(t("flatAction.acknowledgeError"));
    } finally {
      setBusy(false);
    }
  }

  async function handleWaive() {
    if (busy) return;
    setError(null);
    setBusy(true);
    try {
      const res = await waiveFineAction(action.id);
      if (!res.ok) {
        setError(t("flatAction.waiveError"));
        return;
      }
      setDoneToast(t("flatAction.waiveSuccess"));
      setWaiveArmed(false);
      onStatusChange?.({ ...action, fine_status: "waived" });
    } catch {
      setError(t("flatAction.waiveError"));
    } finally {
      setBusy(false);
    }
  }

  const showAcknowledge = isMemberResident && status === "outstanding";
  const showWaive = isAdmin && (status === "outstanding" || status === "acknowledged");

  return (
    <section className="bg-white rounded-xl p-6 flex flex-col gap-4">
      {/* Amount */}
      <div className="flex flex-col gap-1">
        <span className="text-sm text-[#525252]">{t("flatAction.amountHeading")}</span>
        <span className="text-xl font-semibold text-[#171717]">
          {t("flatAction.amountValue").replace("{{amount}}", String(amount))}
        </span>
      </div>

      {/* Due / overdue + status badge */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className={`text-sm ${overdue ? "text-[#c81e1e]" : "text-[#525252]"}`}>
          {dueLine}
        </span>
        <span className="ml-auto">
          <FineStatusBadge fineStatus={status} dueDate={dueDate} />
        </span>
      </div>

      {/* PDF pill */}
      {pdf?.url ? (
        <a
          href={pdf.url}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-2 rounded-xl border border-neutral-200 bg-neutral-100 p-3 hover:bg-neutral-200 transition-colors"
        >
          <FileText size={24} color="#12715A" aria-hidden="true" />
          <span className="flex-1 truncate text-sm text-[#171717]">
            {pdf.fileName ?? "bylaw.pdf"}
          </span>
          <span className="text-sm text-[#0E5A48]">{t("flatAction.openPdf")}</span>
        </a>
      ) : null}

      {/* LOCKED no-payment footer — VERBATIM, every render, non-dismissible (FLAT-05) */}
      <div className="flex items-start gap-2 rounded-xl bg-neutral-100 p-3">
        <Info size={16} color="#525252" aria-hidden="true" className="mt-0.5 shrink-0" />
        <p className="text-base text-[#525252]" style={{ lineHeight: 1.5 }}>
          {t("flatAction.noPaymentFooter")}
        </p>
      </div>

      {/* Role-gated action row */}
      {showAcknowledge ? (
        <div className="flex flex-col gap-1">
          <button
            type="button"
            onClick={handleAcknowledge}
            disabled={busy}
            className="inline-flex items-center justify-center gap-2 h-10 px-4 rounded-lg bg-[#0E5A48] text-white text-sm font-semibold transition-colors hover:bg-[#0A4436] disabled:bg-neutral-200 disabled:text-[#6e6e6e] self-start"
          >
            {busy ? <Loader2 size={16} className="animate-spin" aria-hidden="true" /> : null}
            {t("flatAction.acknowledgeCta")}
          </button>
          <p className="text-sm text-[#525252]">{t("flatAction.acknowledgeHint")}</p>
        </div>
      ) : null}

      {showWaive ? (
        <div className="flex flex-col gap-2">
          {waiveArmed ? (
            <div className="flex flex-col gap-2 rounded-xl border border-neutral-200 bg-neutral-50 p-3">
              <p className="text-sm text-[#525252]">{t("flatAction.waiveConfirm")}</p>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={handleWaive}
                  disabled={busy}
                  className="inline-flex items-center justify-center gap-2 h-10 px-4 rounded-lg border border-[#525252] text-[#525252] bg-white text-sm font-semibold hover:bg-neutral-100 disabled:opacity-50"
                >
                  {busy ? <Loader2 size={16} className="animate-spin" aria-hidden="true" /> : null}
                  {t("flatAction.waiveCta")}
                </button>
                <button
                  type="button"
                  onClick={() => setWaiveArmed(false)}
                  disabled={busy}
                  className="inline-flex items-center justify-center h-10 px-4 rounded-lg text-sm text-[#525252] hover:bg-neutral-100"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setWaiveArmed(true)}
              className="inline-flex items-center justify-center h-10 px-4 rounded-lg border border-[#525252] text-[#525252] bg-white text-sm font-semibold hover:bg-neutral-100 self-start"
            >
              {t("flatAction.waiveCta")}
            </button>
          )}
        </div>
      ) : null}

      {error ? (
        <p role="alert" className="text-sm text-[#c81e1e]">
          {error}
        </p>
      ) : null}

      {doneToast ? (
        // biome-ignore lint/a11y/useSemanticElements: status role on div is the toast pattern
        <div
          role="status"
          aria-live="polite"
          className="fixed top-4 left-4 right-4 mx-auto max-w-md inline-flex items-center gap-2 rounded-xl border border-[#047857] bg-[#ecfdf5] text-[#171717] px-4 py-3 shadow-lg z-50"
        >
          <CheckCircle2 size={16} color="#047857" aria-hidden="true" />
          <span className="text-sm">{doneToast}</span>
        </div>
      ) : null}
    </section>
  );
}
