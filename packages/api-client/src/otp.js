// Shared OTP / phone helpers used by BOTH the web and mobile auth flows.
// Centralized so the two apps validate identically (UI-SPEC mandates one rule set).

// Indian mobile numbers are 10 digits and start with 6, 7, 8, or 9.
const INDIAN_MOBILE_RE = /^[6-9]\d{9}$/;
// OTP is exactly 6 numeric digits (config.toml otp_length = 6).
const OTP_RE = /^\d{6}$/;

/**
 * True if `value` is a valid bare 10-digit Indian mobile number (no country code).
 * @param {unknown} value
 * @returns {boolean}
 */
export function isValidIndianMobile(value) {
  return typeof value === "string" && INDIAN_MOBILE_RE.test(value);
}

/**
 * Convert a bare 10-digit Indian mobile number to E.164 (+91XXXXXXXXXX).
 * @param {string} value
 * @returns {string}
 */
export function toE164(value) {
  if (!isValidIndianMobile(value)) {
    throw new Error("toE164: not a valid Indian mobile number");
  }
  return `+91${value}`;
}

/**
 * True if `value` looks like a 6-digit OTP code.
 * @param {unknown} value
 * @returns {boolean}
 */
export function isValidOtp(value) {
  return typeof value === "string" && OTP_RE.test(value);
}

/**
 * New-vs-returning detection. Pass the result of a
 * `profiles.select(...).eq('user_id', id).maybeSingle()` query.
 * No profile row (null/undefined) means the user is new → route to onboard.
 * @param {object|null|undefined} profile
 * @returns {boolean}
 */
export function isNewUser(profile) {
  return profile === null || profile === undefined;
}
