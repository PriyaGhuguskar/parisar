"use client";

// PostComposer — post composer with the D-01/D-02 image-safety gate (web). UI-SPEC
// Screen 5. This is the most novel UI in the phase.
//
// Fields:
//   - Type segmented control: Sell | Ask for help | General (default General)
//   - Text (1–2000) + counter
//   - Up to 4 photos, each with a per-photo image-safety STATE:
//       idle → (on submit) checking → pass | reject
//     The Post button is DISABLED while any photo is checking OR any photo is reject.
//
// Submit flow (the sync-block, D-02): on submit we flip all photos to `checking`,
// read each File into an ArrayBuffer, and call createPost (the api-client
// quarantine → moderate-image → create_post handoff). We publish ONLY on { ok:true }:
//   - { ok:false, rejected } → flip the matched photos to `reject` (post NOT published)
//   - { ok:false, error:'check_failed' } → show community.imgCheckError (NOT published —
//     fail-closed; never publish an unverified image — T-06-25)
// A text-only post (0 photos) skips the gate and posts immediately.
//
// Retries are idempotent: the postId is minted ONCE per draft (ref), so a retry
// can never create a second post. Photo ids are re-minted per retry so the
// quarantine upload (upsert:false) never collides with a previous attempt's bytes.
// Photos are validated on pick (image/*, non-empty, <=10 MB) and large images are
// downscaled through a canvas before upload.
//
// createPost runs CLIENT-SIDE (browser Storage upload + functions.invoke) — it can't
// be a server action because the moderation gate consumes the browser bytes.

