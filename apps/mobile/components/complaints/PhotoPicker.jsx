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
import {
  ActionSheetIOS,
  ActivityIndicator,
  Alert,
  Platform,
  Pressable,
  Text,
  View,
} from "react-native";

/**
 * Open the action sheet (iOS) or Alert (Android) to choose camera vs gallery.
 * Resolves with 'camera' | 'gallery' | null (cancelled).
 */
function showSourceChooser(label) {
  return new Promise((resolve) => {
    if (Platform.OS === "ios") {
      ActionSheetIOS.showActionSheetWithOptions(
        {
          options: ["Take a photo", "Choose from gallery", "Cancel"],
          cancelButtonIndex: 2,
        },
        (idx) => {
          if (idx === 0) resolve("camera");
          else if (idx === 1) resolve("gallery");
          else resolve(null);
        },
      );
    } else {
      // Android: native ActionSheet isn't built-in; Alert with 3 buttons is the
      // platform-idiomatic choice without pulling react-native-action-sheet.
      Alert.alert(label, undefined, [
        { text: "Take a photo", onPress: () => resolve("camera") },
        { text: "Choose from gallery", onPress: () => resolve("gallery") },
        { text: "Cancel", style: "cancel", onPress: () => resolve(null) },
      ]);
    }
  });
}

/**
 * Run the same compress + base64 + upload chain as pickAndUploadComplaintPhoto,
 * but starting from a camera capture instead of a gallery pick. Returns the
 * same shape (or null on cancel/deny).
 */
async function captureAndUploadFromCamera(supabase, societyId, complaintId) {
  const ImagePicker = await import("expo-image-picker");
  const ImageManipulator = await import("expo-image-manipulator");
  const FileSystem = await import("expo-file-system");

  const perm = await ImagePicker.requestCameraPermissionsAsync();
  if (!perm.granted) return null;

  const shot = await ImagePicker.launchCameraAsync({
    mediaTypes: ImagePicker.MediaTypeOptions.Images,
    allowsEditing: true,
    quality: 1,
  });
  if (shot.canceled || !shot.assets?.[0]) return null;
  const asset = shot.assets[0];

  const resize = asset.width > asset.height ? { width: 1600 } : { height: 1600 };
  const manipResult = await ImageManipulator.manipulateAsync(asset.uri, [{ resize }], {
    compress: 0.7,
    format: ImageManipulator.SaveFormat.JPEG,
  });

  const base64 = await FileSystem.readAsStringAsync(manipResult.uri, {
    encoding: FileSystem.EncodingType.Base64,
  });
  const binaryStr = atob(base64);
  const bytes = new Uint8Array(binaryStr.length);
  for (let i = 0; i < binaryStr.length; i++) {
    bytes[i] = binaryStr.charCodeAt(i);
  }

  // Same storage prefix layout as pickAndUploadComplaintPhoto.
  const photoId =
    globalThis.crypto && typeof globalThis.crypto.randomUUID === "function"
      ? globalThis.crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const storageKey = `${societyId}/complaints/${complaintId}/${photoId}.jpg`;

  const { error: uploadError } = await supabase.storage
    .from(COMPLAINTS_BUCKET)
    .upload(storageKey, bytes.buffer, {
      contentType: "image/jpeg",
      upsert: false,
    });
  if (uploadError) throw uploadError;

  return {
    storageKey,
    mimeType: "image/jpeg",
    byteSize: bytes.length,
    previewUri: manipResult.uri,
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
  const { t } = useTranslation("complaints");
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState(null);

  async function handleTap() {
    if (uploading) return;
    if (!societyId || !complaintId) {
      setError(t("complaint.photoError"));
      return;
    }
    setError(null);

    const source = await showSourceChooser(t("complaint.photoLabel"));
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
          backgroundColor: "#f5f5f5",
          borderRadius: 12,
          borderWidth: 1.5,
          borderStyle: "dashed",
          borderColor: error ? "#c81e1e" : "#e5e5e5",
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
              accessibilityLabel="Remove photo"
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
            <Camera size={24} color="#6e6e6e" />
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
