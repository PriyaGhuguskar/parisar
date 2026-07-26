import { updateSession } from "@/lib/supabase/middleware";

/**
 * Next.js middleware — wires Supabase session refresh on every request.
 * Per @supabase/ssr: session must be refreshed in middleware so server components
 * receive the updated cookie without a round-trip.
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