import { createPost } from "@parisar/api-client";
import { Ban, CheckCircle2, ImagePlus, Loader2, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { createSupabaseBrowserClient } from "../../lib/supabase/client";

const MAX_TEXT = 2000;
const MAX_PHOTOS = 4;
const MAX_PHOTO_BYTES = 10 * 1024 * 1024;
const REDIRECT_DELAY_MS = 600;
// Downscale anything larger than this (longest side, px) or heavier than
// DOWNSCALE_BYTES before upload — mirrors the mobile 1600px rule.
const MAX_DIMENSION = 1600;
const DOWNSCALE_BYTES = 1.5 * 1024 * 1024;
const JPEG_QUALITY = 0.8;

// Per-photo image-safety states (the D-02 state machine).
const STATE_IDLE = "idle";
const STATE_CHECKING = "checking";
const STATE_PASS = "pass";
const STATE_REJECT = "reject";

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

function isAcceptablePhoto(file) {
  return (
    !!file &&
    file.size > 0 &&
    file.size <= MAX_PHOTO_BYTES &&
    String(file.type ?? "").startsWith("image/")
  );
}

/**
 * Downscale a large image via canvas. Falls back to the original bytes when the
 * browser lacks createImageBitmap / canvas.toBlob or decoding fails.
 *
 * @param {File} file
 * @returns {Promise<{ bytes: Uint8Array, mimeType: string }>}
 */
async function preparePhotoBytes(file) {
  const original = async () => ({
    bytes: new Uint8Array(await file.arrayBuffer()),
    mimeType: file.type || "image/jpeg",
  });
  if (typeof createImageBitmap !== "function" || typeof document === "undefined") {
    return original();
  }
  try {
    const bitmap = await createImageBitmap(file);
    const longest = Math.max(bitmap.width, bitmap.height);
    if (longest <= MAX_DIMENSION && file.size <= DOWNSCALE_BYTES) {
      bitmap.close?.();
      return original();
    }
    const scale = Math.min(1, MAX_DIMENSION / longest);
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext("2d")?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close?.();
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", JPEG_QUALITY));
    if (!blob) return original();
    return { bytes: new Uint8Array(await blob.arrayBuffer()), mimeType: "image/jpeg" };
  } catch {
    return original();
  }
}

/**
 * @param {{ societyId: string }} props
 */
export function PostComposer({ societyId }) {
  const { t } = useTranslation("community");
  // PAR-001 fix: labels call t(), so this table is built inside the component.
  const TYPES = [
    { value: "sell", label: t("community.typeSell") },
    { value: "help", label: t("community.typeHelp") },
    { value: "general", label: t("community.typeGeneral") },
  ];
  const router = useRouter();
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);

  const [kind, setKind] = useState("general");
  const [text, setText] = useState("");
  // Each photo: { photoId, file, previewUrl, state }
  const [photos, setPhotos] = useState([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [imgCheckError, setImgCheckError] = useState(false);
  const [successOpen, setSuccessOpen] = useState(false);
  const [photoSkipped, setPhotoSkipped] = useState(false);
  // Stays true through the redirect delay so the form can't be re-submitted.
  const [submitted, setSubmitted] = useState(false);
  // One post id per draft -> retries can never publish twice.
  const postIdRef = useRef(null);
  if (postIdRef.current === null) postIdRef.current = cryptoRandomUUIDClient();
  const attemptRef = useRef(0);
  const redirectTimerRef = useRef(null);

  useEffect(() => () => clearTimeout(redirectTimerRef.current), []);

  // Revoke object URLs on unmount. The latest photos are read through a ref so the
  // cleanup never goes stale without re-subscribing the effect.
  const photosRef = useRef(photos);
  photosRef.current = photos;
  useEffect(() => {
    return () => {
      for (const p of photosRef.current) {
        if (p.previewUrl) URL.revokeObjectURL(p.previewUrl);
      }
    };
  }, []);

  const textLen = text.length;
  const textValid = text.trim().length >= 1 && textLen <= MAX_TEXT;

  // Submit gating: text valid AND no photo is checking AND no photo is reject (D-02).
  const anyChecking = photos.some((p) => p.state === STATE_CHECKING);
  const anyReject = photos.some((p) => p.state === STATE_REJECT);
  const canSubmit = textValid && !anyChecking && !anyReject && !submitting && !submitted;

  function handleAddPhotos(e) {
    const picked = Array.from(e.target.files ?? []);
    if (picked.length === 0) return;
    const files = picked.filter(isAcceptablePhoto);
    setPhotoSkipped(files.length !== picked.length);
    setImgCheckError(false);
    setPhotos((prev) => {
      const room = MAX_PHOTOS - prev.length;
      const next = files.slice(0, Math.max(0, room)).map((file) => ({
        photoId: cryptoRandomUUIDClient(),
        file,
        previewUrl: URL.createObjectURL(file),
        state: STATE_IDLE,
      }));
      return [...prev, ...next];
    });
    e.target.value = "";
  }

  function removePhoto(photoId) {
    setPhotos((prev) => {
      const target = prev.find((p) => p.photoId === photoId);
      if (target?.previewUrl) URL.revokeObjectURL(target.previewUrl);
      return prev.filter((p) => p.photoId !== photoId);
    });
    setImgCheckError(false);
  }

  function setAllPhotoStates(state) {
    setPhotos((prev) => prev.map((p) => ({ ...p, state })));
  }

  // Map rejected keys (…/{photoId}.jpg) back to photos and flip them to reject.
  function applyRejected(rejectedKeys) {
    setPhotos((prev) =>
      prev.map((p) => {
        const matched = rejectedKeys.some((k) => String(k).includes(p.photoId));
        return matched ? { ...p, state: STATE_REJECT } : { ...p, state: STATE_PASS };
      }),
    );
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!canSubmit) return;
    setError(null);
    setImgCheckError(false);
    setSubmitting(true);

    try {
      // Flip all photos to `checking` (the sync-block visual).
      if (photos.length > 0) setAllPhotoStates(STATE_CHECKING);

      // A retry re-keys the photos (fresh quarantine objects) but keeps the
      // draft's postId, so create_post can only ever succeed once.
      attemptRef.current += 1;
      const current =
        attemptRef.current > 1
          ? photos.map((p) => ({ ...p, photoId: cryptoRandomUUIDClient() }))
          : photos;
      if (current !== photos) {
        setPhotos(current.map((p) => ({ ...p, state: STATE_CHECKING })));
      }

      // Pre-process (downscale) the photo bytes for the createPost handoff.
      const photoPayload = [];
      for (const p of current) {
        const { bytes, mimeType } = await preparePhotoBytes(p.file);
        photoPayload.push({ photoId: p.photoId, bytes, mimeType });
      }

      const result = await createPost(supabase, {
        societyId,
        kind,
        body: text.trim(),
        postId: postIdRef.current,
        photos: photoPayload,
      });

      if (result.ok) {
        if (photos.length > 0) setAllPhotoStates(STATE_PASS);
        setSubmitted(true);
        setSuccessOpen(true);
        redirectTimerRef.current = setTimeout(() => {
          router.push("/community");
          router.refresh();
        }, REDIRECT_DELAY_MS);
        return;
      }

      // ok:false — fail closed (never publish).
      if (Array.isArray(result.rejected)) {
        applyRejected(result.rejected);
        setError(t("community.imgRejected"));
      } else {
        // check_failed — service unreachable / verification error.
        setImgCheckError(true);
        setAllPhotoStates(STATE_IDLE);
      }
    } catch {
      setError(t("community.postError"));
      if (photos.length > 0) setAllPhotoStates(STATE_IDLE);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      {/* Type segmented control (default General) */}
      <div className="flex flex-col gap-1">
        <p className="text-sm text-[#525252]" id="type-label">
          {t("community.typeLabel")}
        </p>
        <div
          role="radiogroup"
          aria-labelledby="type-label"
          className="flex bg-neutral-100 rounded-xl p-1 w-full"
          style={{ height: 40 }}
        >
          {TYPES.map((t) => (
            // biome-ignore lint/a11y/useSemanticElements: button + role=radio is the segmented-control idiom
            <button
              key={t.value}
              type="button"
              role="radio"
              aria-checked={kind === t.value}
              onClick={() => !submitting && setKind(t.value)}
              className={`flex-1 rounded-lg text-sm transition-colors ${
                kind === t.value
                  ? "bg-[#0E5A48] text-white font-semibold"
                  : "text-[#525252] font-normal hover:text-[#171717]"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* Text */}
      <div className="flex flex-col gap-1">
        <label htmlFor="post-text" className="text-sm text-[#525252]">
          {t("community.textLabel")}
        </label>
        <textarea
          id="post-text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={t("community.textPlaceholder")}
          maxLength={MAX_TEXT}
          rows={5}
          className="w-full rounded-lg border border-neutral-200 bg-white px-3 py-2 text-base text-[#171717] focus:outline-none focus:ring-2 focus:ring-[#12715A]"
          style={{ minHeight: 120 }}
        />
        <p
          className="text-sm self-end"
          style={{ color: textLen >= 1900 ? "#f59e0b" : "#6e6e6e" }}
          aria-live="polite"
        >
          {textLen}/{MAX_TEXT}
        </p>
      </div>

      {/* Photos with the image-safety gate */}
      <div className="flex flex-col gap-2">
        <p className="text-sm text-[#525252]">{t("community.photosLabel")}</p>
        <div className="grid grid-cols-4 gap-2">
          {photos.map((p) => (
            <div
              key={p.photoId}
              className="relative overflow-hidden rounded-lg bg-neutral-100"
              style={{
                aspectRatio: "1 / 1",
                border: p.state === STATE_REJECT ? "1.5px solid #c81e1e" : "1px solid #e5e5e5",
              }}
            >
              {/* biome-ignore lint/performance/noImgElement: blob URL preview not compatible with next/image */}
              <img src={p.previewUrl} alt="" className="w-full h-full object-cover" />

              {/* idle → remove button */}
              {p.state === STATE_IDLE ? (
                <button
                  type="button"
                  onClick={() => removePhoto(p.photoId)}
                  aria-label={t("community.removePhoto")}
                  className="absolute top-1 right-1 inline-flex items-center justify-center rounded-full"
                  style={{
                    width: 28,
                    height: 28,
                    backgroundColor: "rgba(23,23,23,0.6)",
                    color: "#fff",
                  }}
                >
                  <X size={16} aria-hidden="true" />
                </button>
              ) : null}

              {/* checking → dim + brand spinner + caption (announced via aria-live) */}
              {p.state === STATE_CHECKING ? (
                <div
                  aria-live="polite"
                  className="absolute inset-0 flex flex-col items-center justify-center gap-1"
                  style={{ backgroundColor: "rgba(23,23,23,0.6)" }}
                >
                  <Loader2 size={20} color="#12715A" className="animate-spin" aria-hidden="true" />
                  <span className="text-sm text-white">{t("community.imgChecking")}</span>
                </div>
              ) : null}

              {/* pass → brief success check */}
              {p.state === STATE_PASS ? (
                <span className="absolute top-1 right-1">
                  <CheckCircle2 size={20} color="#047857" aria-hidden="true" />
                </span>
              ) : null}

              {/* reject → danger overlay + remove */}
              {p.state === STATE_REJECT ? (
                <button
                  type="button"
                  onClick={() => removePhoto(p.photoId)}
                  aria-label={t("community.removeRejectedPhoto")}
                  className="absolute inset-0 flex items-center justify-center"
                  style={{ backgroundColor: "rgba(239,68,68,0.35)" }}
                >
                  <Ban size={24} color="#c81e1e" aria-hidden="true" />
                </button>
              ) : null}
            </div>
          ))}

          {/* Add tile while < 4 */}
          {photos.length < MAX_PHOTOS ? (
            <label
              htmlFor="post-photos"
              className="flex items-center justify-center cursor-pointer rounded-lg bg-neutral-100 text-[#6e6e6e]"
              style={{ aspectRatio: "1 / 1", border: "1.5px dashed #e5e5e5" }}
            >
              <input
                id="post-photos"
                type="file"
                accept="image/*"
                multiple
                onChange={handleAddPhotos}
                disabled={submitting || submitted}
                className="sr-only"
                aria-label={t("community.photosLabel")}
              />
              <ImagePlus size={24} aria-hidden="true" />
            </label>
          ) : null}
        </div>

        {photoSkipped ? (
          <p role="alert" className="text-sm text-[#c81e1e]">
            {t("community.imgInvalid")}
          </p>
        ) : null}

        {/* reject inline error (role=alert) */}
        {anyReject ? (
          <p role="alert" className="text-sm text-[#c81e1e]">
            {t("community.imgRejected")}
          </p>
        ) : null}

        {/* check_failed fail-closed error */}
        {imgCheckError ? (
          <p role="alert" className="text-sm text-[#c81e1e]">
            {t("community.imgCheckError")}
          </p>
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
            {t("community.posting")}
          </>
        ) : (
          t("community.postCta")
        )}
      </button>

      {error ? (
        <p role="alert" className="text-sm text-[#c81e1e]">
          {error}
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
          <span className="text-sm">{t("community.postSuccess")}</span>
        </div>
      ) : null}
    </form>
  );
}
