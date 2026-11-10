import { describe, expect, it } from "vitest";
import {
  addDaysToDateValue,
  buildConnectPayload,
  EMPTY_CONNECT_FORM,
  formatIstDateTime,
  istDateValue,
  isValidRequestCode,
  MAX_EXTRA_AUTHORITIES,
  serverErrorState,
  toIstIso,
  validateConnectForm,
} from "../lib/connectForm";

// 2026-11-07 10:00 IST
const NOW = Date.parse("2026-11-07T04:30:00Z");

function form(overrides = {}) {
  return {
    ...EMPTY_CONNECT_FORM,
    societyName: "Green Meadows CHS",
    contactName: "Asha Patil",
    phone: "9876543210",
    when: "schedule",
    preferredDate: "2026-11-08",
    preferredTime: "16:30",
    ...overrides,
  };
}

describe("IST helpers", () => {
  it("builds an ISO timestamp with the IST offset", () => {
    expect(toIstIso("2026-11-08", "16:30")).toBe("2026-11-08T16:30:00+05:30");
    expect(toIstIso("", "16:30")).toBeNull();
    expect(toIstIso("2026-11-08", "bad")).toBeNull();
  });

  it("gives today's date in India, not UTC", () => {
    // 20:00 UTC on the 7th is 01:30 IST on the 8th.
    expect(istDateValue(Date.parse("2026-11-07T20:00:00Z"))).toBe("2026-11-08");
  });

  it("adds days to a date value", () => {
    expect(addDaysToDateValue("2026-11-07", 89)).toBe("2027-02-04");
  });

  it("formats a timestamp in IST with Latin digits", () => {
    const text = formatIstDateTime("2026-11-08T11:00:00Z", "en");
    expect(text).toMatch(/8/);
    expect(text).toMatch(/4:30/);
    expect(formatIstDateTime("2026-11-08T11:00:00Z", "hi")).toMatch(/4:30/);
    expect(formatIstDateTime(null, "en")).toBe("");
  });
});

describe("validateConnectForm", () => {
  it("accepts a complete scheduled request", () => {
    expect(validateConnectForm(form(), NOW)).toEqual({});
  });

  it("requires society, contact name and a valid mobile", () => {
    const errors = validateConnectForm(
      form({ societyName: " ", contactName: "A", phone: "12345" }),
      NOW,
    );
    expect(errors.societyName).toBe("form.errors.societyName");
    expect(errors.contactName).toBe("form.errors.contactName");
    expect(errors.phone).toBe("form.errors.phone");
  });

  it("checks the email only when given", () => {
    expect(validateConnectForm(form({ email: "" }), NOW).email).toBeUndefined();
    expect(validateConnectForm(form({ email: "asha@" }), NOW).email).toBe("form.errors.email");
    expect(validateConnectForm(form({ email: "asha@example.in" }), NOW).email).toBeUndefined();
  });

  it("requires a date and time unless call now", () => {
    const errors = validateConnectForm(form({ preferredDate: "", preferredTime: "" }), NOW);
    expect(errors.preferredDate).toBe("form.errors.dateRequired");
    expect(errors.preferredTime).toBe("form.errors.timeRequired");
    expect(
      validateConnectForm(form({ when: "now", preferredDate: "", preferredTime: "" }), NOW),
    ).toEqual({});
  });

  it("rejects a slot in the past or more than 90 days away", () => {
    expect(
      validateConnectForm(form({ preferredDate: "2026-11-07", preferredTime: "09:00" }), NOW)
        .preferredSlot,
    ).toBe("form.errors.slotInPast");
    expect(
      validateConnectForm(form({ preferredDate: "2027-03-01", preferredTime: "10:00" }), NOW)
        .preferredSlot,
    ).toBe("form.errors.slotTooFar");
  });

  it("checks the alternative slot only when started, and it must differ", () => {
    expect(validateConnectForm(form({ alternateDate: "2026-11-09" }), NOW).alternateTime).toBe(
      "form.errors.timeRequired",
    );
    expect(
      validateConnectForm(form({ alternateDate: "2026-11-08", alternateTime: "16:30" }), NOW)
        .alternateSlot,
    ).toBe("form.errors.alternateSame");
    expect(
      validateConnectForm(form({ alternateDate: "2026-11-06", alternateTime: "10:00" }), NOW)
        .alternateSlot,
    ).toBe("form.errors.slotInPast");
    expect(
      validateConnectForm(form({ alternateDate: "2026-11-09", alternateTime: "11:00" }), NOW),
    ).toEqual({});
  });

  it("validates each extra authority number and flags duplicates", () => {
    const errors = validateConnectForm(
      form({
        authorities: [
          { id: "a", name: "", phone: "98765" },
          { id: "b", name: "", phone: "9876543210" },
          { id: "c", name: "Ravi", phone: "9123456789" },
          { id: "d", name: "", phone: "9123456789" },
          { id: "e", name: "x".repeat(81), phone: "9988776655" },
        ],
      }),
      NOW,
    );
    expect(errors.authorities).toEqual({
      a: { phone: "form.errors.authorityPhone" },
      b: { phone: "form.errors.authorityDuplicate" },
      d: { phone: "form.errors.authorityDuplicate" },
      e: { name: "form.errors.authorityName" },
    });
  });

  it("limits the message length", () => {
    expect(validateConnectForm(form({ message: "x".repeat(1001) }), NOW).message).toBe(
      "form.errors.message",
    );
  });

  it("allows at most five extra numbers", () => {
    expect(MAX_EXTRA_AUTHORITIES).toBe(5);
  });
});

