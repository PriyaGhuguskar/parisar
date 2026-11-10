import { describe, expect, it } from "vitest";
import {
  EMPTY_REGISTER_FORM,
  firstInvalidId,
  formFromRequest,
  hasErrors,
  toRegisterInput,
  validateRegisterForm,
} from "../lib/registerForm";
import {
  addDays,
  authorityCount,
  currentSlot,
  displayPhone,
  formatSlotDate,
  formatSlotTime,
  historyActionKey,
  isOpenStatus,
  listQueryToArgs,
  telHref,
  todayInIst,
  validateRejectReason,
  validateReschedule,
} from "../lib/requestFormat";

const NOW = new Date("2026-11-07T06:00:00Z"); // 11:30 IST

describe("requestFormat", () => {
  it("formats slots in IST with Latin digits in every language", () => {
    const at = "2026-11-07T11:00:00Z"; // 16:30 IST
    expect(formatSlotDate(at, "en")).toMatch(/7/);
    expect(formatSlotTime(at, "en")).toMatch(/4:30/);
    expect(formatSlotTime(at, "hi")).toMatch(/4:30/);
    expect(formatSlotTime(at, "mr")).toMatch(/4:30/);
    expect(formatSlotDate(null)).toBeNull();
    expect(formatSlotDate("not a date")).toBeNull();
  });

  it("prefers a staff reschedule over the requested slot", () => {
    expect(currentSlot({ preferred_at: "a", scheduled_at: "b" })).toBe("b");
    expect(currentSlot({ preferred_at: "a", scheduled_at: null })).toBe("a");
    expect(currentSlot({ call_now: true, preferred_at: "a" })).toBeNull();
  });

  it("formats and dials phones from either stored shape", () => {
    expect(displayPhone("+919876543210")).toBe("+91 98765 43210");
    expect(displayPhone("9876543210")).toBe("+91 98765 43210");
    expect(telHref("+919876543210")).toBe("tel:+919876543210");
    expect(telHref("12")).toBeNull();
    expect(telHref(null)).toBeNull();
  });

  it("counts authority numbers, treating legacy rows as one", () => {
    expect(authorityCount({ phone: "+919876543210", authority_numbers: [] })).toBe(1);
    expect(
      authorityCount({
        phone: "+919876543210",
        authority_numbers: [{ phone: "1" }, { phone: "2" }],
      }),
    ).toBe(2);
  });

  it("knows which statuses are still open", () => {
    expect(isOpenStatus("rescheduled")).toBe(true);
    expect(isOpenStatus("contacted")).toBe(true);
    expect(isOpenStatus("registered")).toBe(false);
    expect(isOpenStatus("rejected")).toBe(false);
  });

  it("computes today and date offsets in IST", () => {
    expect(todayInIst(new Date("2026-11-06T20:00:00Z"))).toBe("2026-11-07");
    expect(addDays("2026-11-07", 90)).toBe("2027-02-05");
  });

  it("builds an IST timestamp for a valid reschedule", () => {
    const result = validateReschedule({ date: "2026-11-08", time: "10:15", note: "  ok " }, NOW);
    expect(result).toEqual({ ok: true, scheduledAt: "2026-11-08T10:15:00+05:30", note: "ok" });
  });

  it("refuses missing, past and far reschedules", () => {
    expect(validateReschedule({ date: "", time: "" }, NOW).errors).toEqual({
      date: "SLOT_DATE_REQUIRED",
      time: "SLOT_TIME_REQUIRED",
    });
    expect(validateReschedule({ date: "2026-11-07", time: "09:00" }, NOW).errors.time).toBe(
      "SLOT_IN_PAST",
    );
    expect(validateReschedule({ date: "2027-03-01", time: "09:00" }, NOW).errors.date).toBe(
      "SLOT_TOO_FAR",
    );
    expect(
      validateReschedule({ date: "2026-11-08", time: "09:00", note: "x".repeat(501) }, NOW).errors
        .note,
    ).toBe("INVALID_NOTE");
  });

  it("checks reject reasons like the RPC", () => {
    expect(validateRejectReason("  no ").ok).toBe(false);
    expect(validateRejectReason("x".repeat(501)).ok).toBe(false);
    expect(validateRejectReason("  Duplicate request ")).toEqual({
      ok: true,
      reason: "Duplicate request",
    });
  });

  it("maps the table query onto wrapper arguments", () => {
    expect(
      listQueryToArgs({ search: "  pr-1 ", filterValues: {}, page: 3, pageSize: 20 }, NOW),
    ).toEqual({ search: "pr-1", status: null, from: null, limit: 20, offset: 40 });
    const args = listQueryToArgs({ filterValues: { status: "open", submitted: "7" } }, NOW);
    expect(args.status).toBe("open");
    expect(args.from).toBe("2026-10-31T06:00:00.000Z");
  });

  it("strips the history action prefix", () => {
    expect(historyActionKey("connect.rescheduled")).toBe("rescheduled");
    expect(historyActionKey(null)).toBe("unknown");
  });
});

