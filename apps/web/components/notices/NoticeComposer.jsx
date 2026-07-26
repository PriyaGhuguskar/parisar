"use client";

// NoticeComposer — board-only society-notice composer (web). UI-SPEC Screen 2.
//
// Fields: title (3–120) + message Textarea (10–2000) + optional attachment
// (<input type="file" accept="application/pdf,image/*">, 10MB, NO client resize —
// uploadNoticeAttachmentWeb) + optional poll builder (2–4 options, brand.50
// sub-card). Submit calls postNoticeAction; NO optimistic UI (Phase 4 D1) — awaits
// the RPC, then redirects to /notices (the new card arrives via Realtime).
//
// noticeId is pre-generated on mount so the attachment upload lands at the
// canonical storage prefix {societyId}/notifications/{noticeId}/… BEFORE the row
// exists (the same chicken-and-egg the Phase 4 complaint flow solved).
//
// Styling reads from the Society Green tokens; validation, upload and submit
// behaviour are unchanged.

import { uploadNoticeAttachmentWeb } from "@parisar/api-client";
import { BarChart3, CheckCircle2, FileText, Loader2, Plus, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { postNoticeAction } from "../../app/actions/notifications";
import { createSupabaseBrowserClient } from "../../lib/supabase/client";

const MIN_TITLE = 3;
const MAX_TITLE = 120;
const MIN_BODY = 10;
const MAX_BODY = 2000;
const MAX_BYTES = 10 * 1024 * 1024; // 10MB
const MAX_QUESTION = 200;

const FOCUS_RING =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-brand-500)] focus-visible:ring-offset-2";

const FIELD =
  "w-full rounded-xl border border-[var(--color-neutral-200)] bg-[var(--color-neutral-0)] px-3.5 py-2.5 text-[15px] text-[var(--color-neutral-900)] placeholder:text-[var(--color-neutral-400)] transition-colors focus:border-[var(--color-brand-500)] focus:outline-none focus:ring-2 focus:ring-[var(--color-brand-500)] focus:ring-offset-2";

const LABEL = "text-sm font-bold tracking-[-0.01em] text-[var(--color-neutral-900)]";

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
 * @param {{ societyId: string }} props
 */