describe("buildConnectPayload", () => {
  it("maps the form to the wrapper input", () => {
    const payload = buildConnectPayload(
      form({
        societyName: "  Green Meadows  ",
        email: " Asha@Example.in ",
        authorities: [{ id: "a", name: " Ravi ", phone: "9123456789" }],
        alternateDate: "2026-11-09",
        alternateTime: "11:00",
        message: "  ",
      }),
    );
    expect(payload).toEqual({
      societyName: "Green Meadows",
      contactName: "Asha Patil",
      phone: "+919876543210",
      email: "Asha@Example.in",
      authorityNumbers: [{ phone: "+919123456789", name: "Ravi" }],
      callNow: false,
      preferredAt: "2026-11-08T16:30:00+05:30",
      alternateAt: "2026-11-09T11:00:00+05:30",
      message: undefined,
    });
  });

  it("drops the slots for call now", () => {
    const payload = buildConnectPayload(
      form({ when: "now", alternateDate: "2026-11-09", alternateTime: "11:00" }),
    );
    expect(payload.callNow).toBe(true);
    expect(payload.preferredAt).toBeUndefined();
    expect(payload.alternateAt).toBeUndefined();
  });
});

describe("serverErrorState", () => {
  it("puts field codes on their field", () => {
    expect(serverErrorState("INVALID_EMAIL")).toEqual({
      fields: { email: "form.errors.email" },
      notice: null,
    });
    expect(serverErrorState("SLOT_IN_PAST").fields).toEqual({
      preferredSlot: "form.errors.slotInPast",
    });
  });

  it("turns duplicates and rate limits into a form notice", () => {
    expect(serverErrorState("REQUEST_ALREADY_OPEN").notice).toEqual({
      tone: "info",
      key: "alreadyOpen",
    });
    expect(serverErrorState("RATE_LIMITED").notice).toEqual({
      tone: "warning",
      key: "rateLimited",
    });
    expect(serverErrorState("SOMETHING_ELSE").notice).toEqual({ tone: "danger", key: "generic" });
  });
});

describe("isValidRequestCode", () => {
  it("accepts the PR-XXXX-XXXX shape in any case", () => {
    expect(isValidRequestCode("PR-8K9M-6K43")).toBe(true);
    expect(isValidRequestCode(" pr-8k9m-6k43 ")).toBe(true);
    expect(isValidRequestCode("PR-8K9M")).toBe(false);
  });
});
