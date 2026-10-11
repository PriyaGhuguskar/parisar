// SERVER-ONLY. Wires the shared PIN logic (./pinCore.js) to this deployment's
// Supabase project and PIN_PEPPER. Imported only by "use server" actions —
// never import this from a client component (the browser must never be able
// to compute a PIN credential; see pinCore.js "WHY A PEPPER").
//
// The old client-side derivePinSecret (`pk1.<phone>.<pin>`) is gone on purpose.
//
// JavaScript only — no TypeScript per CLAUDE.md.

import "server-only";
import { assertServerEnv } from "../env";
import { makeGoTrueDeps, resolvePepper } from "./pinCore";

/** True only for `next dev` / vitest — never for a production build. */
function isDevRuntime() {
  return process.env.NODE_ENV === "development" || process.env.NODE_ENV === "test";
}

/**
 * The PIN pepper. Throws (fail closed) when PIN_PEPPER is unset outside dev.
 * @returns {string}
 */
export function getPinPepper() {
  return resolvePepper(process.env.PIN_PEPPER, { isDev: isDevRuntime() });
}

/**
 * Everything runPinLogin / runSetPin need, bound to this project.
 * @param {{ forwardedFor?: string|null }} [opts]
 */
export function pinServerDeps(opts = {}) {
  assertServerEnv();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !anonKey || !serviceKey) throw new Error("SERVER_MISCONFIGURED");
  return {
    ...makeGoTrueDeps({ url, anonKey, serviceKey, forwardedFor: opts.forwardedFor ?? null }),
    pepper: getPinPepper(),
  };
}
