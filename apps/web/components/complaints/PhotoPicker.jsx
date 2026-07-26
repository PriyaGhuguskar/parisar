"use client";

// PhotoPicker — web photo picker for File Complaint screen.
//
// Visual contract per 04-UI-SPEC.md Screen 2 (Web photo picker):
//   - <label> wrapping a hidden <input type="file" accept="image/*">
//   - Dashed-border tappable area; click anywhere → file browser
//   - Empty: Camera icon + "Tap to add photo" label
//   - After selection (uploading): ActivityIndicator overlay
//   - Uploaded: preview thumbnail (URL.createObjectURL) + Remove button
//   - Error: border turns danger.500 + inline error below
//   - Client-side max size: 10MB → "photoTooLarge" inline error
//
// Upload via uploadComplaintPhotoWeb from api-client (File → Storage, no
// base64 conversion needed in browsers).

import { uploadComplaintPhotoWeb } from "@parisar/api-client";
import { Camera, Loader2, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

const MAX_BYTES = 10 * 1024 * 1024; // 10MB

/**
 * @param {{
 *   supabase: object,
 *   societyId: string,
 *   complaintId: string,
 *   onUpload: (result: { storageKey: string, mimeType: string, byteSize: number }) => void,
 *   onRemove: () => void,
 * }} props
 */
export function PhotoPicker({ supabase, societyId, complaintId, onUpload, onRemove }) {
  const { t } = useTranslation("complaints");
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState(null);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [hasPhoto, setHasPhoto] = useState(false);
  const inputRef = useRef(null);

  // Revoke blob URLs on unmount or when preview changes to avoid leaks.
  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  async function handleFileChange(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);

    if (file.size > MAX_BYTES) {
      setError(t("complaint.photoTooLarge"));
      e.target.value = "";
      return;
    }
    if (!societyId || !complaintId) {
      setError(t("complaint.photoError"));
      return;
    }

    // Immediate preview via object URL.
    const objectUrl = URL.createObjectURL(file);
    setPreviewUrl(objectUrl);
    setHasPhoto(true);
    setUploading(true);

    try {
      const result = await uploadComplaintPhotoWeb(supabase, societyId, complaintId, file);
      onUpload?.(result);
    } catch (err) {
      console.warn("[PhotoPicker] upload failed:", err?.message ?? err);
      setError(t("complaint.photoError"));
      // Roll back preview on failure
      URL.revokeObjectURL(objectUrl);
      setPreviewUrl(null);
      setHasPhoto(false);
    } finally {
      setUploading(false);
    }
  }

  function handleRemove(e) {
    e?.preventDefault?.();
    e?.stopPropagation?.();
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(null);
    setHasPhoto(false);
    setError(null);
    if (inputRef.current) inputRef.current.value = "";
    onRemove?.();
  }

  const borderColor = error ? "#c81e1e" : "#e5e5e5";

  return (
    <div className="flex flex-col gap-1">
      <label
        htmlFor="complaint-photo-input"
        className="block w-full cursor-pointer relative overflow-hidden rounded-xl bg-neutral-100"
        style={{
          height: hasPhoto ? 160 : 96,
          borderWidth: 1.5,
          borderStyle: "dashed",
          borderColor,
        }}
      >
        <input
          id="complaint-photo-input"
          ref={inputRef}
          type="file"
          accept="image/*"
          onChange={handleFileChange}
          disabled={uploading || hasPhoto}
          className="sr-only"
          aria-label={t("complaint.photoLabel")}
        />

        {hasPhoto && previewUrl ? (
          <>
            {/* biome-ignore lint/performance/noImgElement: blob URL preview not compatible with next/image */}
            <img src={previewUrl} alt="" className="w-full h-full object-cover" />
            <button
              type="button"
              onClick={handleRemove}
              aria-label="Remove photo"
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
          </>
        ) : (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-1">
            <Camera size={24} color="#6e6e6e" aria-hidden="true" />
            <span className="text-sm text-[#6e6e6e]">{t("complaint.photoPlaceholder")}</span>
          </div>
        )}

        {uploading ? (
          <div
            className="absolute inset-0 flex items-center justify-center"
            style={{ backgroundColor: "rgba(23, 23, 23, 0.6)" }}
          >
            <Loader2 size={28} color="#ffffff" className="animate-spin" />
          </div>
        ) : null}
      </label>

      {error ? (
        <p role="alert" className="text-sm text-[#c81e1e] mt-1">
          {error}
        </p>
      ) : null}
    </div>
  );
}
