// Mobile auth-token storage adapter for Supabase JS.
//
// Per ARCHITECTURE.md: SecureStore has a 2 KiB value limit on Android.
// JWT tokens are typically <2 KiB but RSA-signed claims can push past that, so we
// use plain SecureStore for Phase 1 (small JWTs) and keep the adapter interface clean
// for a future chunking strategy if needed.

import * as SecureStore from "expo-secure-store";

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
    const value = await SecureStore.getItemAsync(key);
    return value;
  },

  /**
   * @param {string} key
   * @param {string} value
   * @returns {Promise<void>}
   */
  async setItem(key, value) {
    await SecureStore.setItemAsync(key, value);
  },

  /**
   * @param {string} key
   * @returns {Promise<void>}
   */
  async removeItem(key) {
    await SecureStore.deleteItemAsync(key);
  },
};
