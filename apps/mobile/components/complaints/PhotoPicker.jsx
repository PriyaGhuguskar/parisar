// PhotoPicker — mobile photo picker for File Complaint screen.
//
// Visual contract per 04-UI-SPEC.md Screen 2 (Mobile photo picker):
//   - Tappable area: neutral.100 bg / dashed 1.5px neutral.200 border / rounded-xl / 96px tall
//   - Empty: Camera icon + "Tap to add photo" label
//   - Tap → ActionSheet (iOS) or Alert (Android) with Camera / Gallery / Cancel
//   - Uploading: ActivityIndicator overlay (60% opacity dark bg)
//   - Uploaded: thumbnail preview + X remove button (24px circle, neutral.900 60% bg)
//   - Error: border turns danger.500 + inline error below
//
// Photo upload chain:
//   PhotoPicker only handles selection + showing the preview. The api-client's
//   pickAndUploadComplaintPhoto does the full pick → resize → base64 → upload work.
//   We display the preview using the ORIGINAL picker URI for instant feedback,
//   then await the upload result for the storageKey we'll pass to file_complaint.
//
// IMPORTANT: We bypass api-client's launchImageLibraryAsync wrapper for the camera
// branch (because pickAndUploadComplaintPhoto goes straight to gallery). For camera,
// we run the same chain inline. This keeps the api-client API minimal while still
// supporting both sources from the UI.

import { COMPLAINTS_BUCKET, pickAndUploadComplaintPhoto } from "@parisar/api-client";
import { Image } from "expo-image";
import { Camera, Image as ImageIcon, X } from "lucide-react-native";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { ActivityIndicator, Pressable, View } from "react-native";
import { pickAndCompressImage, showPhotoSourceChooser } from "../shared/image-capture";
import { cryptoRandomUUID } from "../shared/uuid";
import { Text } from "../ui/Text";

/**
 * Capture from the camera, then compress + upload with the same storage
 * layout as pickAndUploadComplaintPhoto. Returns the same shape (or null on
 * cancel/deny).
 */
async function captureAndUploadFromCamera(supabase, societyId, complaintId) {
  const picked = await pickAndCompressImage("camera");
  if (!picked) return null;

  // Same storage prefix layout as pickAndUploadComplaintPhoto.
  const storageKey = `${societyId}/complaints/${complaintId}/${cryptoRandomUUID()}.jpg`;
  const { error: uploadError } = await supabase.storage
    .from(COMPLAINTS_BUCKET)
    .upload(storageKey, picked.bytes, {
      contentType: "image/jpeg",
      upsert: false,
    });
  if (uploadError) throw uploadError;

  return {
    storageKey,
    mimeType: "image/jpeg",
    byteSize: picked.byteSize,
    previewUri: picked.uri,
  };
}

/**
 * @param {{
 *   supabase: object,
 *   societyId: string,
 *   complaintId: string,
 *   selectedPhoto?: { previewUri?: string, storageKey?: string } | null,
 *   onPhotoSelected: (result: { storageKey: string, mimeType: string, byteSize: number, previewUri?: string }) => void,
 *   onRemove: () => void,
 * }} props
 */
export function PhotoPicker({
  supabase,
  societyId,
  complaintId,
  selectedPhoto,
  onPhotoSelected,
  onRemove,
}) {
  const { t } = useTranslation(["complaints", "auth"]);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState(null);

  async function handleTap() {
    if (uploading) return;
    if (!societyId || !complaintId) {
      setError(t("complaint.photoError"));
      return;
    }
    setError(null);

    const source = await showPhotoSourceChooser(t, t("complaint.photoLabel"));
    if (!source) return;

    setUploading(true);
    try {
      let result;
      if (source === "camera") {
        result = await captureAndUploadFromCamera(supabase, societyId, complaintId);
      } else {
        result = await pickAndUploadComplaintPhoto(supabase, societyId, complaintId);
      }
      if (result) {
        onPhotoSelected?.(result);
      }
    } catch (err) {
      console.warn("[PhotoPicker] upload failed:", err?.message ?? err);
      setError(t("complaint.photoError"));
    } finally {
      setUploading(false);
    }
  }

  const hasPhoto = !!selectedPhoto?.previewUri || !!selectedPhoto?.storageKey;

  return (
    <View className="gap-1">
      <Pressable
        onPress={handleTap}
        disabled={uploading || hasPhoto}
        accessibilityRole="button"
        accessibilityLabel={t("complaint.photoLabel")}
        style={{
          height: hasPhoto ? 160 : 96,
          backgroundColor: "#F1F5F9",
          borderRadius: 12,
          borderWidth: 1.5,
          borderStyle: "dashed",
          borderColor: error ? "#c81e1e" : "#E2E8F0",
          overflow: "hidden",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {hasPhoto ? (
          <>
            <Image
              source={{ uri: selectedPhoto.previewUri }}
              style={{ width: "100%", height: "100%" }}
              contentFit="cover"
            />
            <Pressable
              onPress={(e) => {
                e?.stopPropagation?.();
                onRemove?.();
                setError(null);
              }}
              accessibilityRole="button"
              accessibilityLabel={t("auth:common.removePhoto")}
              style={{
                position: "absolute",
                top: 8,
                right: 8,
                width: 28,
                height: 28,
                borderRadius: 14,
                backgroundColor: "rgba(23, 23, 23, 0.6)",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <X size={16} color="#ffffff" />
            </Pressable>
          </>
        ) : (
          <View className="items-center gap-1">
            <Camera size={24} color="#64748B" />
            <Text className="text-sm text-neutral-400">{t("complaint.photoPlaceholder")}</Text>
          </View>
        )}

        {uploading ? (
          <View
            style={{
              position: "absolute",
              inset: 0,
              backgroundColor: "rgba(23, 23, 23, 0.6)",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <ActivityIndicator size="large" color="#ffffff" />
          </View>
        ) : null}
      </Pressable>

      {error ? (
        <Text className="text-sm text-danger-500 mt-1" accessibilityRole="alert">
          {error}
        </Text>
      ) : null}

      {/* Hidden text icon import to satisfy bundlers that tree-shake aggressively */}
      <View style={{ width: 0, height: 0, overflow: "hidden" }}>
        <ImageIcon size={1} color="transparent" />
      </View>
    </View>
  );
}
