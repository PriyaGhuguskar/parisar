// MOBILE ONLY — read a local `file://` URI into bytes for a Supabase Storage upload.
//
// expo-file-system 55 moved the string-based API (`readAsStringAsync`,
// `EncodingType`) to the `expo-file-system/legacy` subpath; the root export now
// ships the object API and the legacy functions THROW when called from it. We keep
// the base64 → Uint8Array path because the Supabase JS client cannot consume a
// `file://` URI directly (uploads silently send 0-byte files when you try).
//
// The dynamic import + `webpackIgnore` keeps the native module out of the web bundle.

/**
 * Decode a base64 string into a Uint8Array.
 *
 * @param {string} base64
 * @returns {Uint8Array}
 */
export function base64ToBytes(base64) {
  const binaryStr = atob(base64);
  const bytes = new Uint8Array(binaryStr.length);
  for (let i = 0; i < binaryStr.length; i++) {
    bytes[i] = binaryStr.charCodeAt(i);
  }
  return bytes;
}

/**
 * Read a local file URI as bytes via expo-file-system/legacy.
 *
 * @param {string} uri - `file://` URI from an Expo picker / manipulator
 * @returns {Promise<Uint8Array>}
 */
export async function readNativeFileAsBytes(uri) {
  const FileSystem = await import(/* webpackIgnore: true */ "expo-file-system/legacy");
  const base64 = await FileSystem.readAsStringAsync(uri, {
    encoding: FileSystem.EncodingType.Base64,
  });
  return base64ToBytes(base64);
}
