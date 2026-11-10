/**
 * Society onboarding: resident verification. Migration 069.
 * Runs against the real database with throwaway users.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  adminClient,
  anonClient,
  clearRateBuckets,
  codeOf,
  countRows,
  createFixture,
  randomPhone,
} from "./helpers/onboarding.js";

const fx = createFixture();
let staff;
let a; // society A
let b; // society B

beforeAll(async () => {
  await clearRateBuckets(["rpc:import_validate"]);
  staff = await fx.staff();
  a = await fx.society(staff);
  b = await fx.society(staff);
}, 180_000);

afterAll(async () => {
  await fx.cleanup();
}, 120_000);

describe("resident verification", () => {
  let person;
  let recordId;

  const addRecord = async (phone, type = "owner", flat = "102") => {
    const res = await a.authority.rpc("manager_add_resident_record", {
      p_society_id: a.id,
      p_flat_id: a.flats[flat],
      p_full_name: "Imported Person",
      p_phone: phone,
      p_resident_type: type,
    });
    expect(res.error).toBeNull();
    return res.data.id;
  };

  beforeAll(async () => {
    person = await fx.user();
    recordId = await addRecord(person.phone);
  }, 60_000);

  it("a resident sees only the record on their own verified number", async () => {
    const mine = await person.rpc("my_resident_records");
    expect(mine.data.map((r) => r.id)).toEqual([recordId]);
    expect(mine.data[0]).not.toHaveProperty("phone");

    const stranger = await fx.user();
    expect((await stranger.rpc("my_resident_records")).data).toEqual([]);
    for (const [fn, args] of [
      ["resident_confirm_record", { p_record_id: recordId }],
      ["resident_submit_correction", { p_record_id: recordId, p_changes: { full_name: "Hacker" } }],
      ["resident_report_incorrect", { p_record_id: recordId, p_reason: "Not me at all" }],
    ]) {
      expect(codeOf(await stranger.rpc(fn, args)), fn).toBe("RECORD_NOT_FOUND");
    }
    expect((await anonClient().rpc("my_resident_records")).error).not.toBeNull();
  });

  it("a user whose phone is not OTP-verified matches nothing", async () => {
    const phone = randomPhone();
    await addRecord(phone, "owner", "104");
    const email = `${phone}@example.test`;
    const { data } = await adminClient().auth.admin.createUser({
      email,
      password: "Password-123",
      email_confirm: true,
    });
    fx.userIds.push(data.user.id);
    await adminClient().auth.admin.updateUserById(data.user.id, {
      phone: `+91${phone}`,
      phone_confirm: false,
    });
    const anon = anonClient();
    const { data: signed } = await anon.auth.signInWithPassword({
      email,
      password: "Password-123",
    });
    const res = await anon.rpc("my_resident_records", undefined, {
      headers: { Authorization: `Bearer ${signed.session.access_token}` },
    });
    expect(res.data).toEqual([]);
  });

  it("edits are proposals: the record does not change until a manager applies them", async () => {
    const res = await person.rpc("resident_submit_correction", {
      p_record_id: recordId,
      p_changes: { full_name: "Corrected Name" },
      p_note: "Spelling",
    });
    expect(res.data.status).toBe("needs_correction");
    expect(res.data.full_name).toBe("Imported Person");
    expect(res.data.proposed_changes).toEqual({ full_name: "Corrected Name" });

    expect(
      codeOf(
        await person.rpc("resident_submit_correction", {
          p_record_id: recordId,
          p_changes: { phone10: "9999999999" },
        }),
      ),
    ).toBe("INVALID_CHANGES");
    expect(codeOf(await person.rpc("resident_confirm_record", { p_record_id: recordId }))).toBe(
      "RECORD_UNDER_REVIEW",
    );

    expect(
      codeOf(
        await b.authority.rpc("manager_review_resident_record", {
          p_record_id: recordId,
          p_action: "apply_changes",
        }),
      ),
    ).toBe("RECORD_NOT_FOUND");

    const applied = await a.authority.rpc("manager_review_resident_record", {
      p_record_id: recordId,
      p_action: "apply_changes",
    });
    expect(applied.data.status).toBe("pending");
    expect(applied.data.full_name).toBe("Corrected Name");
  });

  it("confirming creates exactly one membership on the flat, idempotently", async () => {
    const first = await person.rpc("resident_confirm_record", { p_record_id: recordId });
    expect(first.error).toBeNull();
    expect(first.data).toEqual(
      expect.objectContaining({ status: "verified", refresh_required: true }),
    );

    const again = await person.rpc("resident_confirm_record", { p_record_id: recordId });
    expect(again.data.status).toBe("verified");

    const { data: mems } = await adminClient()
      .from("society_memberships")
      .select("flat_id, role, resident_type, status")
      .eq("society_id", a.id)
      .eq("user_id", person.id);
    expect(mems).toEqual([
      { flat_id: a.flats["102"], role: "member", resident_type: "owner", status: "active" },
    ]);
    expect(await countRows("flat_owners", { flat_id: a.flats["102"], user_id: person.id })).toBe(1);

    await person.refresh();
    const dash = await person.rpc("resident_dashboard");
    expect(dash.data.flat_label).toBe("A-102");
  });

  it("report incorrect goes to the manager, who can reject it", async () => {
    const someone = await fx.user();
    const id = await addRecord(someone.phone, "tenant", "104");
    const res = await someone.rpc("resident_report_incorrect", {
      p_record_id: id,
      p_reason: "I moved out",
    });
    expect(res.data.status).toBe("needs_correction");
    expect(res.data.reported_incorrect).toBe(true);

    const list = await a.authority.rpc("manager_list_resident_records", {
      p_society_id: a.id,
      p_status: "needs_correction",
    });
    expect(list.data.items.map((r) => r.id)).toContain(id);
    expect(list.data.counts.needs_correction).toBeGreaterThan(0);
    expect(list.data.items.find((r) => r.id === id).phone).toBe(someone.phone);

    const rejected = await a.authority.rpc("manager_review_resident_record", {
      p_record_id: id,
      p_action: "reject",
      p_reason: "Resident moved out",
    });
    expect(rejected.data.status).toBe("rejected");
    expect(await countRows("society_memberships", { society_id: a.id, user_id: someone.id })).toBe(
      0,
    );
    expect((await someone.rpc("my_resident_records")).data).toEqual([]);
  });

  it("a person removed by the society cannot return by confirming a record", async () => {
    const removed = await fx.user();
    await adminClient().from("society_memberships").insert({
      society_id: a.id,
      user_id: removed.id,
      flat_id: a.flats["101"],
      role: "member",
      residency: "owner",
      household: "family",
      status: "deleted",
    });
    const id = await addRecord(removed.phone, "owner", "104");
    expect(codeOf(await removed.rpc("resident_confirm_record", { p_record_id: id }))).toBe(
      "MEMBERSHIP_REMOVED",
    );
  });

  it("a resident already on another flat is refused, not given a second membership", async () => {
    const resident = await fx.user();
    await fx.seat(a, resident, "101");
    const { data: rec, error } = await adminClient()
      .from("resident_records")
      .insert({
        society_id: a.id,
        flat_id: a.flats["104"],
        full_name: "Second Flat",
        phone10: resident.phone,
        resident_type: "owner",
      })
      .select("id")
      .single();
    expect(error).toBeNull();
    expect(codeOf(await resident.rpc("resident_confirm_record", { p_record_id: rec.id }))).toBe(
      "ALREADY_MEMBER_OTHER_FLAT",
    );
    expect(await countRows("society_memberships", { society_id: a.id, user_id: resident.id })).toBe(
      1,
    );
  });

  it("the invite helper records preparation and says nothing was sent", async () => {
    const { data } = await a.authority.rpc("manager_prepare_resident_invite", {
      p_record_id: recordId,
    });
    expect(data.sent).toBe(false);
    expect(
      codeOf(await b.authority.rpc("manager_prepare_resident_invite", { p_record_id: recordId })),
    ).toBe("RECORD_NOT_FOUND");
  });
});
