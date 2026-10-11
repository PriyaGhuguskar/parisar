// Mobile Supabase client — singleton, SecureStore-backed session.
// Uses @parisar/api-client's createSupabaseClient factory.

import { createSupabaseClient } from "@parisar/api-client";
import Constants from "expo-constants";
import { secureStorage } from "./secure-storage";

const extra = Constants.expoConfig?.extra ?? {};

const SUPABASE_URL = extra.supabaseUrl ?? process.env.EXPO_PUBLIC_SUPABASE_URL ?? "";

const SUPABASE_ANON_KEY = extra.supabaseAnonKey ?? process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? "";

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  // Runtime error rather than silent fallback so the misconfig is visible at boot.
  throw new Error(
    "Mobile app missing EXPO_PUBLIC_SUPABASE_URL or EXPO_PUBLIC_SUPABASE_ANON_KEY. " +
      "Run `supabase status` and copy the values into apps/mobile/.env.local.",
  );
}

/** @type {ReturnType<typeof createSupabaseClient> | null} */
let client = null;

/**
 * Get the singleton Supabase client for the mobile app.
 * Lazily initializes with SecureStore-backed session persistence.
 *
 * @returns {ReturnType<typeof createSupabaseClient>}
 */
export function getSupabase() {
  if (!client) {
    client = createSupabaseClient({
      url: SUPABASE_URL,
      anonKey: SUPABASE_ANON_KEY,
      storage: secureStorage,
    });
  }
  return client;
}
