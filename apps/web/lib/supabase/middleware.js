// Middleware-side Supabase client. Refreshes the auth session cookie on EVERY request.
// Per @supabase/ssr docs: the middleware is the ONLY place safe to refresh server-side
// because it can both read AND write response cookies.

import { createServerClient } from "@supabase/ssr";
import { NextResponse } from "next/server";
import { devRoutesEnabled } from "../devRoutes";
import { AUTH_COOKIE_OPTIONS } from "./cookieOptions";

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
      cookieOptions: AUTH_COOKIE_OPTIONS,
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

  // DENY BY DEFAULT (CODE-REVIEW M9): a signed-out request may only reach the
  // public allowlist. Pages still run their own getUser() guards — this is the
  // outer layer, so a page that forgets its guard is not left open.
  const { pathname, search } = request.nextUrl;
  // Dev-only routes need NODE_ENV=development AND ENABLE_DEV_ROUTES=1 (lib/devRoutes.js).
  const isDev = devRoutesEnabled();
  if (!user && !isPublicPath(pathname, { isDev })) {
    const target = request.nextUrl.clone();
    // Dev keeps the (protected) layout's convenience of auto-signing in.
    target.pathname = isDev ? "/dev-login" : "/login";
    target.search = "";
    // Keep the full path + query (e.g. /join/code?code=PAR7-XKM2) so the visitor
    // lands back on it after signing in. Only a same-origin relative path is
    // ever carried; /login and /verify re-validate it (safeNextPath).
    target.searchParams.set("next", sameOriginNext(`${pathname}${search}`));
    const redirect = NextResponse.redirect(target);
    // Carry any refreshed/cleared auth cookies over to the redirect.
    for (const c of response.cookies.getAll()) redirect.cookies.set(c);
    return redirect;
  }

  return response;
}

// Reachable without a session. Everything else redirects to /login?next=.
const PUBLIC_EXACT = new Set([
  "/",
  "/login",
  "/verify",
  "/enroll",
  "/work-with-us",
  "/api/health",
  "/manifest.webmanifest",
  "/robots.txt",
  "/sitemap.xml",
  "/favicon.ico",
]);
// /join/* is NOT public: a signed-out visitor following a share link is sent to
// /login?next=/join/code?code=… by the redirect above, so the code survives the
// sign-in (the (protected) layout's own redirect would drop it).
const PUBLIC_PREFIXES = ["/_next/"];
const DEV_ONLY = new Set(["/dev-login", "/dev-preview"]);
// Files from /public (images, icons, fonts) — never sensitive.
const STATIC_FILE_RE = /\/[^/]+\.[A-Za-z0-9]{1,8}$/;

/**
 * @param {string} pathname
 * @param {{ isDev?: boolean }} [opts]
 * @returns {boolean}
 */
export function isPublicPath(pathname, { isDev = false } = {}) {
  const p = String(pathname || "/");
  const normalized = p.length > 1 ? p.replace(/\/+$/, "") : p;
  if (PUBLIC_EXACT.has(normalized)) return true;
  if (isDev && DEV_ONLY.has(normalized)) return true;
  if (PUBLIC_PREFIXES.some((pre) => normalized.startsWith(pre))) return true;
  return STATIC_FILE_RE.test(normalized);
}

/**
 * The `next` value for the sign-in redirect: a same-origin path ("/x", never
 * "//host" or "/\host", which browsers treat as protocol-relative), else
 * "/dashboard".
 *
 * @param {string} path
 * @returns {string}
 */
export function sameOriginNext(path) {
  return typeof path === "string" && /^\/(?![/\\])/.test(path) ? path : "/dashboard";
}
