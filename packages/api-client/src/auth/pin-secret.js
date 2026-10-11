// REMOVED: client-side PIN credential derivation.
//
// This used to turn a PIN into `pk1.<phone>.<pin>` in the browser / app, which
// meant anyone with the public anon key could compute every candidate password
// and brute-force a 4-digit PIN straight against signInWithPassword
// (CODE-REVIEW HIGH 2).
//
// The PIN credential is now HMAC(PIN_PEPPER, phone:pin), computed ONLY on the
// server:
//   · mobile  → supabase.functions.invoke("pin-login", { body: { action, pin } })
//               (supabase/functions/pin-login)
//   · website → server actions pinLogin / setMyPin (apps/web/app/actions/codeLogin.js)
//
// The export is kept only so a stale import fails loudly instead of silently
// writing a guessable password.

/**
 * @deprecated Server-only now. Always throws.
 * @throws {Error} PIN_DERIVATION_IS_SERVER_ONLY
 */
export function derivePinSecret() {
  throw new Error("PIN_DERIVATION_IS_SERVER_ONLY");
}
