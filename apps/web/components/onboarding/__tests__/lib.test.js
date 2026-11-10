import { describe, expect, it } from "vitest";
import { inviteUrl } from "@/components/household/FamilyInvites";
import { changedFields } from "@/components/verification/CorrectionForm";
import { residentInviteMessage } from "@/components/verification/InvitePanel";
import { flatOptionsFromSetup } from "@/components/verification/useSocietyFlats";
import { errorMessage, isKnownError } from "../lib/errors";
import { hasStatusLabel, statusTone } from "../lib/statusMeta";
import {
  flatLabel,
  flatOptions,
  floorLabel,
  floorOptions,
  lookupKeys,
  NO_FLOOR,
  wingOptions,
} from "../lib/structure";
import {
  checkDateRange,
  checkEmail,
  checkMobile,
  checkName,
  checkReason,
  firstError,
  todayIst,
} from "../lib/validation";
import { isWeakPin } from "../PinSetup";
import { tenantChainSteps } from "../TenantChain";
import { normaliseCode } from "../wizard/CodeStep";
import { validateDetails } from "../wizard/DetailsStep";
import { validateFamily } from "../wizard/FamilyStep";
import { validateTenant } from "../wizard/TenantStep";
import { STRUCTURE } from "./fixtures";

// A t() that shows the key and params, so assertions do not depend on copy.
const t = (key, params) => (params ? `${key}:${JSON.stringify(params)}` : key);

describe("structure helpers", () => {
  it("labels flats like the server, without the default wing name", () => {
    expect(flatLabel(STRUCTURE.wings[0], { number: "101" })).toBe("A-101");
    expect(flatLabel(STRUCTURE.wings[1], { number: "1" })).toBe("1");
    expect(flatLabel(STRUCTURE.wings[0], null)).toBe("");
  });

  it("names floors", () => {
    expect(floorLabel({ number: 0 }, t)).toBe("structure.ground");
    expect(floorLabel({ number: -1 }, t)).toBe('structure.basement:{"n":1}');
    expect(floorLabel({ number: 3, name: "Podium" }, t)).toBe("Podium");
    expect(floorLabel(null, t)).toBe("structure.noFloor");
  });

  it("disables a wing with no flats", () => {
    const opts = wingOptions(STRUCTURE, t);
    expect(opts.map((o) => [o.value, Boolean(o.disabled)])).toEqual([
      ["wA", false],
      ["wM", false],
      ["wE", true],
    ]);
  });

  it("offers floors with flat counts and a no-floor bucket for older flats", () => {
    const opts = floorOptions(STRUCTURE.wings[0], t);
    expect(opts.map((o) => o.value)).toEqual(["f1", "f0", NO_FLOOR]);
    expect(opts.find((o) => o.value === "f0").disabled).toBe(true);
    expect(floorOptions(STRUCTURE.wings[1], t)).toEqual([]);
  });

  it("lists flats on the chosen floor and marks taken ones", () => {
    const wing = STRUCTURE.wings[0];
    expect(flatOptions(wing, "", t)).toEqual([]);
    const onF1 = flatOptions(wing, "f1", t);
    expect(onF1.map((o) => o.label)).toEqual(["A-101", "A-102"]);
    expect(onF1[1].description).toBe("structure.taken");
    expect(flatOptions(wing, NO_FLOOR, t).map((o) => o.value)).toEqual(["a001"]);
    expect(flatOptions(STRUCTURE.wings[1], "", t).map((o) => o.value)).toEqual(["m1"]);
  });

  it("builds household lookup keys with the floor number only when the flat has one", () => {
    const wing = STRUCTURE.wings[0];
    expect(lookupKeys(wing, wing.flats[0])).toEqual({ wing: "A", floor: "1", flat: "101" });
    expect(lookupKeys(wing, wing.flats[2])).toEqual({ wing: "A", floor: null, flat: "001" });
  });
});

