// Pure logic for the Connect With Us form: validation, payload, server error mapping and
// IST date helpers. No React, so it is unit-tested directly.
//
// The checks mirror submit_connect_request (docs/onboarding/API.md section 3). They are
// feedback only: the RPC enforces every rule again. Error values are i18n keys in the
// `connect` namespace.

import { isValidIndianMobile, toE164 } from "@/components/kit/lib/phone";

export const MAX_EXTRA_AUTHORITIES = 5;
export const SOCIETY_NAME_MAX = 120;
export const CONTACT_NAME_MAX = 80;
export const AUTHORITY_NAME_MAX = 80;
export const MESSAGE_MAX = 1000;
export const EMAIL_MAX = 254;

const IST_OFFSET = "+05:30";
const IST_ZONE = "Asia/Kolkata";
const PAST_GRACE_MS = 2 * 60 * 1000;
const MAX_AHEAD_MS = 90 * 24 * 60 * 60 * 1000;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const REQUEST_CODE_RE = /^PR-[A-Z0-9]{4}-[A-Z0-9]{4}$/;

export const EMPTY_CONNECT_FORM = Object.freeze({
  societyName: "",
  contactName: "",
  phone: "",
  email: "",
  authorities: [],
  when: "schedule",
  preferredDate: "",
  preferredTime: "",
  alternateDate: "",
  alternateTime: "",
  message: "",
});

/** "2026-11-08", "16:30" -> "2026-11-08T16:30:00+05:30", or null when either is missing. */
export function toIstIso(date, time) {
  if (!DATE_RE.test(date ?? "") || !TIME_RE.test(time ?? "")) return null;
  return `${date}T${time}:00${IST_OFFSET}`;
}

/** Today's date in India as yyyy-MM-dd, whatever the device's time zone. */
export function istDateValue(now = Date.now()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: IST_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(now));
}

export function addDaysToDateValue(value, days) {
  const [y, m, d] = value.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d + days));
  return date.toISOString().slice(0, 10);
}

const LOCALES = { en: "en-IN", hi: "hi-IN", mr: "mr-IN" };

