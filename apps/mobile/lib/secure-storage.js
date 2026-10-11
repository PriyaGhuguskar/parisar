// Mobile auth-token storage adapter for Supabase JS.
//
// expo-secure-store values are limited to ~2 KiB on Android (older versions warn,
// some devices fail to persist). A Supabase session (access JWT with custom
// society claims + refresh token + user object) regularly exceeds that, so values
// larger than CHUNK_BYTES are split across several SecureStore entries:
//
//   <key>.__chunks   → number of chunks ("3")
//   <key>.__chunk.0  → first ≤ CHUNK_BYTES bytes
//   <key>.__chunk.1  → …
//
// Small values are stored directly under <key> (the legacy, unchunked format),
// so sessions written by older builds keep loading. Every write cleans up the
// entries of the other format and any stale trailing chunks.

import * as SecureStore from "expo-secure-store";

/** Max UTF-8 bytes per SecureStore entry (safely below Android's 2048). */
export const CHUNK_BYTES = 1800;

/** Upper bound on chunks we will read/delete — guards against a corrupt index. */
const MAX_CHUNKS = 64;

const indexKey = (key) => `${key}.__chunks`;
const chunkKey = (key, i) => `${key}.__chunk.${i}`;

/**
 * UTF-8 byte length of one code point.
 * @param {number} cp
 */
function utf8Len(cp) {
  if (cp <= 0x7f) return 1;
  if (cp <= 0x7ff) return 2;
  if (cp <= 0xffff) return 3;
  return 4;
}

/**
 * Split a string into pieces of at most `maxBytes` UTF-8 bytes each, never
 * cutting a code point in half.
 * @param {string} value
 * @param {number} maxBytes
 * @returns {string[]}
 */
export function splitUtf8(value, maxBytes) {
  const chunks = [];
  let current = "";
  let currentBytes = 0;
  for (const ch of value) {
    const len = utf8Len(ch.codePointAt(0) ?? 0);
    if (currentBytes + len > maxBytes && current) {
      chunks.push(current);
      current = "";
      currentBytes = 0;
    }
    current += ch;
    currentBytes += len;
  }
  if (current || chunks.length === 0) chunks.push(current);
  return chunks;
}

/**
 * Parse the stored chunk count; 0 when absent or invalid.
 * @param {string | null} raw
 */
function parseCount(raw) {
  if (raw == null) return 0;
  const n = Number.parseInt(raw, 10);
  return Number.isInteger(n) && n > 0 && n <= MAX_CHUNKS ? n : 0;
}

/**
 * Delete chunk entries [from, to).
 * @param {string} key
 * @param {number} from
 * @param {number} to
 */
async function deleteChunks(key, from, to) {
  for (let i = from; i < to; i += 1) {
    await SecureStore.deleteItemAsync(chunkKey(key, i));
  }
}

/**
 * Storage adapter for Supabase JS auth session persistence.
 * Implements the getItem/setItem/removeItem interface expected by supabase-js.
 */
export const secureStorage = {
  /**
   * @param {string} key
   * @returns {Promise<string | null>}
   */
  async getItem(key) {
    const count = parseCount(await SecureStore.getItemAsync(indexKey(key)));
    if (count === 0) {
      // Legacy / small value stored directly under the key.
      return SecureStore.getItemAsync(key);
    }
    const parts = [];
    for (let i = 0; i < count; i += 1) {
      const part = await SecureStore.getItemAsync(chunkKey(key, i));
      // A missing chunk means a torn write — treat the session as absent
      // rather than handing supabase-js a corrupt JSON string.
      if (part == null) return null;
      parts.push(part);
    }
    return parts.join("");
  },

  /**
   * @param {string} key
   * @param {string} value
   * @returns {Promise<void>}
   */
  async setItem(key, value) {
    const oldCount = parseCount(await SecureStore.getItemAsync(indexKey(key)));
    const chunks = splitUtf8(value, CHUNK_BYTES);

    if (chunks.length === 1) {
      // Drop the index first so the (older) chunked value can never win a read.
      if (oldCount > 0) await SecureStore.deleteItemAsync(indexKey(key));
      await SecureStore.setItemAsync(key, value);
      if (oldCount > 0) await deleteChunks(key, 0, oldCount);
      return;
    }

    if (chunks.length > MAX_CHUNKS) {
      throw new Error("secure-storage: value too large to persist");
    }

    // Drop the index first so a crash mid-write reads as "no session" instead
    // of mixing old and new chunks.
    if (oldCount > 0) await SecureStore.deleteItemAsync(indexKey(key));
    for (let i = 0; i < chunks.length; i += 1) {
      await SecureStore.setItemAsync(chunkKey(key, i), chunks[i]);
    }
    await SecureStore.setItemAsync(indexKey(key), String(chunks.length));
    // Remove the legacy single-entry value and any stale trailing chunks.
    await SecureStore.deleteItemAsync(key);
    if (oldCount > chunks.length) await deleteChunks(key, chunks.length, oldCount);
  },

  /**
   * @param {string} key
   * @returns {Promise<void>}
   */
  async removeItem(key) {
    const count = parseCount(await SecureStore.getItemAsync(indexKey(key)));
    await SecureStore.deleteItemAsync(key);
    if (count > 0) {
      await SecureStore.deleteItemAsync(indexKey(key));
      await deleteChunks(key, 0, count);
    }
  },
};
