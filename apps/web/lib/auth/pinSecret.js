// Turns a resident's 4-digit PIN into something Supabase Auth will accept.
//
// WHY THIS EXISTS: GoTrue hard-rejects passwords under 6 characters
// (weak_password/length) and setting minimum_password_length lower does not
// override it — the container reports the lower value and enforces 6 anyway.
// The product's PIN is 4 digits, so it cannot be the password verbatim.
//
// WHAT THIS DOES AND DOES NOT BUY:
//   · It satisfies the length rule so PIN sign-in works at all.
//   · It does NOT add entropy. A 4-digit PIN is 10,000 combinations, and this
//     value is derived from the PIN plus the phone number — both of which an
//     attacker targeting a specific resident already knows.
//
// So the real defence is attempt limiting (auth.rate_limit.sign_in_sign_ups in
// supabase/config.toml), exactly as it is for a bank card PIN. Do not read this
// function as strengthening anything; it is a format adapter.
//
// It must produce the identical string when the PIN is SET and when it is USED,
// and it has to be computable in the browser, because signInWithPassword runs
// client-side so the session cookies land in the browser.

const VERSION = "pk1";

/**
 * @param {string} phoneE164 e.g. "+919812345678"
 * @param {string} pin       exactly 4 digits
 * @returns {string} deterministic secret, always >= 6 chars
 */
export function derivePinSecret(phoneE164, pin) {
  const phone = String(phoneE164 ?? "").replace(/\D/g, "");
  const clean = String(pin ?? "");
  if (!/^\d{4}$/.test(clean)) throw new Error("INVALID_PIN");
  if (!phone) throw new Error("INVALID_PHONE");
  return `${VERSION}.${phone}.${clean}`;
}
