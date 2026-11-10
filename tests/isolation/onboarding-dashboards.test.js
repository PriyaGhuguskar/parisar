/**
 * Society onboarding: role dashboards and older flows staying coherent. Migrations 072-073.
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
} from "./helpers/onboarding.js";

const fx = createFixture();
let staff;
let a;
let b;
let owner; // active owner of A-101

const _tomorrow = () => new Date(Date.now() + 2 * 86400_000).toISOString().slice(0, 10);

beforeAll(async () => {
  await clearRateBuckets([
    "rpc:tenant_register",
    "rpc:household_lookup",
    "rpc:household_request",
    "rpc:family_token",
    "rpc:family_invite",
  ]);
  staff = await fx.staff();
  a = await fx.society(staff);
  b = await fx.society(staff);
  owner = await fx.user(undefined, { name: "Rahul Sharma" });
  await fx.seat(a, owner, "101");
}, 180_000);

afterAll(async () => {
  await fx.cleanup();
}, 120_000);

describe("older flows stay coherent", () => {
  it("a tenant authority picking a flat through onboard_resident stops counting as an owner", async () => {
    const s = await fx.society(staff);
    const joined = await s.authority.rpc("onboard_resident", {
      p_code: s.code,
      p_flat_id: s.flats["101"],
      p_full_name: s.authority.name,
      p_residency: "tenant",
      p_alt_phone: null,
      p_family: [],
    });
    expect(joined.error).toBeNull();
    const { data } = await adminClient()
      .from("society_memberships")
      .select("residency, resident_type, role")
      .eq("society_id", s.id)
      .eq("user_id", s.authority.id)
      .single();
    expect(data).toEqual({ residency: "tenant", resident_type: "tenant", role: "secretary" });
  });

  it("staff cannot move a request's status by writing to the table", async () => {
    const { data: rows } = await staff.client
      .from("society_enrollment_requests")
      .select("id")
      .limit(1);
    const write = await staff.client
      .from("society_enrollment_requests")
      .update({ status: "registered" })
      .eq("id", rows?.[0]?.id ?? "00000000-0000-0000-0000-000000000000")
      .select();
    expect(write.error).not.toBeNull();
  });

  it("removing a member erases their records in the new tables", async () => {
    const s = await fx.society(staff);
    const person = await fx.user();
    const rec = await s.authority.rpc("manager_add_resident_record", {
      p_society_id: s.id,
      p_flat_id: s.flats["102"],
      p_full_name: "Leaving Person",
      p_phone: person.phone,
      p_resident_type: "owner",
    });
    const confirmed = await person.rpc("resident_confirm_record", { p_record_id: rec.data.id });
    expect(confirmed.error).toBeNull();
    expect(await countRows("flat_owners", { society_id: s.id, user_id: person.id })).toBe(1);

    const removed = await s.authority.rpc("remove_member", {
      p_membership_id: confirmed.data.membership_id,
    });
    expect(removed.error).toBeNull();
    expect(await countRows("flat_owners", { society_id: s.id, user_id: person.id })).toBe(0);
    expect(await countRows("resident_records", { society_id: s.id, phone10: person.phone })).toBe(
      0,
    );
  });

  it("the existing review queue still works on a pending claim", async () => {
    const s = await fx.society(staff);
    const first = await fx.user();
    await fx.seat(s, first, "101");
    const second = await fx.user();
    const joined = await second.rpc("onboard_resident", {
      p_code: s.code,
      p_flat_id: s.flats["101"],
      p_full_name: second.name,
      p_residency: "owner",
      p_alt_phone: null,
      p_family: [],
    });
    expect(joined.data.status).toBe("pending_review");
    const { data: mem } = await adminClient()
      .from("society_memberships")
      .select("id")
      .eq("society_id", s.id)
      .eq("user_id", second.id)
      .single();
    const approved = await s.authority.rpc("approve_pending_membership", {
      p_membership_id: mem.id,
    });
    expect(approved.error).toBeNull();
    const dash = await s.authority.rpc("society_admin_dashboard", { p_society_id: s.id });
    expect(dash.data.residents).toBe(2);
  });
});

describe("dashboards", () => {
  it("admin dashboard counts real rows, for managers and staff of that society only", async () => {
    const { data, error } = await a.authority.rpc("society_admin_dashboard", {
      p_society_id: a.id,
    });
    expect(error).toBeNull();
    expect(data.flats).toBe(await countRows("flats", { society_id: a.id }));
    expect(data.occupied + data.vacant + data.under_construction + data.maintenance).toBe(
      data.flats,
    );
    expect(data.occupied).toBeGreaterThan(0);
    expect(data.residents).toBeGreaterThan(0);
    expect(data.pending_requests).toEqual(
      expect.objectContaining({
        memberships: expect.any(Number),
        household: expect.any(Number),
        tenants: expect.any(Number),
      }),
    );
    for (const key of ["pending_verification", "open_complaints", "todays_visitors"]) {
      expect(typeof data[key]).toBe("number");
    }
    for (const absent of ["parking", "dues", "collections", "vendors", "events"]) {
      expect(data).not.toHaveProperty(absent);
    }

    expect((await staff.rpc("society_admin_dashboard", { p_society_id: a.id })).error).toBeNull();
    for (const actor of [owner, b.authority]) {
      expect(codeOf(await actor.rpc("society_admin_dashboard", { p_society_id: a.id }))).toBe(
        "NOT_SOCIETY_MANAGER",
      );
    }
  });

  it("today's visitors moves when a visitor is logged", async () => {
    const before = (await a.authority.rpc("society_admin_dashboard", { p_society_id: a.id })).data
      .todays_visitors;
    await adminClient()
      .from("visitor_requests")
      .insert({ society_id: a.id, flat_id: a.flats["101"], visitor_name: "Courier" });
    const after = (await a.authority.rpc("society_admin_dashboard", { p_society_id: a.id })).data
      .todays_visitors;
    expect(after).toBe(before + 1);
    const res = await owner.rpc("resident_dashboard");
    expect(res.data.pending_visitors).toBeGreaterThan(0);
  });

  it("resident dashboard is the caller's own and refuses another society", async () => {
    const res = await owner.rpc("resident_dashboard", { p_society_id: a.id });
    expect(res.data.flat_label).toBe("A-101");
    expect(res.data.resident_type).toBe("owner");
    expect(res.data.society_title).toBe("resident");
    expect(codeOf(await owner.rpc("resident_dashboard", { p_society_id: b.id }))).toBe(
      "NOT_A_MEMBER",
    );
    const nobody = await fx.user();
    expect(codeOf(await nobody.rpc("resident_dashboard"))).toBe("NOT_A_MEMBER");
  });

  it("security dashboard is for active guards of that society only", async () => {
    const guard = await fx.user();
    await a.authority.rpc("secretary_add_guard", {
      p_society_id: a.id,
      p_name: "Gate Guard",
      p_phone: guard.phone,
    });
    const claimed = await guard.rpc("claim_guard", { p_society_id: a.id });
    expect(claimed.error).toBeNull();
    const { data, error } = await guard.rpc("security_dashboard");
    expect(error).toBeNull();
    expect(data.society_id).toBe(a.id);
    expect(data.todays_visitors).toBeGreaterThan(0);
    expect(typeof data.active_sos).toBe("number");
    expect(codeOf(await guard.rpc("security_dashboard", { p_society_id: b.id }))).toBe(
      "NOT_A_GUARD",
    );
    expect(codeOf(await owner.rpc("security_dashboard"))).toBe("NOT_A_GUARD");
  });

  it("my_onboarding_state summarises only the caller", async () => {
    const stranger = await fx.user();
    expect((await stranger.rpc("my_onboarding_state")).data).toEqual({
      authority_societies: [],
      resident_records: [],
      tenant_registrations: [],
      household_requests: [],
    });
    expect((await anonClient().rpc("my_onboarding_state")).error).not.toBeNull();
  });
});