describe("validation", () => {
  it("checks names, emails, mobiles and reasons", () => {
    expect(checkName("")).toBe("validation.nameRequired");
    expect(checkName("A")).toBe("validation.nameLength");
    expect(checkName("Asha")).toBeNull();
    expect(checkEmail("")).toBeNull();
    expect(checkEmail("", { required: true })).toBe("validation.emailRequired");
    expect(checkEmail("x@y")).toBe("validation.emailInvalid");
    expect(checkMobile("")).toBeNull();
    expect(checkMobile("", { required: true })).toBe("validation.mobileRequired");
    expect(checkMobile("5876543210")).toBe("validation.mobileInvalid");
    expect(checkMobile("9876543210")).toBeNull();
    expect(checkReason("no")).toBe("validation.reasonLength");
    expect(checkReason("  ")).toBe("validation.reasonRequired");
  });

  it("compares dates and finds the first error in order", () => {
    expect(checkDateRange("2026-11-10", "2026-11-01")).toBe("validation.endBeforeStart");
    expect(checkDateRange("2026-11-10", "2026-11-10")).toBeNull();
    expect(firstError({ a: null, b: "x", c: "y" }, ["c", "b", "a"])).toBe("c");
    expect(todayIst(new Date("2026-11-06T20:00:00Z"))).toBe("2026-11-07");
  });

  it("validates the details step, including the family-on-a-free-flat rule", () => {
    const base = {
      name: "Asha",
      wingId: "wA",
      floorId: "f1",
      flatId: "a101",
      residentType: "owner",
      alt: "",
    };
    expect(Object.values(validateDetails(base, STRUCTURE, {})).filter(Boolean)).toEqual([]);
    const missing = validateDetails(
      { ...base, wingId: "", floorId: "", flatId: "" },
      STRUCTURE,
      {},
    );
    expect(missing.wing).toBe("validation.wingRequired");
    expect(missing.flat).toBe("validation.flatRequired");
    expect(validateDetails({ ...base, floorId: "" }, STRUCTURE, {}).floor).toBe(
      "validation.floorRequired",
    );
    expect(
      validateDetails({ ...base, residentType: "family_member" }, STRUCTURE, {}).residentType,
    ).toBe("validation.familyNeedsHousehold");
    expect(
      validateDetails({ ...base, flatId: "a102", residentType: "family_member" }, STRUCTURE, {})
        .residentType,
    ).toBeFalsy();
  });

  it("requires tenancy dates and checks the owner's mobile", () => {
    const f = {
      agreementStart: "",
      agreementEnd: "",
      ownerName: "",
      ownerPhone: "123",
      policeStatus: "not_submitted",
      policeReference: "",
    };
    const errors = validateTenant(f);
    expect(errors.start).toBe("validation.startRequired");
    expect(errors.end).toBe("validation.endRequired");
    expect(errors.ownerPhone).toBe("validation.mobileInvalid");
    expect(
      validateTenant({ ...f, agreementStart: "2026-12-01", agreementEnd: "2026-11-01" }).end,
    ).toBe("validation.endBeforeStart");
  });

  it("ignores fully empty family rows", () => {
    expect(validateFamily([{ name: "", relation: "", phone: "" }])).toEqual([
      { name: null, phone: null },
    ]);
    expect(validateFamily([{ name: "A", relation: "son", phone: "" }])[0].name).toBe(
      "validation.nameLength",
    );
  });

  it("normalises society codes and rejects weak PINs", () => {
    expect(normaliseCode("abcd1234")).toBe("ABCD-1234");
    expect(normaliseCode(" ab-cd 12 34 99")).toBe("ABCD-1234");
    expect(normaliseCode("abc")).toBe("ABC");
    expect(isWeakPin("1234")).toBe(true);
    expect(isWeakPin("7777")).toBe(true);
    expect(isWeakPin("4821")).toBe(false);
  });
});

