// apps/mobile/lib/token-claims.js
// The Custom Access Token hook (inject_society_claims) puts society_id, role and
// guard_society_id into the ACCESS TOKEN's app_metadata — not into the user
// record that supabase-js returns as session.user. Screens read
// session.user.app_metadata, so without this they saw no society and no role
// (authorities showed as "Member", the home header had no society).
//
// withTokenClaims(session) returns a NEW session whose user.app_metadata also
// carries the token's app_metadata claims. Nothing is mutated.
//
// JavaScript only — no TypeScript per CLAUDE.md.

const B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

/** base64url → UTF-8 string, without relying on atob/Buffer being present. */
function decodeBase64Url(input) {
  const s = input.replace(/-/g, "+").replace(/_/g, "/");
  const bytes = [];
  let buffer = 0;
  let bits = 0;
  for (const ch of s) {
    if (ch === "=") break;
    const v = B64.indexOf(ch);
    if (v < 0) continue;
    buffer = (buffer << 6) | v;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      bytes.push((buffer >> bits) & 0xff);
    }
  }
  return decodeURIComponent(bytes.map((b) => `%${b.toString(16).padStart(2, "0")}`).join(""));
}

/** The JWT payload as an object, or null when it can't be read. */
export function decodeJwtPayload(token) {
  try {
    const part = String(token ?? "").split(".")[1];
    if (!part) return null;
    return JSON.parse(decodeBase64Url(part));
  } catch {
    return null;
  }
}

/**
 * @param {object|null} session supabase-js session
 * @returns {object|null} the same session with token claims merged into
 *   user.app_metadata (token values win — they are what RLS sees)
 */
export function withTokenClaims(session) {
  if (!session?.access_token || !session.user) return session;
  const claims = decodeJwtPayload(session.access_token)?.app_metadata;
  if (!claims || typeof claims !== "object") return session;
  return {
    ...session,
    user: {
      ...session.user,
      app_metadata: { ...(session.user.app_metadata ?? {}), ...claims },
    },
  };
}