const REQUEST = {
  id: "req-1",
  society_name: "Green Meadows",
  contact_name: "Asha Patil",
  phone: "+919876543210",
  authority_numbers: [
    { name: "Asha Patil", phone: "9876543210" },
    { name: null, phone: "9812345678" },
  ],
};

function validForm(overrides = {}) {
  return {
    ...EMPTY_REGISTER_FORM,
    name: "Green Meadows CHS",
    addressLine: "12 MG Road",
    city: "Pune",
    state: "Maharashtra",
    pincode: "411005",
    authorities: [{ name: "Asha Patil", phone: "9876543210", fromRequest: true }],
    ...overrides,
  };
}

describe("registerForm", () => {
  it("prefills the society and locks every number on the request", () => {
    const form = formFromRequest(REQUEST);
    expect(form.name).toBe("Green Meadows");
    expect(form.authorities).toEqual([
      { name: "Asha Patil", phone: "9876543210", fromRequest: true },
      { name: "", phone: "9812345678", fromRequest: true },
    ]);
  });

  it("falls back to the contact for requests from the older form", () => {
    const form = formFromRequest({ ...REQUEST, authority_numbers: [] });
    expect(form.authorities).toEqual([
      { name: "Asha Patil", phone: "9876543210", fromRequest: true },
    ]);
  });

  it("starts empty with one editable authority when there is no request", () => {
    const form = formFromRequest(null);
    expect(form.authorities).toEqual([{ name: "", phone: "", fromRequest: false }]);
    expect(form.country).toBe("India");
  });

  it("accepts a complete form", () => {
    expect(hasErrors(validateRegisterForm(validForm(), "2026-11-07"))).toBe(false);
  });

  it("reports every field rule with the RPC's codes", () => {
    const result = validateRegisterForm(
      validForm({
        name: "ab",
        addressLine: "abc",
        city: "",
        state: "",
        pincode: "011005",
        officialEmail: "nope",
        officialPhone: "abc",
        registrationDate: "2026-12-01",
        country: "",
        authorities: [
          { name: "A", phone: "123" },
          { name: "Bea", phone: "9876543210" },
          { name: "Cy", phone: "9876543210" },
        ],
      }),
      "2026-11-07",
    );
    expect(result.fields).toEqual({
      name: "INVALID_NAME",
      addressLine: "INVALID_ADDRESS",
      city: "INVALID_CITY",
      state: "INVALID_STATE",
      pincode: "INVALID_PINCODE",
      officialEmail: "INVALID_OFFICIAL_EMAIL",
      officialPhone: "INVALID_OFFICIAL_PHONE",
      registrationDate: "INVALID_REGISTRATION_DATE",
      country: "INVALID_COUNTRY",
    });
    expect(result.authorities).toEqual([
      { name: "INVALID_AUTHORITY_NAME", phone: "INVALID_AUTHORITY_PHONE" },
      {},
      { phone: "DUPLICATE_AUTHORITY_PHONE" },
    ]);
    expect(firstInvalidId(result)).toBe("reg-name");
  });

  it("focuses the first bad authority when the fields are fine", () => {
    const result = validateRegisterForm(
      validForm({ authorities: [{ name: "Asha", phone: "12" }] }),
      "2026-11-07",
    );
    expect(firstInvalidId(result)).toBe("reg-authority-0-phone");
  });

  it("builds the wrapper input with optional fields as null", () => {
    const input = toRegisterInput(validForm({ landmark: "  ", registrationNumber: " MH/1 " }), {
      requestId: "req-1",
      features: new Set(["visitors"]),
    });
    expect(input).toMatchObject({
      name: "Green Meadows CHS",
      landmark: null,
      registrationNumber: "MH/1",
      societyType: null,
      registrationDate: null,
      requestId: "req-1",
      country: "India",
      features: ["visitors"],
      authorities: [{ name: "Asha Patil", phone: "9876543210" }],
    });
  });
});
