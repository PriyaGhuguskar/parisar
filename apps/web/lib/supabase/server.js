// Server-side Supabase client for Next.js App Router (RSC, route handlers, server actions).
// Uses @supabase/ssr — the only supported package per STACK.md.
// NEVER use @supabase/auth-helpers-nextjs — it is deprecated.

import "server-only";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { assertServerEnv } from "../env";
import { AUTH_COOKIE_OPTIONS } from "./cookieOptions";

/**
 * Create a Supabase client for server-side usage (RSC, route handlers, server actions).
 * Uses cookie-based session via @supabase/ssr.
 */
export async function createSupabaseServerClient() {
  // Fail fast (production only) when a required secret is missing.
  if (process.env.NEXT_PHASE !== "phase-production-build") assertServerEnv();
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookieOptions: AUTH_COOKIE_OPTIONS,
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
