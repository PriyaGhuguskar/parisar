// Server-side Supabase client for Next.js App Router (RSC, route handlers, server actions).
// Uses @supabase/ssr — the only supported package per STACK.md.
// NEVER use @supabase/auth-helpers-nextjs — it is deprecated.

import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

/**
 * Create a Supabase client for server-side usage (RSC, route handlers, server actions).
 * Uses cookie-based session via @supabase/ssr.
 */
export async function createSupabaseServerClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            for (const { name, value, options } of cookiesToSet) {
              cookieStore.set(name, value, options);
            }
          } catch {
            // Called from a Server Component (read-only context).
            // Middleware will handle session refresh on the next request.
          }
        },
      },
    },
  );
}