describe("errors and statuses", () => {
  it("maps known codes and falls back to the generic message", () => {
    expect(isKnownError("INVALID_CODE")).toBe(true);
    expect(errorMessage(t, { error: "INVALID_CODE" })).toBe("errors.INVALID_CODE");
    expect(errorMessage(t, "HOUSEHOLD_REQUEST_EXISTS")).toBe("errors.HOUSEHOLD_REQUEST_EXISTS");
    expect(errorMessage(t, { error: "permission denied for table x" })).toBe("errors.generic");
    expect(errorMessage(t, undefined)).toBe("errors.generic");
  });

  it("gives every status a tone", () => {
    expect(statusTone("record", "verified")).toBe("success");
    expect(statusTone("tenant", "registered")).toBe("warning");
    expect(statusTone("tenant", "nope")).toBe("neutral");
    expect(hasStatusLabel("invite", "expired")).toBe(true);
    expect(hasStatusLabel("invite", "sent")).toBe(false);
  });
});

describe("tenant chain", () => {
  const base = {
    status: "registered",
    created_at: "2026-11-01T10:00:00Z",
    owner_step_skipped: false,
    owner_approved_at: null,
    admin_approved_at: null,
    activated_at: null,
    rejected_stage: null,
    agreement_start: "2026-12-01",
  };

  it("waits on the owner first", () => {
    const steps = tenantChainSteps(base, t, "en");
    expect(steps.map((s) => s.status)).toEqual(["complete", "current", "upcoming", "upcoming"]);
  });

  it("shows a skipped owner step and the society as current", () => {
    const steps = tenantChainSteps(
      { ...base, status: "owner_approved", owner_step_skipped: true },
      t,
      "en",
    );
    expect(steps[1].description).toBe("chain.ownerSkipped");
    expect(steps[2].status).toBe("current");
  });

  it("marks the stage that rejected", () => {
    const steps = tenantChainSteps(
      { ...base, status: "rejected", rejected_stage: "admin" },
      t,
      "en",
    );
    expect(steps[2].status).toBe("error");
    expect(steps[2].description).toBe("chain.societyRejected");
  });

  it("is complete once active", () => {
    const steps = tenantChainSteps(
      {
        ...base,
        status: "active",
        owner_approved_at: "2026-11-02T00:00:00Z",
        admin_approved_at: "2026-11-03T00:00:00Z",
        activated_at: "2026-11-03T00:00:00Z",
      },
      t,
      "en",
    );
    expect(steps.every((s) => s.status === "complete")).toBe(true);
  });
});

describe("verification and invite helpers", () => {
  it("sends only the fields that changed", () => {
    const record = { full_name: "Asha", email: "", resident_type: "owner", flat_label: "A-101" };
    expect(
      changedFields(record, {
        full_name: "Asha",
        email: "",
        resident_type: "owner",
        flat_label: "A-101",
      }),
    ).toEqual({});
    expect(
      changedFields(record, {
        full_name: " Asha P ",
        email: "a@b.in",
        resident_type: "tenant",
        flat_label: "A-101",
      }),
    ).toEqual({ full_name: "Asha P", email: "a@b.in", resident_type: "tenant" });
  });

  it("turns setup state into sorted flat options", () => {
    const opts = flatOptionsFromSetup({
      wings: [
        {
          name: "B",
          code: "B",
          floors: [
            {
              flats: [
                { id: "b10", number: "10" },
                { id: "b2", number: "2" },
              ],
            },
          ],
          unassigned_flats: [{ id: "b1", number: "1" }],
        },
      ],
    });
    expect(opts.map((o) => o.label)).toEqual(["B-1", "B-2", "B-10"]);
  });

  it("builds the invite link and message", () => {
    expect(inviteUrl("https://parisar.in", "ab12")).toBe("https://parisar.in/invite/ab12");
    expect(
      residentInviteMessage(t, { full_name: "Asha", flat_label: "A-101" }, "https://p.in"),
    ).toBe('invite.residentMessage:{"name":"Asha","flat":"A-101","url":"https://p.in/login"}');
  });
});
