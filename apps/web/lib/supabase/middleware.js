// Middleware-side Supabase client. Refreshes the auth session cookie on EVERY request.
// Per @supabase/ssr docs: the middleware is the ONLY place safe to refresh server-side
// because it can both read AND write response cookies.

import { createServerClient } from "@supabase/ssr";
import { NextResponse } from "next/server";

/**
 * Update the Supabase session cookie on every request.
 * Must be called from apps/web/middleware.js.
 *
 * @param {import("next/server").NextRequest} request
 */
export async function updateSession(request) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          for (const { name, value } of cookiesToSet) {
            request.cookies.set(name, value);
          }
          response = NextResponse.next({ request });
          for (const { name, value, options } of cookiesToSet) {
            response.cookies.set(name, value, options);
          }
        },
      },
    },
  );

  // IMPORTANT: do not run code between createServerClient and supabase.auth.getUser().
  // A simple mistake could make it very hard to debug issues with users being randomly
  // logged out (per @supabase/ssr docs).
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // user is available here for redirect logic if needed; Phase 1 just refreshes.
  void user;

  return response;
}
