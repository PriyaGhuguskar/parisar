// Client-side checks that mirror the RPCs' own limits. Feedback only: every RPC
// validates again. Each returns an error key in the resident-onboarding shard, or null.

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const MOBILE_RE = /^[6-9]\d{9}$/;

export function checkName(value) {
  const v = String(value ?? "").trim();
  if (!v) return "validation.nameRequired";
  if (v.length < 2 || v.length > 80) return "validation.nameLength";
  return null;
}

export function checkEmail(value, { required = false } = {}) {
  const v = String(value ?? "").trim();
  if (!v) return required ? "validation.emailRequired" : null;
  return EMAIL_RE.test(v) ? null : "validation.emailInvalid";
}

/** 10 local digits. Optional unless required. */
export function checkMobile(value, { required = false } = {}) {
  const v = String(value ?? "").replace(/\D/g, "");
  if (!v) return required ? "validation.mobileRequired" : null;
  return MOBILE_RE.test(v) ? null : "validation.mobileInvalid";
}

/** Reason for a rejection or a report: 3 to 500 characters. */
export function checkReason(value) {
  const v = String(value ?? "").trim();
  if (!v) return "validation.reasonRequired";
  if (v.length < 3 || v.length > 500) return "validation.reasonLength";
  return null;
}

export function checkOptionalText(value, max) {
  return String(value ?? "").trim().length > max ? "validation.tooLong" : null;
}

/** yyyy-MM-dd strings compare correctly as text. */
export function checkDateRange(start, end) {
  if (start && end && end < start) return "validation.endBeforeStart";
  return null;
}

/** First key with an error, for moving focus there. */
export function firstError(errors, order) {
  return order.find((k) => errors[k]) ?? null;
}

export function hasErrors(errors) {
  return Object.values(errors).some(Boolean);
}

/** Today in Asia/Kolkata as yyyy-MM-dd, the day the server counts in. */
export function todayIst(now = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}
