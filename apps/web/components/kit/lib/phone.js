// Indian mobile numbers, the only phone format Parisar accepts. Pure so server
// actions can run the same check. Mirrors IN_MOBILE_E164_RE in lib/validation.js.

const LOCAL_RE = /^[6-9]\d{9}$/;
const LOCAL_LENGTH = 10;

/**
 * Reduce typed or pasted text to at most 10 local digits. A country prefix is only
 * stripped when it is unambiguous: "+91..." always, "91..." or "0..." only when the
 * text is longer than a local number, since 91 is a legal start for a 10-digit one.
 *
 * @param {unknown} raw
 * @returns {string}
 */
export function normalizeIndianMobile(raw) {
  const text = String(raw ?? "").trim();
  const digits = text.replace(/\D/g, "");
  if (text.startsWith("+91")) return digits.slice(2, 2 + LOCAL_LENGTH);
  if (digits.length > LOCAL_LENGTH) {
    if (digits.startsWith("0091")) return digits.slice(4, 4 + LOCAL_LENGTH);
    if (digits.startsWith("91")) return digits.slice(2, 2 + LOCAL_LENGTH);
    if (digits.startsWith("0")) return digits.slice(1, 1 + LOCAL_LENGTH);
  }
  return digits.slice(0, LOCAL_LENGTH);
}

/** @param {unknown} digits */
export function isValidIndianMobile(digits) {
  return typeof digits === "string" && LOCAL_RE.test(digits);
}

/**
 * @param {unknown} digits
 * @returns {string | null} "+91XXXXXXXXXX", or null when not a valid mobile.
 */
export function toE164(digits) {
  return isValidIndianMobile(digits) ? `+91${digits}` : null;
}
