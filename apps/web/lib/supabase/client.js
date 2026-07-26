"use client";

// Browser-side Supabase client for Next.js client components.
// Uses @supabase/ssr's createBrowserClient (NOT createClient) so cookies stay in sync.

import { createBrowserClient } from "@supabase/ssr";

/**
 * Create a Supabase client for browser-side usage (client components).
 * Returns a client backed by cookies, compatible with @supabase/ssr.
 */
export function createSupabaseBrowserClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  );
}
