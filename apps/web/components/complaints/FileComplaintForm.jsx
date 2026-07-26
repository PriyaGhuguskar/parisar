"use client";

// FileComplaintForm — client-side File Complaint form (web).
//
// Behaviour per 04-UI-SPEC.md Screen 2:
//   - Two-segment "Type" toggle (Society Issue / Member Issue) — UI-SPEC D11
//   - Multiline description Textarea (min 10, max 1000 chars). Counter turns
//     warning at 900+, danger at 1000.
//   - Photo (optional) via PhotoPicker — File input, no base64 conversion.
//   - Submit calls fileComplaintAction. No optimistic UI per UI-SPEC D1.
//   - On success: brief success toast, then router.push('/complaints').
//
// complaintId is pre-generated client-side on mount so the photo upload can
// land at the canonical storage prefix {societyId}/complaints/{complaintId}/...
// BEFORE the complaint row exists (Pitfall 7 from RESEARCH.md).

import { CheckCircle2, Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { fileComplaintAction } from "../../app/actions/complaints";
import { createSupabaseBrowserClient } from "../../lib/supabase/client";
import { PhotoPicker } from "./PhotoPicker";

const MIN_DESC = 10;
const MAX_DESC = 1000;

function cryptoRandomUUIDClient() {
  const g = globalThis.crypto;
  if (g && typeof g.randomUUID === "function") return g.randomUUID();
  // Fallback (modern browsers should never hit this).
  const bytes = new Uint8Array(16);
  if (g && typeof g.getRandomValues === "function") g.getRandomValues(bytes);
  else for (let i = 0; i < 16; i++) bytes[i] = Math.floor(Math.random() * 256);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/**
 * @param {{
 *   societyId: string,
 *   reporterFlatId: string,
 * }} props
 */
export function FileComplaintForm({ societyId, reporterFlatId }) {
  const { t } = useTranslation("complaints");
  const router = useRouter();
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);

  const [kind, setKind] = useState("society"); // 'society' | 'member'
  const [description, setDescription] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState(null);
  const [successOpen, setSuccessOpen] = useState(false);

  // Pre-generated complaintId so the photo upload key is stable.
  const [complaintId, setComplaintId] = useState(null);
  useEffect(() => {
    setComplaintId(cryptoRandomUUIDClient());
  }, []);

  const [photo, setPhoto] = useState(null); // { storageKey, mimeType, byteSize } | null

  const descLen = description.length;
  const counterColor = descLen >= MAX_DESC ? "#c81e1e" : descLen >= 900 ? "#f59e0b" : "#6e6e6e";
  const canSubmit = descLen >= MIN_DESC && descLen <= MAX_DESC && !submitting && complaintId;

  function handleKindChange(next) {
    if (submitting) return;
    setKind(next);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!canSubmit) return;
    setSubmitError(null);
    setSubmitting(true);
    try {
      const result = await fileComplaintAction({
        kind,
        description: description.trim(),
        reporterFlatId,
        languageCode: "en",
        complaintId,
        storageKey: photo?.storageKey ?? null,
        mimeType: photo?.mimeType ?? null,
        byteSize: photo?.byteSize ?? null,
      });
      if (!result.ok) {
        if (result.error?.toLowerCase?.().includes("not_active_member")) {
          setSubmitError(t("complaint.notActiveMember"));
        } else {
          setSubmitError(t("complaint.submitError"));
        }
        return;
      }
      // Success — show transient toast, then push back to list.
      setSuccessOpen(true);
      setTimeout(() => {
        router.push("/complaints");
        // Refresh so the SSR list re-fetches with the new row alongside the
        // Realtime arrival (defensive — Realtime should also deliver).
        router.refresh();
      }, 600);
    } catch (err) {
      console.warn("[FileComplaintForm] submit failed:", err?.message ?? err);
      setSubmitError(t("complaint.submitError"));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      {/* Field 1 — Type segmented toggle (UI-SPEC D11) */}
      <div className="flex flex-col gap-1">
        <p className="text-sm text-[#525252]" id="kind-label">
          {t("complaint.typeLabel")}
        </p>
        <div
          role="radiogroup"
          aria-labelledby="kind-label"
          className="flex bg-neutral-100 rounded-xl p-1 w-full"
          style={{ height: 40 }}
        >
          {/* biome-ignore lint/a11y/useSemanticElements: button + role=radio is the segmented-control idiom */}
          <button
            type="button"
            role="radio"
            aria-checked={kind === "society"}
            onClick={() => handleKindChange("society")}
            className={`flex-1 rounded-lg text-sm transition-colors ${
              kind === "society"
                ? "bg-[#0E5A48] text-white font-semibold"
                : "text-[#525252] font-normal hover:text-[#171717]"
            }`}
          >
            {t("complaint.typeSociety")}
          </button>
          {/* biome-ignore lint/a11y/useSemanticElements: button + role=radio is the segmented-control idiom */}
          <button
            type="button"
            role="radio"
            aria-checked={kind === "member"}
            onClick={() => handleKindChange("member")}
            className={`flex-1 rounded-lg text-sm transition-colors ${
              kind === "member"
                ? "bg-[#0E5A48] text-white font-semibold"
                : "text-[#525252] font-normal hover:text-[#171717]"
            }`}
          >
            {t("complaint.typeMember")}
          </button>
        </div>
      </div>

      {/* Field 2 — Description */}
      <div className="flex flex-col gap-1">
        <label htmlFor="complaint-description" className="text-sm text-[#525252]">
          {t("complaint.descriptionLabel")}
        </label>
        <textarea
          id="complaint-description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder={t("complaint.descriptionPlaceholder")}
          maxLength={MAX_DESC}
          rows={6}
          className="w-full rounded-lg border border-neutral-200 bg-white px-3 py-2 text-base text-[#171717] focus:outline-none focus:ring-2 focus:ring-[#12715A]"
          style={{ minHeight: 120 }}
        />
        <p className="text-sm self-end" style={{ color: counterColor }} aria-live="polite">
          {descLen}/{MAX_DESC}
        </p>
        {descLen > 0 && descLen < MIN_DESC ? (
          <p className="text-sm text-[#525252]">{t("complaint.descriptionRequired")}</p>
        ) : null}
      </div>

      {/* Field 3 — Photo */}
      <div className="flex flex-col gap-1">
        <p className="text-sm text-[#525252]">{t("complaint.photoLabel")}</p>
        {complaintId ? (
          <PhotoPicker
            supabase={supabase}
            societyId={societyId}
            complaintId={complaintId}
            onUpload={(result) => setPhoto(result)}
            onRemove={() => setPhoto(null)}
          />
        ) : null}
      </div>

      {/* Submit */}
      <button
        type="submit"
        disabled={!canSubmit}
        className="w-full inline-flex items-center justify-center gap-2 h-12 rounded-xl bg-[#0E5A48] text-white text-base font-semibold transition-colors hover:bg-[#0A4436] disabled:bg-neutral-200 disabled:text-[#6e6e6e] disabled:cursor-not-allowed"
      >
        {submitting ? (
          <>
            <Loader2 size={16} className="animate-spin" aria-hidden="true" />
            {t("complaint.submitting")}
          </>
        ) : (
          t("complaint.submitCta")
        )}
      </button>

      {submitError ? (
        <p role="alert" className="text-sm text-[#c81e1e]">
          {submitError}
        </p>
      ) : null}

      {/* Success toast (transient, no library — simple fixed-position div) */}
      {successOpen ? (
        // biome-ignore lint/a11y/useSemanticElements: status role on div is the correct toast pattern
        <div
          role="status"
          aria-live="polite"
          className="fixed top-4 left-4 right-4 mx-auto max-w-md inline-flex items-center gap-2 rounded-xl border border-[#047857] bg-[#ecfdf5] text-[#171717] px-4 py-3 shadow-lg z-50"
        >
          <CheckCircle2 size={16} color="#047857" aria-hidden="true" />
          <span className="text-sm">{t("complaint.submitSuccess")}</span>
        </div>
      ) : null}
    </form>
  );
}
