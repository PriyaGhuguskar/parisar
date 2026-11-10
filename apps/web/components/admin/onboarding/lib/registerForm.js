// Register Society form: state shape, prefill from a request, validation and the
// payload for adminRegisterSociety. Pure, so it is tested without rendering.
//
// The rules mirror admin_register_society / admin_create_society so staff hear
// about a mistake before the round trip. The RPC checks everything again.

import { localDigits } from "./requestFormat";

export const PHONE_RE = /^[6-9]\d{9}$/;
const PINCODE_RE = /^[1-9]\d{5}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const OFFICIAL_PHONE_RE = /^[0-9+() -]{6,20}$/;

export const EMPTY_REGISTER_FORM = Object.freeze({
  name: "",
  societyType: "",
  registrationNumber: "",
  registrationDate: "",
  officialEmail: "",
  officialPhone: "",
  addressLine: "",
  landmark: "",
  city: "",
  state: "",
  pincode: "",
  country: "India",
  authorities: [{ name: "", phone: "", fromRequest: false }],
});

/**
 * Prefill from a connect request. Every number on the request becomes a locked row:
 * the RPC adds all of them as authorities whatever the form says, so offering to
 * remove one would be a control that does nothing.
 */
export function formFromRequest(request) {
  if (!request)
    return { ...EMPTY_REGISTER_FORM, authorities: [...EMPTY_REGISTER_FORM.authorities] };
  const seen = new Set();
  const authorities = [];
  const listed = Array.isArray(request.authority_numbers) ? request.authority_numbers : [];
  const contactPhone = localDigits(request.phone);
  for (const item of listed) {
    const phone = localDigits(item?.phone);
    if (!phone || seen.has(phone)) continue;
    seen.add(phone);
    const name = item?.name ?? (phone === contactPhone ? request.contact_name : "");
    authorities.push({ name: name ?? "", phone, fromRequest: true });
  }
  if (contactPhone && !seen.has(contactPhone)) {
    authorities.unshift({
      name: request.contact_name ?? "",
      phone: contactPhone,
      fromRequest: true,
    });
  }
  return {
    ...EMPTY_REGISTER_FORM,
    name: request.society_name ?? "",
    officialEmail: "",
    authorities: authorities.length > 0 ? authorities : [...EMPTY_REGISTER_FORM.authorities],
  };
}

// Field order is the order errors are focused in.
export const FIELD_ORDER = [
  "name",
  "societyType",
  "registrationNumber",
  "registrationDate",
  "officialEmail",
  "officialPhone",
  "addressLine",
  "landmark",
  "city",
  "state",
  "pincode",
  "country",
];

/**
 * @returns {{ fields: Record<string,string>, authorities: Array<{name?:string, phone?:string}>,
 *   authoritiesError: string|null }} codes, translated by the screen.
 */
export function validateRegisterForm(form, today) {
  const fields = {};
  const name = form.name.trim();
  if (name.length < 3 || name.length > 100) fields.name = "INVALID_NAME";
  const regNo = form.registrationNumber.trim();
  if (regNo.length > 60) fields.registrationNumber = "INVALID_REGISTRATION_NUMBER";
  if (form.registrationDate && today && form.registrationDate > today) {
    fields.registrationDate = "INVALID_REGISTRATION_DATE";
  }
  const email = form.officialEmail.trim();
  if (email && !EMAIL_RE.test(email)) fields.officialEmail = "INVALID_OFFICIAL_EMAIL";
  const officialPhone = form.officialPhone.trim();
  if (officialPhone && !OFFICIAL_PHONE_RE.test(officialPhone)) {
    fields.officialPhone = "INVALID_OFFICIAL_PHONE";
  }
  if (form.addressLine.trim().length < 5) fields.addressLine = "INVALID_ADDRESS";
  if (form.city.trim().length < 2) fields.city = "INVALID_CITY";
  if (!form.state) fields.state = "INVALID_STATE";
  if (!PINCODE_RE.test(form.pincode)) fields.pincode = "INVALID_PINCODE";
  const country = form.country.trim();
  if (country.length < 2 || country.length > 60) fields.country = "INVALID_COUNTRY";

  const seen = new Set();
  const authorities = form.authorities.map((row) => {
    const rowErrors = {};
    const rowName = row.name.trim();
    if (rowName.length < 2 || rowName.length > 80) rowErrors.name = "INVALID_AUTHORITY_NAME";
    if (!PHONE_RE.test(row.phone)) rowErrors.phone = "INVALID_AUTHORITY_PHONE";
    else if (seen.has(row.phone)) rowErrors.phone = "DUPLICATE_AUTHORITY_PHONE";
    seen.add(row.phone);
    return rowErrors;
  });
  const authoritiesError = form.authorities.length === 0 ? "AUTHORITY_REQUIRED" : null;
  return { fields, authorities, authoritiesError };
}

export function hasErrors(result) {
  return (
    Object.keys(result.fields).length > 0 ||
    result.authorities.some((row) => Object.keys(row).length > 0) ||
    Boolean(result.authoritiesError)
  );
}

/** The DOM id of the first invalid control, for focus. */
export function firstInvalidId(result) {
  const field = FIELD_ORDER.find((key) => result.fields[key]);
  if (field) return `reg-${field}`;
  const index = result.authorities.findIndex((row) => Object.keys(row).length > 0);
  if (index >= 0)
    return `reg-authority-${index}-${result.authorities[index].name ? "name" : "phone"}`;
  return null;
}

function optional(value) {
  const trimmed = String(value ?? "").trim();
  return trimmed ? trimmed : null;
}

/** adminRegisterSociety input. */
export function toRegisterInput(form, { requestId, features }) {
  return {
    name: form.name.trim(),
    addressLine: form.addressLine.trim(),
    city: form.city.trim(),
    state: form.state,
    pincode: form.pincode,
    landmark: optional(form.landmark),
    authorities: form.authorities.map((row) => ({ name: row.name.trim(), phone: row.phone })),
    requestId: requestId ?? null,
    registrationNumber: optional(form.registrationNumber),
    societyType: optional(form.societyType),
    registrationDate: optional(form.registrationDate),
    officialEmail: optional(form.officialEmail),
    officialPhone: optional(form.officialPhone),
    country: optional(form.country) ?? "India",
    features: [...features],
  };
}

// Server codes that belong to one field; anything else is shown above the form.
export const SERVER_FIELD = Object.freeze({
  INVALID_NAME: "name",
  INVALID_ADDRESS: "addressLine",
  INVALID_CITY: "city",
  INVALID_STATE: "state",
  INVALID_PINCODE: "pincode",
  INVALID_REGISTRATION_NUMBER: "registrationNumber",
  DUPLICATE_REGISTRATION_NUMBER: "registrationNumber",
  INVALID_SOCIETY_TYPE: "societyType",
  INVALID_REGISTRATION_DATE: "registrationDate",
  INVALID_OFFICIAL_EMAIL: "officialEmail",
  INVALID_OFFICIAL_PHONE: "officialPhone",
  INVALID_COUNTRY: "country",
});
