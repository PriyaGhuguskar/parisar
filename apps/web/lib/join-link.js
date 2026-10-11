// apps/web/lib/join-link.js
// Society-code share links. The public link is /join/code?code=…, which
// forwards to the /onboarding wizard with the code pre-filled.
//
// JavaScript only — no TypeScript per CLAUDE.md.

// Society codes are short alphanumerics with an optional dash (e.g. PAR7-XKM2).
// Anything else is dropped rather than forwarded into the wizard.
const CODE_RE = /^[A-Za-z0-9-]{4,20}$/;

/**
 * @param {unknown} raw  untrusted query value
 * @returns {string}  normalised code, or "" when absent/invalid
 */
export function sanitizeSocietyCode(raw) {
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (typeof value !== "string") return "";
  const trimmed = value.trim().toUpperCase();
  return CODE_RE.test(trimmed) ? trimmed : "";
}

/**
 * @param {unknown} rawCode
 * @returns {string}
 */
export function onboardingHrefForCode(rawCode) {
  const code = sanitizeSocietyCode(rawCode);
  return code ? `/onboarding?code=${encodeURIComponent(code)}` : "/onboarding";
}

/**
 * Public share link for a society code. The real join route is
 * /join/code?code=… (there is no /join page). NEXT_PUBLIC_APP_URL pins the
 * canonical origin in production; otherwise the current browser origin is
 * used (local dev / preview deployments).
 *
 * @param {string|null|undefined} code
 * @returns {string}  "" when there is no code
 */
export function buildJoinUrl(code) {
  if (!code) return "";
  const configured = process.env.NEXT_PUBLIC_APP_URL;
  const origin =
    configured || (typeof window !== "undefined" && window.location ? window.location.origin : "");
  const base = String(origin).replace(/\/+$/, "");
  return `${base}/join/code?code=${encodeURIComponent(code)}`;
}