/** A timestamp as IST text in the viewer's language, with Latin digits. */
export function formatIstDateTime(iso, lng = "en") {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const base = LOCALES[String(lng).slice(0, 2)] ?? "en-IN";
  return new Intl.DateTimeFormat(`${base}-u-nu-latn`, {
    timeZone: IST_ZONE,
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

export function isValidRequestCode(code) {
  return REQUEST_CODE_RE.test(
    String(code ?? "")
      .trim()
      .toUpperCase(),
  );
}

export function normalizeRequestCode(code) {
  return String(code ?? "")
    .trim()
    .toUpperCase();
}

function lengthBetween(text, min, max) {
  const n = String(text ?? "").trim().length;
  return n >= min && n <= max;
}

function checkSlot(date, time, now) {
  const errors = {};
  if (!date) errors.date = "form.errors.dateRequired";
  if (!time) errors.time = "form.errors.timeRequired";
  if (errors.date || errors.time) return { errors, at: null };
  const iso = toIstIso(date, time);
  const at = iso ? Date.parse(iso) : Number.NaN;
  if (Number.isNaN(at)) return { errors: { slot: "form.errors.slotInvalid" }, at: null };
  if (at < now - PAST_GRACE_MS) return { errors: { slot: "form.errors.slotInPast" }, at };
  if (at > now + MAX_AHEAD_MS) return { errors: { slot: "form.errors.slotTooFar" }, at };
  return { errors: {}, at };
}

function validateAuthorities(authorities, contactPhone) {
  const seen = new Set(isValidIndianMobile(contactPhone) ? [contactPhone] : []);
  const result = {};
  for (const row of authorities) {
    const rowErrors = {};
    if (!isValidIndianMobile(row.phone)) rowErrors.phone = "form.errors.authorityPhone";
    else if (seen.has(row.phone)) rowErrors.phone = "form.errors.authorityDuplicate";
    else seen.add(row.phone);
    if (String(row.name ?? "").trim().length > AUTHORITY_NAME_MAX) {
      rowErrors.name = "form.errors.authorityName";
    }
    if (Object.keys(rowErrors).length > 0) result[row.id] = rowErrors;
  }
  return result;
}

function validateSlots(form, now, errors) {
  const preferred = checkSlot(form.preferredDate, form.preferredTime, now);
  if (preferred.errors.date) errors.preferredDate = preferred.errors.date;
  if (preferred.errors.time) errors.preferredTime = preferred.errors.time;
  if (preferred.errors.slot) errors.preferredSlot = preferred.errors.slot;

  if (!form.alternateDate && !form.alternateTime) return;
  const alternate = checkSlot(form.alternateDate, form.alternateTime, now);
  if (alternate.errors.date) errors.alternateDate = alternate.errors.date;
  if (alternate.errors.time) errors.alternateTime = alternate.errors.time;
  if (alternate.errors.slot) errors.alternateSlot = alternate.errors.slot;
  else if (alternate.at !== null && alternate.at === preferred.at) {
    errors.alternateSlot = "form.errors.alternateSame";
  }
}

/**
 * @returns {Record<string, any>} field -> i18n key. `authorities` maps row id to
 *   { phone?, name? }. Empty when the form can be sent.
 */
export function validateConnectForm(form, now = Date.now()) {
  const errors = {};
  if (!lengthBetween(form.societyName, 2, SOCIETY_NAME_MAX)) {
    errors.societyName = "form.errors.societyName";
  }
  if (!lengthBetween(form.contactName, 2, CONTACT_NAME_MAX)) {
    errors.contactName = "form.errors.contactName";
  }
  if (!isValidIndianMobile(form.phone)) errors.phone = "form.errors.phone";
  const email = String(form.email ?? "").trim();
  if (email && (email.length > EMAIL_MAX || !EMAIL_RE.test(email))) {
    errors.email = "form.errors.email";
  }

  const authorityErrors = validateAuthorities(form.authorities ?? [], form.phone);
  if (Object.keys(authorityErrors).length > 0) errors.authorities = authorityErrors;
  if ((form.authorities ?? []).length > MAX_EXTRA_AUTHORITIES) {
    errors.authorityList = "form.errors.authorityLimit";
  }

  if (form.when !== "now") validateSlots(form, now, errors);

  if (String(form.message ?? "").trim().length > MESSAGE_MAX)
    errors.message = "form.errors.message";
  return errors;
}

/** The input for submitConnectRequest. Call only after validateConnectForm passes. */
export function buildConnectPayload(form) {
  const callNow = form.when === "now";
  const email = String(form.email ?? "").trim();
  const message = String(form.message ?? "").trim();
  return {
    societyName: form.societyName.trim(),
    contactName: form.contactName.trim(),
    phone: toE164(form.phone),
    email: email || undefined,
    authorityNumbers: (form.authorities ?? []).map((row) => {
      const name = String(row.name ?? "").trim();
      return name ? { phone: toE164(row.phone), name } : { phone: toE164(row.phone) };
    }),
    callNow,
    preferredAt: callNow ? undefined : toIstIso(form.preferredDate, form.preferredTime),
    alternateAt: callNow
      ? undefined
      : (toIstIso(form.alternateDate, form.alternateTime) ?? undefined),
    message: message || undefined,
  };
}

const FIELD_CODES = {
  INVALID_SOCIETY_NAME: ["societyName", "form.errors.societyName"],
  INVALID_CONTACT_NAME: ["contactName", "form.errors.contactName"],
  INVALID_PHONE: ["phone", "form.errors.phone"],
  INVALID_EMAIL: ["email", "form.errors.email"],
  INVALID_MESSAGE: ["message", "form.errors.message"],
  INVALID_AUTHORITY_NUMBERS: ["authorityList", "form.errors.authorityServer"],
  INVALID_AUTHORITY_NUMBER: ["authorityList", "form.errors.authorityServer"],
  SLOT_REQUIRED: ["preferredDate", "form.errors.dateRequired"],
  SLOT_IN_PAST: ["preferredSlot", "form.errors.slotInPast"],
  SLOT_TOO_FAR: ["preferredSlot", "form.errors.slotTooFar"],
  INVALID_ALTERNATE_SLOT: ["alternateSlot", "form.errors.alternateInvalid"],
};

/**
 * Map a wrapper error code to field errors or a form-level notice.
 * @returns {{ fields: Record<string,string>, notice: {tone:string,key:string}|null }}
 */
export function serverErrorState(code) {
  const field = FIELD_CODES[code];
  if (field) return { fields: { [field[0]]: field[1] }, notice: null };
  if (code === "REQUEST_ALREADY_OPEN") {
    return { fields: {}, notice: { tone: "info", key: "alreadyOpen" } };
  }
  if (code === "RATE_LIMITED" || String(code).endsWith("_RATE_LIMITED")) {
    return { fields: {}, notice: { tone: "warning", key: "rateLimited" } };
  }
  return { fields: {}, notice: { tone: "danger", key: "generic" } };
}

// Order in which the first invalid field takes focus, with its element id.
export function firstInvalidFieldId(errors, authorities = []) {
  const ordered = [
    ["societyName", "connect-society"],
    ["contactName", "connect-contact"],
    ["phone", "connect-phone"],
    ["email", "connect-email"],
  ];
  for (const [key, id] of ordered) if (errors[key]) return id;
  for (const row of authorities) {
    const rowErrors = errors.authorities?.[row.id];
    if (rowErrors?.phone) return `connect-authority-${row.id}-phone`;
    if (rowErrors?.name) return `connect-authority-${row.id}-name`;
  }
  if (errors.authorityList) return "connect-authority-add";
  const slots = [
    ["preferredDate", "connect-preferred-date"],
    ["preferredSlot", "connect-preferred-date"],
    ["preferredTime", "connect-preferred-time"],
    ["alternateDate", "connect-alternate-date"],
    ["alternateSlot", "connect-alternate-date"],
    ["alternateTime", "connect-alternate-time"],
    ["message", "connect-message"],
  ];
  for (const [key, id] of slots) if (errors[key]) return id;
  return null;
}
