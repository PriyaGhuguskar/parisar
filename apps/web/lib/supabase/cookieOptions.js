// apps/web/lib/supabase/cookieOptions.js
// Attributes for the Supabase auth cookies (sb-<ref>-auth-token[.N]), shared by
// the browser, server and middleware clients so all three write identical cookies.
//
// · secure: true in production — the session never travels over plain http.
// · sameSite: "lax" — sent on top-level navigations (share links work) but not
//   on cross-site sub-requests / form POSTs (CSRF). Server actions additionally
//   get Next's built-in Origin check.
// · path: "/".
// · httpOnly is deliberately NOT set (@supabase/ssr default: false). The browser
//   client (createBrowserClient) reads and refreshes the session from
//   document.cookie — Realtime, Storage uploads and the client-side OTP verify
//   all depend on it. An httpOnly auth cookie would silently sign every client
//   component out. XSS exposure is limited instead by the CSP in next.config.js.
// · Do NOT set `name` here: in @supabase/ssr it renames the storage key and would
//   log every existing user out.
//
// JavaScript only — no TypeScript per CLAUDE.md.

/** @type {{ path: string, sameSite: "lax", secure: boolean }} */
export const AUTH_COOKIE_OPTIONS = Object.freeze({
  path: "/",
  sameSite: "lax",
  secure: process.env.NODE_ENV === "production",
});
