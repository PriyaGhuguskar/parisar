// Shared photo capture helpers for the complaint and community composers.
//
//   showPhotoSourceChooser(t, title) → 'camera' | 'gallery' | null
//   pickAndCompressImage(source)     → { uri, bytes: ArrayBuffer, byteSize } | null
//
// expo-file-system 55 moved readAsStringAsync/EncodingType to the
// "expo-file-system/legacy" entry point — the root export throws at call time.
// Base64 → bytes goes through the `buffer` polyfill (native-speed decode)
// instead of a per-character atob loop.
//
// JavaScript only — no TypeScript per CLAUDE.md.

import { Buffer } from "buffer";
import { ActionSheetIOS, Alert, Platform } from "react-native";

const MAX_EDGE_PX = 1600;
const JPEG_QUALITY = 0.7;

/**
 * Ask the user for a photo source. Labels come from the auth namespace
 * (`common.*`), so callers pass a `t` bound to a useTranslation that includes
 * "auth".
 *
 * @param {(key: string) => string} t
 * @param {string} title
 * @returns {Promise<'camera' | 'gallery' | null>}
 */
export function showPhotoSourceChooser(t, title) {
  const takePhoto = t("auth:common.takePhoto");
  const fromGallery = t("auth:common.chooseFromGallery");
  const cancel = t("auth:common.cancel");
  return new Promise((resolve) => {
    if (Platform.OS === "ios") {
      ActionSheetIOS.showActionSheetWithOptions(
        { title, options: [takePhoto, fromGallery, cancel], cancelButtonIndex: 2 },
        (idx) => resolve(idx === 0 ? "camera" : idx === 1 ? "gallery" : null),
      );
      return;
    }
    // Android: Alert with 3 buttons is the platform-idiomatic chooser without
    // pulling in an action-sheet dependency.
    Alert.alert(
      title,
      undefined,
      [
        { text: takePhoto, onPress: () => resolve("camera") },
        { text: fromGallery, onPress: () => resolve("gallery") },
        { text: cancel, style: "cancel", onPress: () => resolve(null) },
      ],
      { cancelable: true, onDismiss: () => resolve(null) },
    );
  });
}

/**
 * Read a local file:// URI into an ArrayBuffer suitable for
 * supabase.storage.upload().
 *
 * @param {string} uri
 * @returns {Promise<ArrayBuffer>}
 */
export async function readFileAsArrayBuffer(uri) {
  const FileSystem = await import("expo-file-system/legacy");
  const base64 = await FileSystem.readAsStringAsync(uri, {
    encoding: FileSystem.EncodingType.Base64,
  });
  const buf = Buffer.from(base64, "base64");
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
}

async function launchPicker(ImagePicker, source) {
  const options = { mediaTypes: ["images"], allowsEditing: true, quality: 1 };
  if (source === "camera") {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) return null;
    return ImagePicker.launchCameraAsync(options);
  }
  const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!perm.granted) return null;
  return ImagePicker.launchImageLibraryAsync(options);
}

/**
 * Pick (camera or gallery), resize to ≤1600px on the long edge, JPEG 0.7 —
 * mandatory for Indian network conditions — and read the result as bytes.
 * Returns null when the user cancels or denies permission.
 *
 * @param {'camera' | 'gallery'} source
 * @returns {Promise<{ uri: string, bytes: ArrayBuffer, byteSize: number } | null>}
 */
export async function pickAndCompressImage(source) {
  const ImagePicker = await import("expo-image-picker");
  const ImageManipulator = await import("expo-image-manipulator");

  const result = await launchPicker(ImagePicker, source);
  if (!result || result.canceled || !result.assets?.[0]) return null;
  const asset = result.assets[0];

  const resize = asset.width > asset.height ? { width: MAX_EDGE_PX } : { height: MAX_EDGE_PX };
  const manip = await ImageManipulator.manipulateAsync(asset.uri, [{ resize }], {
    compress: JPEG_QUALITY,
    format: ImageManipulator.SaveFormat.JPEG,
  });

  const bytes = await readFileAsArrayBuffer(manip.uri);
  return { uri: manip.uri, bytes, byteSize: bytes.byteLength };
}
