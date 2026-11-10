// Pure helpers for the Connect With Us request screens in the staff console.
// No React, no i18n: callers pass the language and translate the codes.
//
// Times are shown and entered in IST (Asia/Kolkata). The public form stores
// `preferred_slot` as IST text and Parisar's staff work in India, so pinning the
// zone keeps the table, the detail and the reschedule input in agreement whatever
// the browser's own zone is.

export const IST = "Asia/Kolkata";
export const IST_OFFSET = "+05:30";

// Statuses a request can still be worked in. Mirrors admin_list_connect_requests.
export const OPEN_STATUSES = Object.freeze(["new", "call_scheduled", "rescheduled", "contacted"]);

// What the status filter offers, in lifecycle order. `open` is the RPC's shortcut.
export const STATUS_FILTER_VALUES = Object.freeze([
  "open",
  "new",
  "call_scheduled",
  "rescheduled",
  "contacted",
  "registered",
  "rejected",
]);

// "Submitted within" filter, in days, mapped onto p_from.
export const SUBMITTED_WITHIN_DAYS = Object.freeze([7, 30, 90]);

const DAY_MS = 24 * 60 * 60 * 1000;
const SLOT_PAST_GRACE_MS = 2 * 60 * 1000;
const SLOT_MAX_DAYS = 90;

export function isOpenStatus(status) {
  return OPEN_STATUSES.includes(status);
}

function localeFor(lng) {
  return lng === "hi" || lng === "mr" ? `${lng}-IN` : "en-IN";
}

function validDate(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** "Sat, 7 Nov 2026" in IST, Latin digits. Null for a missing or bad value. */
export function formatSlotDate(value, lng = "en") {
  const date = validDate(value);
  if (!date) return null;
  return new Intl.DateTimeFormat(localeFor(lng), {
    timeZone: IST,
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
    numberingSystem: "latn",
  }).format(date);
}

/** "4:30 pm" in IST, Latin digits. Null for a missing or bad value. */
export function formatSlotTime(value, lng = "en") {
  const date = validDate(value);
  if (!date) return null;
  return new Intl.DateTimeFormat(localeFor(lng), {
    timeZone: IST,
    hour: "numeric",
    minute: "2-digit",
    numberingSystem: "latn",
  }).format(date);
}

/** Date and time together, for history rows and detail fields. */
export function formatDateTime(value, lng = "en") {
  const date = formatSlotDate(value, lng);
  const time = formatSlotTime(value, lng);
  return date && time ? `${date}, ${time}` : null;
}

/** The slot a request is currently booked for: a staff reschedule wins over the ask. */
export function currentSlot(request) {
  if (!request || request.call_now) return null;
  return request.scheduled_at ?? request.preferred_at ?? null;
}

/** "+919876543210" or "9876543210" -> "+91 98765 43210". Anything else unchanged. */
export function displayPhone(phone) {
  const digits = String(phone ?? "").replace(/\D/g, "");
  const local = digits.length === 12 && digits.startsWith("91") ? digits.slice(2) : digits;
  if (local.length !== 10) return phone ? String(phone) : "";
  return `+91 ${local.slice(0, 5)} ${local.slice(5)}`;
}

/** The 10 local digits of a stored phone, or "" when it is not one. */
export function localDigits(phone) {
  const digits = String(phone ?? "").replace(/\D/g, "");
  if (digits.length === 12 && digits.startsWith("91")) return digits.slice(2);
  return digits.length === 10 ? digits : "";
}

/** A dialable tel: href, or null when the stored phone is unusable. */
export function telHref(phone) {
  const local = localDigits(phone);
  return local ? `tel:+91${local}` : null;
}

/** How many numbers a request carries. Older rows have an empty list but one phone. */
export function authorityCount(request) {
  const list = Array.isArray(request?.authority_numbers) ? request.authority_numbers : [];
  return Math.max(list.length, request?.phone ? 1 : 0);
}

/** Today in IST as yyyy-MM-dd. */
export function todayInIst(now = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: IST,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

/** yyyy-MM-dd that is `days` after `dateValue`. */
export function addDays(dateValue, days) {
  const [y, m, d] = dateValue.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d + days));
  return date.toISOString().slice(0, 10);
}

/**
 * Check a reschedule entry and build the timestamp the RPC wants. The rules mirror
 * admin_reschedule_connect_request (no more than 2 minutes past, at most 90 days
 * ahead, note up to 500); the RPC enforces them again.
 *
 * @returns {{ ok: true, scheduledAt: string, note: string|null } | { ok: false, errors: object }}
 */
export function validateReschedule({ date, time, note }, now = new Date()) {
  const errors = {};
  if (!date) errors.date = "SLOT_DATE_REQUIRED";
  if (!time || !/^\d{2}:\d{2}$/.test(time)) errors.time = "SLOT_TIME_REQUIRED";
  const trimmedNote = String(note ?? "").trim();
  if (trimmedNote.length > 500) errors.note = "INVALID_NOTE";
  if (errors.date || errors.time) return { ok: false, errors };

  const scheduledAt = `${date}T${time}:00${IST_OFFSET}`;
  const at = Date.parse(scheduledAt);
  if (Number.isNaN(at)) return { ok: false, errors: { ...errors, date: "SLOT_DATE_REQUIRED" } };
  if (at < now.getTime() - SLOT_PAST_GRACE_MS) errors.time = "SLOT_IN_PAST";
  else if (at > now.getTime() + SLOT_MAX_DAYS * DAY_MS) errors.date = "SLOT_TOO_FAR";
  if (Object.keys(errors).length > 0) return { ok: false, errors };
  return { ok: true, scheduledAt, note: trimmedNote || null };
}

/** Reason rules of admin_reject_connect_request: 3 to 500 characters. */
export function validateRejectReason(reason) {
  const trimmed = String(reason ?? "").trim();
  if (trimmed.length < 3 || trimmed.length > 500) return { ok: false, error: "INVALID_REASON" };
  return { ok: true, reason: trimmed };
}

/** Turn the table's query into wrapper arguments. */
export function listQueryToArgs({ search, filterValues = {}, page = 1, pageSize = 20 }, now) {
  const within = Number(filterValues.submitted);
  const from =
    within > 0 ? new Date((now ?? new Date()).getTime() - within * DAY_MS).toISOString() : null;
  return {
    search: search?.trim() ? search.trim() : null,
    status: filterValues.status || null,
    from,
    limit: pageSize,
    offset: Math.max(page - 1, 0) * pageSize,
  };
}

/** "connect.rescheduled" -> "rescheduled", for i18n keys without dots. */
export function historyActionKey(action) {
  return String(action ?? "").replace(/^connect\./, "") || "unknown";
}