export function NoticeComposer({ societyId }) {
  const { t } = useTranslation(["notifications", "polls"]);
  const router = useRouter();
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);

  const [noticeId, setNoticeId] = useState(null);
  useEffect(() => {
    setNoticeId(cryptoRandomUUIDClient());
  }, []);

  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");

  // Attachment (uploaded BEFORE submit).
  const [attachment, setAttachment] = useState(null); // { storageKey, mimeType, byteSize, fileName, isPdf }
  const [attachUploading, setAttachUploading] = useState(false);
  const [attachError, setAttachError] = useState(null);

  // Poll builder.
  const [pollOpen, setPollOpen] = useState(false);
  const [pollQuestion, setPollQuestion] = useState("");
  const [pollOptions, setPollOptions] = useState(["", ""]);

  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState(null);
  const [successOpen, setSuccessOpen] = useState(false);

  const titleLen = title.length;
  const bodyLen = body.length;
  const titleColor = titleLen >= 110 ? "var(--color-warning)" : "var(--color-neutral-400)";
  const bodyColor = bodyLen >= 1900 ? "var(--color-warning)" : "var(--color-neutral-400)";

  const trimmedOptions = pollOptions.map((o) => o.trim()).filter((o) => o.length > 0);
  const pollValid =
    !pollOpen ||
    (pollQuestion.trim().length >= 3 &&
      pollQuestion.trim().length <= MAX_QUESTION &&
      trimmedOptions.length >= 2 &&
      trimmedOptions.length <= 4);

  const titleValid = titleLen >= MIN_TITLE && titleLen <= MAX_TITLE;
  const bodyValid = bodyLen >= MIN_BODY && bodyLen <= MAX_BODY;
  const canSubmit =
    titleValid && bodyValid && pollValid && !submitting && !attachUploading && noticeId;

  async function handleFileChange(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setAttachError(null);
    if (file.size > MAX_BYTES) {
      setAttachError(t("notifications:notice.attachTooLarge"));
      e.target.value = "";
      return;
    }
    if (!societyId || !noticeId) {
      setAttachError(t("notifications:notice.attachError"));
      return;
    }
    setAttachUploading(true);
    try {
      const result = await uploadNoticeAttachmentWeb(supabase, societyId, noticeId, file);
      setAttachment({
        ...result,
        fileName: file.name,
        isPdf: file.type === "application/pdf",
      });
    } catch {
      setAttachError(t("notifications:notice.attachError"));
    } finally {
      setAttachUploading(false);
    }
  }

  function removeAttachment() {
    setAttachment(null);
    setAttachError(null);
  }

  function updateOption(idx, value) {
    setPollOptions((prev) => prev.map((o, i) => (i === idx ? value : o)));
  }
  function addOption() {
    setPollOptions((prev) => (prev.length >= 4 ? prev : [...prev, ""]));
  }
  function removeOption(idx) {
    setPollOptions((prev) => prev.filter((_, i) => i !== idx));
  }
  function removePoll() {
    setPollOpen(false);
    setPollQuestion("");
    setPollOptions(["", ""]);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!canSubmit) return;
    setSubmitError(null);
    setSubmitting(true);
    try {
      const result = await postNoticeAction({
        title: title.trim(),
        body: body.trim(),
        noticeId,
        storageKey: attachment?.storageKey ?? null,
        mimeType: attachment?.mimeType ?? null,
        byteSize: attachment?.byteSize ?? null,
        pollQuestion: pollOpen ? pollQuestion.trim() : null,
        pollOptions: pollOpen ? trimmedOptions : null,
      });
      if (!result.ok) {
        setSubmitError(
          result.error === "not_authorized"
            ? t("notifications:notice.notAuthorized")
            : t("notifications:notice.postError"),
        );
        return;
      }
      setSuccessOpen(true);
      setTimeout(() => {
        router.push("/notices");
        router.refresh();
      }, 600);
    } catch {
      setSubmitError(t("notifications:notice.postError"));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-5">
      {/* Title */}
      <div className="flex flex-col gap-1.5">
        <label htmlFor="notice-title" className={LABEL}>
          {t("notifications:notice.titleLabel")}
        </label>
        <input
          id="notice-title"
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder={t("notifications:notice.titlePlaceholder")}
          maxLength={MAX_TITLE}
          className={FIELD}
        />
        <p
          className="self-end text-xs font-semibold tabular-nums"
          style={{ color: titleColor }}
          aria-live="polite"
        >
          {titleLen}/{MAX_TITLE}
        </p>
      </div>

      {/* Message body */}
      <div className="flex flex-col gap-1.5">
        <label htmlFor="notice-body" className={LABEL}>
          {t("notifications:notice.bodyLabel")}
        </label>
        <textarea
          id="notice-body"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder={t("notifications:notice.bodyPlaceholder")}
          maxLength={MAX_BODY}
          rows={6}
          className={`${FIELD} leading-relaxed`}
          style={{ minHeight: 120 }}
        />
        <p
          className="self-end text-xs font-semibold tabular-nums"
          style={{ color: bodyColor }}
          aria-live="polite"
        >
          {bodyLen}/{MAX_BODY}
        </p>
      </div>

      {/* Attachment */}
      <div className="flex flex-col gap-1.5">
        <label htmlFor="notice-attachment" className={LABEL}>
          {t("notifications:notice.attachLabel")}
        </label>
        {attachment ? (
          <div className="flex items-center gap-3 rounded-[14px] border border-[var(--color-neutral-200)] bg-[var(--color-neutral-100)] p-3">
            <span
              aria-hidden="true"
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl"
              style={{ backgroundColor: "var(--color-brand-50)", color: "var(--color-brand-600)" }}
            >
              <FileText size={18} strokeWidth={2} />
            </span>
            <span className="flex-1 truncate text-sm font-semibold text-[var(--color-neutral-900)]">
              {attachment.fileName}
            </span>
            <button
              type="button"
              onClick={removeAttachment}
              aria-label="Remove attachment"
              className={`pk-press inline-flex h-8 w-8 items-center justify-center rounded-full bg-[var(--color-neutral-200)] text-[var(--color-neutral-600)] transition-colors hover:bg-[var(--color-neutral-100)] ${FOCUS_RING}`}
            >
              <X size={16} aria-hidden="true" />
            </button>
          </div>
        ) : (
          <label
            htmlFor="notice-attachment"
            className="flex cursor-pointer items-center justify-center gap-2 rounded-[14px] border border-dashed border-[var(--color-neutral-200)] bg-[var(--color-neutral-100)] text-sm font-semibold text-[var(--color-neutral-400)] transition-colors hover:border-[var(--color-brand-500)] hover:text-[var(--color-brand-600)] focus-within:ring-2 focus-within:ring-[var(--color-brand-500)] focus-within:ring-offset-2"
            style={{ height: 96 }}
          >
            <input
              id="notice-attachment"
              type="file"
              accept="application/pdf,image/*"
              onChange={handleFileChange}
              disabled={attachUploading}
              className="sr-only"
            />
            {attachUploading ? (
              <Loader2 size={20} className="animate-spin" aria-hidden="true" />
            ) : (
              <>
                <FileText size={20} aria-hidden="true" />
                {t("notifications:notice.attachLabel")}
              </>
            )}
          </label>
        )}
        {attachError ? (
          <p
            role="alert"
            className="text-sm font-semibold"
            style={{ color: "var(--color-danger)" }}
          >
            {attachError}
          </p>
        ) : null}
      </div>

      {/* Poll builder */}
      {pollOpen ? (
        <div className="flex flex-col gap-3 rounded-[18px] border border-[var(--color-neutral-200)] bg-[var(--color-brand-50)] p-4">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="poll-question" className={LABEL}>
              {t("polls:poll.questionLabel")}
            </label>
            <input
              id="poll-question"
              type="text"
              value={pollQuestion}
              onChange={(e) => setPollQuestion(e.target.value)}
              placeholder={t("polls:poll.questionPlaceholder")}
              maxLength={MAX_QUESTION}
              className={FIELD}
            />
          </div>

          {pollOptions.map((opt, idx) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: option rows are positional and reorder-free
            <div key={idx} className="flex items-center gap-2">
              <input
                type="text"
                value={opt}
                onChange={(e) => updateOption(idx, e.target.value)}
                placeholder={t("polls:poll.optionPlaceholder").replace("{{n}}", String(idx + 1))}
                className={`${FIELD} flex-1`}
              />
              {idx >= 2 ? (
                <button
                  type="button"
                  onClick={() => removeOption(idx)}
                  aria-label={`Remove option ${idx + 1}`}
                  className={`pk-press inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[var(--color-neutral-600)] transition-colors hover:bg-[var(--color-neutral-200)] ${FOCUS_RING}`}
                >
                  <X size={16} aria-hidden="true" />
                </button>
              ) : null}
            </div>
          ))}

          <div className="flex items-center justify-between">
            {pollOptions.length < 4 ? (
              <button
                type="button"
                onClick={addOption}
                className={`pk-press inline-flex h-9 items-center gap-1.5 rounded-xl border border-[var(--color-brand-500)] bg-[var(--color-neutral-0)] px-3 text-sm font-bold text-[var(--color-brand-600)] transition-colors hover:bg-[var(--color-brand-50)] ${FOCUS_RING}`}
              >
                <Plus size={16} strokeWidth={2.4} aria-hidden="true" />
                {t("polls:poll.addOption")}
              </button>
            ) : (
              <span />
            )}
            <button
              type="button"
              onClick={removePoll}
              className={`pk-ul pk-press rounded text-sm font-bold ${FOCUS_RING}`}
              style={{ color: "var(--color-danger)" }}
            >
              {t("polls:poll.removePoll")}
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setPollOpen(true)}
          className={`pk-press inline-flex h-11 items-center justify-center gap-1.5 self-start rounded-xl border border-[var(--color-brand-500)] bg-[var(--color-neutral-0)] px-4 text-sm font-bold text-[var(--color-brand-600)] transition-colors hover:bg-[var(--color-brand-50)] ${FOCUS_RING}`}
        >
          <BarChart3 size={16} strokeWidth={2.2} aria-hidden="true" />
          {t("notifications:notice.addPoll")}
        </button>
      )}

      {/* Submit */}
      <button
        type="submit"
        disabled={!canSubmit}
        className={`pk-press pk-shine inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-[var(--color-brand-600)] text-[15px] font-bold text-white transition-colors hover:bg-[var(--color-brand-700)] disabled:cursor-not-allowed disabled:bg-[var(--color-neutral-200)] disabled:text-[var(--color-neutral-400)] ${FOCUS_RING}`}
      >
        {submitting ? (
          <>
            <Loader2 size={16} className="animate-spin" aria-hidden="true" />
            {t("notifications:notice.posting")}
          </>
        ) : (
          t("notifications:notice.postCta")
        )}
      </button>

      {submitError ? (
        <p role="alert" className="text-sm font-semibold" style={{ color: "var(--color-danger)" }}>
          {submitError}
        </p>
      ) : null}

      {successOpen ? (
        // biome-ignore lint/a11y/useSemanticElements: status role on div is the correct toast pattern
        <div
          role="status"
          aria-live="polite"
          className="pk-in fixed inset-x-4 top-4 z-50 mx-auto inline-flex max-w-md items-center gap-2 rounded-[14px] border border-[var(--color-brand-500)] bg-[var(--color-brand-50)] px-4 py-3 shadow-lg"
        >
          <CheckCircle2
            size={17}
            strokeWidth={2.2}
            style={{ color: "var(--color-success)" }}
            aria-hidden="true"
          />
          <span className="text-sm font-bold text-[var(--color-neutral-900)]">
            {t("notifications:notice.postSuccess")}
          </span>
        </div>
      ) : null}
    </form>
  );
}
