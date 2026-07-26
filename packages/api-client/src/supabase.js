import { createClient } from "@supabase/supabase-js";

/**
 * Create a Supabase JS client. Use the platform-appropriate wrapper:
 *  - Web (Next.js):  use the wrapper in apps/web/lib/supabase/* (Plan 04) wired via @supabase/ssr cookies.
 *  - Mobile (Expo):  pass an AsyncStorage/SecureStore-backed `storage` adapter.
 *
 * NEVER use the service-role key here; this is the public anon-key client only.
 *
 * @param {{ url: string, anonKey: string, storage?: { getItem: Function, setItem: Function, removeItem: Function } }} config
 */
export function createSupabaseClient(config) {
  if (!config.url || !config.anonKey) {
    throw new Error("Supabase config requires both url and anonKey");
  }
  return createClient(config.url, config.anonKey, {
    auth: {
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false,
      ...(config.storage ? { storage: config.storage } : {}),
    },
  });
}
