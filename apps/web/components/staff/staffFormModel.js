// Staff form state, validation and the mapping to manager_save_staff. Pure: no
// React, so it is unit-tested directly. The RPC re-checks every rule; these checks
// only give feedback at the field before a round trip.
//
// JavaScript only — no TypeScript per CLAUDE.md.

import { ID_PROOF_TYPE, STAFF_ROLE, STAFF_SHIFT } from "@parisar/shared-types";
import { isValidIndianMobile, normalizeIndianMobile } from "@/components/kit/lib/phone";

export const STAFF_CATEGORIES = STAFF_ROLE;
export const STAFF_SHIFTS = STAFF_SHIFT;
export const ID_PROOF_TYPES = ID_PROOF_TYPE;

/** Field order, so focus can move to the first invalid one. */
export const STAFF_FIELDS = [
  "name",
  "lastName",
  "category",
  "phone",
  "email",
  "joiningDate",
  "employeeId",
  "vendorName",
  "shift",
  "emergencyContactName",
  "emergencyContactPhone",
  "idProofType",
];

export function emptyStaffForm() {
  return Object.fromEntries(STAFF_FIELDS.map((key) => [key, ""]));
}

/** A Staff object from the API, as form values. */
export function staffToForm(staff) {
  const s = staff ?? {};
  return {
    name: s.name ?? "",
    lastName: s.last_name ?? "",
    category: s.category ?? "",
    phone: s.phone ?? "",
    email: s.email ?? "",
    joiningDate: s.joining_date ?? "",
    employeeId: s.employee_id ?? "",
    vendorName: s.vendor_name ?? "",
    shift: s.shift ?? "",
    emergencyContactName: s.emergency_contact_name ?? "",
    emergencyContactPhone: s.emergency_contact_phone ?? "",
    idProofType: s.id_proof_type ?? "",
  };
}

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

export function addDays(isoDate, days) {
  const d = new Date(`${isoDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/**
 * @param {ReturnType<typeof emptyStaffForm>} form
 * @param {{ today: string }} options today as yyyy-MM-dd
 * @returns {Record<string, string>} field -> error key (staff-nav `staffForm.error.*`)
 */
export function validateStaffForm(form, { today }) {
  const errors = {};
  const name = form.name.trim();
  if (!name) errors.name = "nameRequired";
  else if (name.length < 2 || name.length > 80) errors.name = "nameLength";
  if (form.lastName.trim().length > 80) errors.lastName = "lastNameLength";
  if (!form.category) errors.category = "categoryRequired";
  else if (!STAFF_CATEGORIES.includes(form.category)) errors.category = "categoryInvalid";
  if (form.phone && !isValidIndianMobile(normalizeIndianMobile(form.phone))) {
    errors.phone = "phoneInvalid";
  }
  const email = form.email.trim();
  if (email && (email.length > 254 || !EMAIL_RE.test(email))) errors.email = "emailInvalid";
  if (form.joiningDate && today && form.joiningDate > addDays(today, 365)) {
    errors.joiningDate = "joiningDateTooLate";
  }
  if (form.employeeId.trim().length > 40) errors.employeeId = "employeeIdLength";
  if (form.vendorName.trim().length > 120) errors.vendorName = "vendorLength";
  if (form.shift && !STAFF_SHIFTS.includes(form.shift)) errors.shift = "shiftInvalid";
  if (form.emergencyContactName.trim().length > 80) {
    errors.emergencyContactName = "contactNameLength";
  }
  if (
    form.emergencyContactPhone &&
    !isValidIndianMobile(normalizeIndianMobile(form.emergencyContactPhone))
  ) {
    errors.emergencyContactPhone = "phoneInvalid";
  }
  if (form.emergencyContactPhone && !form.emergencyContactName.trim()) {
    errors.emergencyContactName = "contactNameRequired";
  }
  if (form.idProofType && !ID_PROOF_TYPES.includes(form.idProofType)) {
    errors.idProofType = "idProofTypeInvalid";
  }
  return errors;
}

const blank = (v) => {
  const s = String(v ?? "").trim();
  return s === "" ? null : s;
};

/** Form values as the managerSaveStaff input. Every optional field is sent (update replaces). */
export function formToStaffInput(form, { societyId, staffId = null }) {
  return {
    societyId,
    staffId,
    name: form.name.trim(),
    lastName: blank(form.lastName),
    category: form.category,
    phone: form.phone ? normalizeIndianMobile(form.phone) : null,
    email: blank(form.email)?.toLowerCase() ?? null,
    joiningDate: blank(form.joiningDate),
    employeeId: blank(form.employeeId),
    vendorName: blank(form.vendorName),
    shift: blank(form.shift),
    emergencyContactName: blank(form.emergencyContactName),
    emergencyContactPhone: form.emergencyContactPhone
      ? normalizeIndianMobile(form.emergencyContactPhone)
      : null,
    idProofType: blank(form.idProofType),
  };
}

/** manager_save_staff error code -> [field or null for the form, error key]. */
export const SAVE_ERRORS = {
  INVALID_NAME: ["name", "nameLength"],
  INVALID_CATEGORY: ["category", "categoryInvalid"],
  INVALID_PHONE: ["phone", "phoneInvalid"],
  INVALID_EMAIL: ["email", "emailInvalid"],
  INVALID_JOINING_DATE: ["joiningDate", "joiningDateTooLate"],
  INVALID_EMPLOYEE_ID: ["employeeId", "employeeIdLength"],
  EMPLOYEE_ID_TAKEN: ["employeeId", "employeeIdTaken"],
  INVALID_VENDOR: ["vendorName", "vendorLength"],
  INVALID_SHIFT: ["shift", "shiftInvalid"],
  INVALID_EMERGENCY_CONTACT: ["emergencyContactPhone", "contactInvalid"],
  INVALID_ID_PROOF_TYPE: ["idProofType", "idProofTypeInvalid"],
  STAFF_NOT_FOUND: [null, "staffNotFound"],
  NOT_SOCIETY_MANAGER: [null, "notManager"],
  SOCIETY_SERVICE_STOPPED: [null, "serviceStopped"],
};

/** Where a save error belongs: { field, key } with field null for a form-level message. */
export function saveErrorTarget(code) {
  const hit = SAVE_ERRORS[code];
  return hit ? { field: hit[0], key: hit[1] } : { field: null, key: "saveFailed" };
}
