// apps/web/lib/env.js
// Fail fast on a misconfigured PRODUCTION deployment.
//
// Without this, a missing secret surfaces as a confusing runtime failure deep in
// some request (PIN login quietly returning SERVER_ERROR, every page a blank RLS
// result). Called from the server-only modules that need these values; the
// check runs once per server process.
//
// Only names are ever reported — never values.
//
// JavaScript only — no TypeScript per CLAUDE.md.

import "server-only";

const REQUIRED_IN_PRODUCTION = Object.freeze([
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "PIN_PEPPER",
]);

let checked = false;

/**
 * Throw a clear error in production when a required variable is missing. In
 * development / test this is a no-op (local dev runs on dev fallbacks).
 *
 * @param {Record<string, string|undefined>} [env]
 */
export function assertServerEnv(env = process.env) {
  if (checked || env.NODE_ENV !== "production") return;
  const missing = REQUIRED_IN_PRODUCTION.filter((name) => !String(env[name] ?? "").trim());
  if (missing.length > 0) {
    throw new Error(`Missing required server environment variables: ${missing.join(", ")}`);
  }
  checked = true;
}
