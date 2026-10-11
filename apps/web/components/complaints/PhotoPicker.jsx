"use client";

// PhotoPicker — web photo picker for File Complaint screen.
//
// Visual contract per 04-UI-SPEC.md Screen 2 (Web photo picker):
//   - <label> wrapping a hidden <input type="file" accept="image/*"> (empty state);
//     the preview + Remove button render OUTSIDE the label so Remove never
//     re-opens the file browser
//   - Dashed-border tappable area; click anywhere → file browser
//   - Empty: Camera icon + "Tap to add photo" label
//   - After selection (uploading): ActivityIndicator overlay
//   - Uploaded: preview thumbnail (URL.createObjectURL) + Remove button
//   - Error: border turns danger.500 + inline error below
//   - Client-side checks: image MIME, size > 0, max 10MB → inline error
//   - onUploadingChange(bool) lets the form block submit mid-upload; a token
//     ref drops a late upload result after Remove / re-pick
//
// Upload via uploadComplaintPhotoWeb from api-client (File → Storage, no
// base64 conversion needed in browsers).

import { uploadComplaintPhotoWeb } from "@parisar/api-client";
import { Camera, Loader2, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

const MAX_BYTES = 10 * 1024 * 1024; // 10MB

/** @param {File} file @returns {string|null} i18n key of the problem, or null */
function photoProblem(file) {
  if (!file || !file.size) return "complaint.photoError";
  if (!String(file.type ?? "").startsWith("image/")) return "complaint.photoInvalidType";
  if (file.size > MAX_BYTES) return "complaint.photoTooLarge";
  return null;
}

/**
 * @param {{
 *   supabase: object,
 *   societyId: string,
 *   complaintId: string,
 *   onUpload: (result: { storageKey: string, mimeType: string, byteSize: number }) => void,
 *   onRemove: () => void,
 *   onUploadingChange?: (uploading: boolean) => void,
 * }} props
 */
export function PhotoPicker({
  supabase,
  societyId,
  complaintId,
  onUpload,
  onRemove,
  onUploadingChange,
}) {
  const { t } = useTranslation("complaints");
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState(null);
  const [previewUrl, setPreviewUrl] = useState(null);
  const inputRef = useRef(null);
  // Bumped on every pick / remove; an upload whose token is stale is ignored.
  const tokenRef = useRef(0);

  // Revoke blob URLs on unmount or when preview changes to avoid leaks.
  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  // Invalidate any in-flight upload on unmount.
  useEffect(() => {
    return () => {
      tokenRef.current += 1;
    };
  }, []);

  function setBusy(next) {
    setUploading(next);
    onUploadingChange?.(next);
  }

  async function handleFileChange(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);

    const problem = photoProblem(file);
    if (problem) {
      setError(t(problem));
      e.target.value = "";
      return;
    }
    if (!societyId || !complaintId) {
      setError(t("complaint.photoError"));
      return;
    }

    tokenRef.current += 1;
    const token = tokenRef.current;
    setPreviewUrl(URL.createObjectURL(file));
    setBusy(true);

    try {
      const result = await uploadComplaintPhotoWeb(supabase, societyId, complaintId, file);
      if (token !== tokenRef.current) return; // removed or replaced meanwhile
      onUpload?.(result);
    } catch {
      if (token !== tokenRef.current) return;
      setError(t("complaint.photoError"));
      setPreviewUrl(null);
      if (inputRef.current) inputRef.current.value = "";
    } finally {
      if (token === tokenRef.current) setBusy(false);
    }
  }

  function handleRemove() {
    tokenRef.current += 1;
    setPreviewUrl(null);
    setError(null);
    setBusy(false);
    if (inputRef.current) inputRef.current.value = "";
    onRemove?.();
  }

  const borderStyle = {
    borderWidth: 1.5,
    borderStyle: "dashed",
    borderColor: error ? "#c81e1e" : "#e5e5e5",
  };

  return (
    <div className="flex flex-col gap-1">
      {previewUrl ? (
        <div
          className="relative w-full overflow-hidden rounded-xl bg-neutral-100"
          style={{ height: 160, ...borderStyle }}
        >
          {/* biome-ignore lint/performance/noImgElement: blob URL preview not compatible with next/image */}
          <img src={previewUrl} alt="" className="w-full h-full object-cover" />
          {uploading ? (
            <div
              className="absolute inset-0 flex items-center justify-center"
              style={{ backgroundColor: "rgba(23, 23, 23, 0.6)" }}
            >
              <Loader2 size={28} color="#ffffff" className="animate-spin" aria-hidden="true" />
            </div>
          ) : null}
          <button
            type="button"
            onClick={handleRemove}
            aria-label={t("complaint.removePhoto")}
            className="absolute top-2 right-2 inline-flex items-center justify-center rounded-full"
            style={{
              width: 28,
              height: 28,
              backgroundColor: "rgba(23, 23, 23, 0.6)",
              color: "#ffffff",
            }}
          >
            <X size={16} aria-hidden="true" />
          </button>
        </div>
      ) : null}

      <label
        htmlFor="complaint-photo-input"
        className={`${previewUrl ? "sr-only" : "block"} w-full cursor-pointer relative overflow-hidden rounded-xl bg-neutral-100`}
        style={{ height: 96, ...borderStyle }}
      >
        <input
          id="complaint-photo-input"
          ref={inputRef}
          type="file"
          accept="image/*"
          onChange={handleFileChange}
          disabled={uploading || !!previewUrl}
          className="sr-only"
          aria-label={t("complaint.photoLabel")}
        />
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-1">
          <Camera size={24} color="#6e6e6e" aria-hidden="true" />
          <span className="text-sm text-[#6e6e6e]">{t("complaint.photoPlaceholder")}</span>
        </div>
      </label>

      {error ? (
        <p role="alert" className="text-sm text-[#c81e1e] mt-1">
          {error}
        </p>
      ) : null}
    </div>
  );
}
