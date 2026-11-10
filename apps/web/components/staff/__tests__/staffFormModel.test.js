// Staff form model: validation, the RPC input mapping and error placement.
// JavaScript only — no TypeScript per CLAUDE.md.

import enNav from "@parisar/i18n/locales/en/staff-nav.json";
import { describe, expect, it } from "vitest";
import {
  addDays,
  emptyStaffForm,
  formToStaffInput,
  SAVE_ERRORS,
  STAFF_CATEGORIES,
  saveErrorTarget,
  staffToForm,
  validateStaffForm,
} from "../staffFormModel";

const TODAY = "2026-11-07";
const valid = (over = {}) => ({
  ...emptyStaffForm(),
  name: "Ramesh",
  category: "security",
  ...over,
});

describe("validateStaffForm", () => {
  it("accepts the two required fields alone", () => {
    expect(validateStaffForm(valid(), { today: TODAY })).toEqual({});
  });

  it("requires a name and a staff type", () => {
    const errors = validateStaffForm(emptyStaffForm(), { today: TODAY });
    expect(errors).toEqual({ name: "nameRequired", category: "categoryRequired" });
  });

  it("checks name length and the type list", () => {
    const errors = validateStaffForm(valid({ name: "R", category: "pilot" }), { today: TODAY });
    expect(errors.name).toBe("nameLength");
    expect(errors.category).toBe("categoryInvalid");
  });

  it("checks phone and email shape when given", () => {
    const errors = validateStaffForm(valid({ phone: "12345", email: "nope" }), { today: TODAY });
    expect(errors.phone).toBe("phoneInvalid");
    expect(errors.email).toBe("emailInvalid");
    expect(
      validateStaffForm(valid({ phone: "9876543210", email: "a@b.in" }), { today: TODAY }),
    ).toEqual({});
  });

  it("refuses a joining date more than a year ahead", () => {
    const late = addDays(TODAY, 366);
    expect(validateStaffForm(valid({ joiningDate: late }), { today: TODAY }).joiningDate).toBe(
      "joiningDateTooLate",
    );
    expect(
      validateStaffForm(valid({ joiningDate: addDays(TODAY, 365) }), { today: TODAY }),
    ).toEqual({});
  });

  it("needs a contact name when an emergency number is given", () => {
    const errors = validateStaffForm(valid({ emergencyContactPhone: "9876543210" }), {
      today: TODAY,
    });
    expect(errors.emergencyContactName).toBe("contactNameRequired");
  });

  it("checks shift and ID proof type against their lists", () => {
    const errors = validateStaffForm(valid({ shift: "dawn", idProofType: "ration" }), {
      today: TODAY,
    });
    expect(errors.shift).toBe("shiftInvalid");
    expect(errors.idProofType).toBe("idProofTypeInvalid");
  });

  it("has a message for every error key it can return", () => {
    for (const key of [
      "nameRequired",
      "nameLength",
      "lastNameLength",
      "categoryRequired",
      "categoryInvalid",
      "phoneInvalid",
      "emailInvalid",
      "joiningDateTooLate",
      "employeeIdLength",
      "vendorLength",
      "shiftInvalid",
      "contactNameLength",
      "contactNameRequired",
      "idProofTypeInvalid",
    ]) {
      expect(enNav.staffForm.error[key], key).toBeTruthy();
    }
    for (const [, key] of Object.values(SAVE_ERRORS))
      expect(enNav.staffForm.error[key], key).toBeTruthy();
  });
});

describe("formToStaffInput / staffToForm", () => {
  it("sends every optional field, blank ones as null", () => {
    const input = formToStaffInput(valid({ email: " A@B.IN ", phone: "98765 43210" }), {
      societyId: "s1",
    });
    expect(input).toMatchObject({
      societyId: "s1",
      staffId: null,
      name: "Ramesh",
      category: "security",
      email: "a@b.in",
      phone: "9876543210",
      lastName: null,
      shift: null,
      idProofType: null,
    });
  });

  it("round-trips a Staff object", () => {
    const staff = {
      id: "x",
      name: "Ramesh",
      last_name: "Patil",
      category: "plumber",
      phone: "9876543210",
      shift: "night",
      id_proof_type: "aadhaar",
    };
    const form = staffToForm(staff);
    expect(form).toMatchObject({
      name: "Ramesh",
      lastName: "Patil",
      shift: "night",
      idProofType: "aadhaar",
    });
    expect(formToStaffInput(form, { societyId: "s", staffId: "x" }).staffId).toBe("x");
  });
});

describe("saveErrorTarget", () => {
  it("puts field errors on their field", () => {
    expect(saveErrorTarget("EMPLOYEE_ID_TAKEN")).toEqual({
      field: "employeeId",
      key: "employeeIdTaken",
    });
  });

  it("puts permission and unknown errors on the form", () => {
    expect(saveErrorTarget("NOT_SOCIETY_MANAGER")).toEqual({ field: null, key: "notManager" });
    expect(saveErrorTarget("SOMETHING_NEW")).toEqual({ field: null, key: "saveFailed" });
  });
});

describe("staff types", () => {
  it("covers the brief's staff roles, each with a label", () => {
    for (const role of [
      "security",
      "plumber",
      "electrician",
      "cleaner",
      "gardener",
      "maintenance_staff",
      "other",
    ]) {
      expect(STAFF_CATEGORIES).toContain(role);
    }
    for (const role of STAFF_CATEGORIES) expect(enNav.staffRole[role], role).toBeTruthy();
  });
});
