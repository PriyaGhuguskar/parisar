// apps/mobile/lib/rpc-error.js
// Database RPCs raise `raise exception '<CODE>'`; supabase-js surfaces the CODE
// inside error.message (often with PostgREST text around it). Screens map the
// code to a localized message and never show the raw text to the user.
//
// JavaScript only — no TypeScript per CLAUDE.md.

/**
 * The first of `codes` that appears in the error, or null.
 * Reads error.message, error.code and error.details (PostgrestError shape),
 * and plain strings (jsonb `{ error: 'CODE' }` returns).
 *
 * @param {unknown} err
 * @param {string[]} codes
 * @returns {string|null}
 */
export function rpcErrorCode(err, codes) {
  if (!err) return null;
  const text =
    typeof err === "string"
      ? err
      : [err.message, err.code, err.details, err.error]
          .filter((v) => typeof v === "string")
          .join(" ");
  if (!text) return null;
  return codes.find((code) => text.includes(code)) ?? null;
}

/**
 * Pick a localized message for an error from a { CODE: message } map.
 * @param {unknown} err
 * @param {Record<string, string>} messages
 * @param {string} fallback message for unknown / network errors
 * @returns {string}
 */
export function localizedRpcError(err, messages, fallback) {
  const code = rpcErrorCode(err, Object.keys(messages));
  return code ? messages[code] : fallback;
}
