"use client";

// IssueActionForm — admin-only Issue Action form (web). UI-SPEC Screen 1.
//
// Fields (top → bottom):
//   - FlatPicker (required, shadcn Select grouped logically by wing labels)
//   - Kind segmented control: Warning | Fine | Notify (default Warning) — the
//     established segmented-button idiom (FileComplaintForm pattern); active segment
//     brand.500 bg / white text
//   - Warning → Reason (10–1000)
//   - Fine    → Amount(₹) > 0 + Reason + Due date (Calendar/Popover, min today) +
//               optional bylaw/AGM PDF (accept="application/pdf", ≤10MB, uploaded
//               BEFORE the RPC via uploadFinePdfWeb under {society}/flat_actions/
//               {actionId}/…) + the LOCKED no-payment footer ALWAYS VISIBLE (FLAT-05)
//   - Notify  → Message (1–2000)
//
// Submit → issueFlatActionAction (admin-only server-side; client route guard +
// this surface are defence in depth). No optimistic UI. Success → /flat-actions.
//
// actionId is pre-generated on mount so the fine PDF upload key is stable BEFORE
// the row exists (same chicken-and-egg the complaint/notice flows solved).

import { uploadFinePdfWeb } from "@parisar/api-client";
import { format } from "date-fns";
import { CalendarIcon, CheckCircle2, FileText, Info, Loader2, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { issueFlatActionAction } from "../../app/(protected)/flat-actions/actions";
import { createSupabaseBrowserClient } from "../../lib/supabase/client";
import { Calendar } from "../ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "../ui/popover";
import { FlatPicker } from "./FlatPicker";

const MIN_REASON = 10;
const MAX_REASON = 1000;
const MAX_MESSAGE = 2000;
const MAX_AMOUNT = 1000000;
const MAX_PDF_BYTES = 10 * 1024 * 1024;

// PAR-001: KINDS is built inside the component (labels call t()).

function cryptoRandomUUIDClient() {
  const g = globalThis.crypto;
  if (g && typeof g.randomUUID === "function") return g.randomUUID();
  const bytes = new Uint8Array(16);
  if (g && typeof g.getRandomValues === "function") g.getRandomValues(bytes);
  else for (let i = 0; i < 16; i++) bytes[i] = Math.floor(Math.random() * 256);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/**
 * @param {{ societyId: string, flats: Array }} props
 */
export function IssueActionForm({ societyId, flats }) {
  const { t } = useTranslation("flat-actions");
  const KINDS = [
    { value: "warning", label: t("flatAction.kindWarning") },
    { value: "fine", label: t("flatAction.kindFine") },
    { value: "notify", label: t("flatAction.kindNotify") },
  ];
  const router = useRouter();
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);

  const [actionId, setActionId] = useState(null);
  useEffect(() => {
    setActionId(cryptoRandomUUIDClient());
  }, []);

  const [flatId, setFlatId] = useState(null);
  const [kind, setKind] = useState("warning");
  const [reason, setReason] = useState("");
  const [message, setMessage] = useState("");
  const [amount, setAmount] = useState("");
  const [dueDate, setDueDate] = useState(null);
  const [datePopoverOpen, setDatePopoverOpen] = useState(false);

  // Fine PDF (uploaded BEFORE submit).
  const [pdf, setPdf] = useState(null); // { storageKey, mimeType, byteSize, fileName }
  const [pdfUploading, setPdfUploading] = useState(false);
  const [pdfError, setPdfError] = useState(null);

  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState(null);
  const [successOpen, setSuccessOpen] = useState(false);

  const today = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }, []);

  const reasonLen = reason.length;
  const messageLen = message.length;
  const amountNum = Number.parseInt(amount, 10);
  const amountValid = !Number.isNaN(amountNum) && amountNum > 0 && amountNum <= MAX_AMOUNT;
  const reasonValid = reasonLen >= MIN_REASON && reasonLen <= MAX_REASON;
  const messageValid = messageLen >= 1 && messageLen <= MAX_MESSAGE;

  let kindValid = false;
  if (kind === "warning") kindValid = reasonValid;
  else if (kind === "notify") kindValid = messageValid;
  else if (kind === "fine") kindValid = amountValid && reasonValid && !!dueDate;

  const hasFlats = flats.length > 0;
  const canSubmit = !!flatId && kindValid && !submitting && !pdfUploading && !!actionId && hasFlats;

  async function handlePdfChange(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setPdfError(null);
    if (file.size > MAX_PDF_BYTES) {
      setPdfError(t("flatAction.pdfTooLarge"));
      e.target.value = "";
      return;
    }
    if (!societyId || !actionId) {
      setPdfError(t("flatAction.pdfError"));
      return;
    }
    setPdfUploading(true);
    try {
      const result = await uploadFinePdfWeb(supabase, { societyId, actionId, file });
      setPdf({ ...result, fileName: file.name });
    } catch {
      setPdfError(t("flatAction.pdfError"));
    } finally {
      setPdfUploading(false);
    }
  }

  function removePdf() {
    setPdf(null);
    setPdfError(null);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!canSubmit) return;
    setSubmitError(null);
    setSubmitting(true);
    try {
      const body = kind === "notify" ? message.trim() : reason.trim();
      const result = await issueFlatActionAction({
        flatId,
        kind,
        body,
        amount: kind === "fine" ? amountNum : null,
        dueDate: kind === "fine" && dueDate ? format(dueDate, "yyyy-MM-dd") : null,
        actionId,
        storageKey: kind === "fine" ? (pdf?.storageKey ?? null) : null,
        mimeType: kind === "fine" ? (pdf?.mimeType ?? null) : null,
        byteSize: kind === "fine" ? (pdf?.byteSize ?? null) : null,
      });
      if (!result.ok) {
        setSubmitError(
          result.error === "not_authorized"
            ? t("flatAction.notAuthorized")
            : t("flatAction.issueError"),
        );
        return;
      }
      setSuccessOpen(true);
      setTimeout(() => {
        router.push("/flat-actions");
        router.refresh();
      }, 600);
    } catch {
      setSubmitError(t("flatAction.issueError"));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      {/* Flat picker (required) */}
      <FlatPicker
        flats={flats}
        selectedId={flatId}
        onSelect={(flat) => setFlatId(flat?.id ?? null)}
        id="issue-flat"
      />

      {/* Kind segmented control (default Warning) */}
      <div className="flex flex-col gap-1">
        <p className="text-sm text-[#525252]" id="kind-label">
          {t("flatAction.kindLabel")}
        </p>
        <div
          role="radiogroup"
          aria-labelledby="kind-label"
          className="flex bg-neutral-100 rounded-xl p-1 w-full"
          style={{ height: 40 }}
        >
          {KINDS.map((k) => (
            // biome-ignore lint/a11y/useSemanticElements: button + role=radio is the segmented-control idiom
            <button
              key={k.value}
              type="button"
              role="radio"
              aria-checked={kind === k.value}
              onClick={() => !submitting && setKind(k.value)}
              className={`flex-1 rounded-lg text-sm transition-colors ${
                kind === k.value
                  ? "bg-[#0E5A48] text-white font-semibold"
                  : "text-[#525252] font-normal hover:text-[#171717]"
              }`}
            >
              {k.label}
            </button>
          ))}
        </div>
      </div>

      {/* Fine → amount */}
      {kind === "fine" ? (
        <div className="flex flex-col gap-1">
          <label htmlFor="fine-amount" className="text-sm text-[#525252]">
            {t("flatAction.amountLabel")}
          </label>
          <input
            id="fine-amount"
            type="number"
            inputMode="numeric"
            min={1}
            max={MAX_AMOUNT}
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder={t("flatAction.amountPlaceholder")}
            className="w-full rounded-lg border border-neutral-200 bg-white px-3 py-2 text-base text-[#171717] focus:outline-none focus:ring-2 focus:ring-[#12715A]"
          />
        </div>
      ) : null}

      {/* Warning + Fine → reason */}
      {kind === "warning" || kind === "fine" ? (
        <div className="flex flex-col gap-1">
          <label htmlFor="action-reason" className="text-sm text-[#525252]">
            {t("flatAction.reasonLabel")}
          </label>
          <textarea
            id="action-reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder={t("flatAction.reasonPlaceholder")}
            maxLength={MAX_REASON}
            rows={5}
            className="w-full rounded-lg border border-neutral-200 bg-white px-3 py-2 text-base text-[#171717] focus:outline-none focus:ring-2 focus:ring-[#12715A]"
            style={{ minHeight: 120 }}
          />
          <p
            className="text-sm self-end"
            style={{ color: reasonLen >= 900 ? "#f59e0b" : "#6e6e6e" }}
            aria-live="polite"
          >
            {reasonLen}/{MAX_REASON}
          </p>
        </div>
      ) : null}

      {/* Notify → message */}
      {kind === "notify" ? (
        <div className="flex flex-col gap-1">
          <label htmlFor="action-message" className="text-sm text-[#525252]">
            {t("flatAction.messageLabel")}
          </label>
          <textarea
            id="action-message"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder={t("flatAction.messagePlaceholder")}
            maxLength={MAX_MESSAGE}
            rows={5}
            className="w-full rounded-lg border border-neutral-200 bg-white px-3 py-2 text-base text-[#171717] focus:outline-none focus:ring-2 focus:ring-[#12715A]"
            style={{ minHeight: 120 }}
          />
          <p
            className="text-sm self-end"
            style={{ color: messageLen >= 1900 ? "#f59e0b" : "#6e6e6e" }}
            aria-live="polite"
          >
            {messageLen}/{MAX_MESSAGE}
          </p>
        </div>
      ) : null}

      {/* Fine → due date (Calendar/Popover, min today) */}
      {kind === "fine" ? (
        <div className="flex flex-col gap-1">
          <label htmlFor="fine-due-trigger" className="text-sm text-[#525252]">
            {t("flatAction.dueDateLabel")}
          </label>
          <Popover open={datePopoverOpen} onOpenChange={setDatePopoverOpen}>
            <PopoverTrigger
              render={
                <button
                  id="fine-due-trigger"
                  type="button"
                  className="inline-flex items-center gap-2 h-11 px-3 rounded-lg border border-neutral-200 bg-white text-base text-[#171717] text-left"
                />
              }
            >
              <CalendarIcon size={16} color="#12715A" aria-hidden="true" />
              {dueDate ? (
                format(dueDate, "EEE, dd MMM yyyy")
              ) : (
                <span className="text-[#6e6e6e]">{t("flatAction.dueDateLabel")}</span>
              )}
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar
                mode="single"
                selected={dueDate ?? undefined}
                onSelect={(d) => {
                  setDueDate(d ?? null);
                  setDatePopoverOpen(false);
                }}
                disabled={{ before: today }}
                autoFocus
              />
            </PopoverContent>
          </Popover>
        </div>
      ) : null}

      {/* Fine → optional bylaw/AGM PDF */}
      {kind === "fine" ? (
        <div className="flex flex-col gap-1">
          <label htmlFor="fine-pdf" className="text-sm text-[#525252]">
            {t("flatAction.pdfLabel")}
          </label>
          {pdf ? (
            <div className="flex items-center gap-2 rounded-xl border border-neutral-200 bg-neutral-100 p-3">
              <FileText size={20} color="#12715A" aria-hidden="true" />
              <span className="flex-1 truncate text-sm text-[#171717]">{pdf.fileName}</span>
              <button
                type="button"
                onClick={removePdf}
                aria-label="Remove PDF"
                className="inline-flex items-center justify-center rounded-full w-7 h-7 bg-neutral-200 text-[#525252] hover:bg-neutral-300"
              >
                <X size={16} aria-hidden="true" />
              </button>
            </div>
          ) : (
            <label
              htmlFor="fine-pdf"
              className="flex items-center justify-center gap-2 cursor-pointer rounded-xl bg-neutral-100 text-sm text-[#6e6e6e]"
              style={{
                height: 96,
                borderWidth: 1.5,
                borderStyle: "dashed",
                borderColor: "#e5e5e5",
              }}
            >
              <input
                id="fine-pdf"
                type="file"
                accept="application/pdf"
                onChange={handlePdfChange}
                disabled={pdfUploading}
                className="sr-only"
              />
              {pdfUploading ? (
                <Loader2 size={20} className="animate-spin" aria-hidden="true" />
              ) : (
                <>
                  <FileText size={20} aria-hidden="true" />
                  {t("flatAction.pdfLabel")}
                </>
              )}
            </label>
          )}
          {pdfError ? (
            <p role="alert" className="text-sm text-[#c81e1e]">
              {pdfError}
            </p>
          ) : null}
        </div>
      ) : null}

      {/* Fine → LOCKED no-payment footer ALWAYS visible (FLAT-05) */}
      {kind === "fine" ? (
        <div className="flex items-start gap-2 rounded-xl bg-neutral-100 p-3">
          <Info size={16} color="#525252" aria-hidden="true" className="mt-0.5 shrink-0" />
          <p className="text-base text-[#525252]" style={{ lineHeight: 1.5 }}>
            {t("flatAction.noPaymentFooter")}
          </p>
        </div>
      ) : null}

      {/* Submit */}
      <button
        type="submit"
        disabled={!canSubmit}
        className="w-full inline-flex items-center justify-center gap-2 h-12 rounded-xl bg-[#0E5A48] text-white text-base font-semibold transition-colors hover:bg-[#0A4436] disabled:bg-neutral-200 disabled:text-[#6e6e6e] disabled:cursor-not-allowed"
      >
        {submitting ? (
          <>
            <Loader2 size={16} className="animate-spin" aria-hidden="true" />
            {t("flatAction.issuing")}
          </>
        ) : (
          t("flatAction.issueCta")
        )}
      </button>

      {submitError ? (
        <p role="alert" className="text-sm text-[#c81e1e]">
          {submitError}
        </p>
      ) : null}

      {successOpen ? (
        // biome-ignore lint/a11y/useSemanticElements: status role on div is the toast pattern
        <div
          role="status"
          aria-live="polite"
          className="fixed top-4 left-4 right-4 mx-auto max-w-md inline-flex items-center gap-2 rounded-xl border border-[#047857] bg-[#ecfdf5] text-[#171717] px-4 py-3 shadow-lg z-50"
        >
          <CheckCircle2 size={16} color="#047857" aria-hidden="true" />
          <span className="text-sm">{t("flatAction.issueSuccess")}</span>
        </div>
      ) : null}
    </form>
  );
}
