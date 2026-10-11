// Map GoTrue OTP errors onto stable codes, and codes onto localized keys.
// Raw GoTrue messages are English, can leak internals, and change between
// versions — never show or return them.
//
// JavaScript only — no TypeScript per CLAUDE.md.

/**
 * @param {{ status?: number, code?: string, message?: string }|null|undefined} error
 * @returns {"rate_limited"|"invalid_phone"|"network"|"unknown"}
 */
export function otpErrorCode(error) {
  if (!error) return "unknown";
  const status = Number(error.status ?? 0);
  const code = String(error.code ?? "").toLowerCase();
  const msg = String(error.message ?? "").toLowerCase();
  if (status === 429 || code.includes("rate_limit") || code === "over_sms_send_rate_limit") {
    return "rate_limited";
  }
  if (msg.includes("seconds") && msg.includes("after")) return "rate_limited";
  if (code.includes("phone") || msg.includes("invalid phone") || msg.includes("phone number")) {
    return "invalid_phone";
  }
  if (status === 0 || error.name === "AuthRetryableFetchError" || msg.includes("fetch")) {
    return "network";
  }
  return "unknown";
}

const KEY = {
  rate_limited: "auth.rateLimited",
  invalid_phone: "auth.invalidPhone",
  network: "auth.networkError",
  unknown: "auth.networkError",
};

/** i18n key (auth namespace) for an otpErrorCode. */
export function otpErrorKey(code) {
  return KEY[code] ?? "auth.networkError";
}
