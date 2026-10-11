import { updateSession } from "@/lib/supabase/middleware";

/**
 * Next.js middleware — refreshes the Supabase session on every request and
 * denies signed-out access to everything outside the public allowlist
 * (lib/supabase/middleware.js isPublicPath). Per @supabase/ssr: the session must
 * be refreshed in middleware so server components receive the updated cookie.
 *
 * @param {import("next/server").NextRequest} request
 */
export async function middleware(request) {
  return updateSession(request);
}

export const config = {
  matcher: [
    // Run on every request EXCEPT static files and image optimizer.
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
