/**
 * Society-wide resident lists by type (migration 078): manager_list_society_residents
 * and manager_resident_type_counts. Runs against the real database with throwaway
 * users on random 96xxxxxxxx numbers.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { adminClient, clearRateBuckets, codeOf, createFixture } from "./helpers/onboarding.js";

const fx = createFixture();
let staff;
let a;
let b;
let owner;
let tenant;
let registrant;
let ownerMembershipId;

function list(user, societyId, residentType, extra = {}) {
  return user.rpc("manager_list_society_residents", {
    p_society_id: societyId,
    p_resident_type: residentType,
    ...extra,
  });
}

beforeAll(async () => {
  await clearRateBuckets(["rpc:tenant_register"]);
  staff = await fx.staff();
  a = await fx.society(staff);
  b = await fx.society(staff);

  owner = await fx.user(undefined, { name: "Rahul Sharma" });
  ownerMembershipId = await fx.seat(a, owner, "101", "owner");
  tenant = await fx.user(undefined, { name: "Tara Tenant" });
  await fx.seat(a, tenant, "102", "tenant");

  // A co-owner recorded by the manager who does not use the app.
  const co = await a.authority.rpc("manager_save_flat_owner", {
    p_flat_id: a.flats["103"],
    p_full_name: "Nalini Iyer",
    p_phone: null,
    p_is_primary: true,
    p_start_date: null,
    p_membership_number: "M-77",
    p_owner_id: null,
  });
  if (co.error) throw new Error(`co-owner: ${co.error.message}`);

  // A tenant registration still waiting on the owner.
  registrant = await fx.user(undefined, { name: "Raj Registrant" });
  const reg = await registrant.rpc("tenant_register", {
    p_code: a.code,
    p_flat_id: a.flats["101"],
    p_full_name: "Raj Registrant",
  });
  if (reg.error || reg.data?.error) throw new Error(`tenant_register: ${codeOf(reg)}`);

  // A family member the owner listed who is not on the app.
  const fam = await adminClient().from("family_members").insert({
    society_id: a.id,
    membership_id: ownerMembershipId,
    full_name: "Meera Sharma",
    phone: null,
    relation: "spouse",
  });
  if (fam.error) throw new Error(`family: ${fam.error.message}`);
}, 180_000);

afterAll(async () => {
  await fx.cleanup();
}, 120_000);

describe("manager_list_society_residents", () => {
  it("lists app owners and recorded co-owners together", async () => {
    const res = await list(a.authority, a.id, "owner");
    expect(res.error).toBeNull();
    const names = res.data.items.map((r) => r.full_name);
    expect(names).toEqual(expect.arrayContaining(["Rahul Sharma", "Nalini Iyer"]));
    const co = res.data.items.find((r) => r.full_name === "Nalini Iyer");
    expect(co).toMatchObject({
      source: "owner_record",
      on_app: false,
      status: "not_on_app",
      is_primary: true,
      membership_number: "M-77",
      flat_label: "A-103",
    });
  });

  it("never returns a phone number", async () => {
    for (const type of ["owner", "tenant", "family_member"]) {
      const res = await list(a.authority, a.id, type);
      for (const row of res.data.items) {
        expect(Object.keys(row)).not.toContain("phone");
        expect(JSON.stringify(row)).not.toContain(owner.phone);
      }
    }
  });

  it("lists active tenants and pending registrations, filterable by status", async () => {
    const all = await list(a.authority, a.id, "tenant");
    const names = all.data.items.map((r) => r.full_name);
    expect(names).toEqual(expect.arrayContaining(["Tara Tenant", "Raj Registrant"]));
    const pending = await list(a.authority, a.id, "tenant", { p_status: "registered" });
    expect(pending.data.items.map((r) => r.full_name)).toEqual(["Raj Registrant"]);
    expect(pending.data.total).toBe(1);
  });

  it("lists family members with relationship and who added them", async () => {
    const res = await list(a.authority, a.id, "family_member");
    const meera = res.data.items.find((r) => r.full_name === "Meera Sharma");
    expect(meera).toMatchObject({
      relationship: "spouse",
      added_by_name: "Rahul Sharma",
      on_app: false,
      flat_label: "A-101",
    });
  });

  it("searches by name and flat", async () => {
    const byName = await list(a.authority, a.id, "owner", { p_search: "nalini" });
    expect(byName.data.items.map((r) => r.full_name)).toEqual(["Nalini Iyer"]);
    const byFlat = await list(a.authority, a.id, "owner", { p_search: "A-101" });
    expect(byFlat.data.items.map((r) => r.full_name)).toEqual(["Rahul Sharma"]);
  });

  it("pages with limit and offset", async () => {
    const first = await list(a.authority, a.id, "owner", { p_limit: 1, p_offset: 0 });
    const second = await list(a.authority, a.id, "owner", { p_limit: 1, p_offset: 1 });
    expect(first.data.items).toHaveLength(1);
    expect(second.data.items).toHaveLength(1);
    expect(first.data.items[0].id).not.toBe(second.data.items[0].id);
    expect(first.data.total).toBe(second.data.total);
  });

  it("refuses a plain resident, another society's manager and platform staff", async () => {
    expect(codeOf(await list(owner, a.id, "owner"))).toBe("NOT_SOCIETY_MANAGER");
    expect(codeOf(await list(b.authority, a.id, "owner"))).toBe("NOT_SOCIETY_MANAGER");
    expect(codeOf(await list(staff, a.id, "owner"))).toBe("NOT_SOCIETY_MANAGER");
  });

  it("rejects an unknown type or status", async () => {
    expect(codeOf(await list(a.authority, a.id, "guard"))).toBe("INVALID_RESIDENT_TYPE");
    expect(codeOf(await list(a.authority, a.id, "owner", { p_status: "nope" }))).toBe(
      "INVALID_STATUS",
    );
  });
});

describe("manager_resident_type_counts", () => {
  it("counts each type on the same rules as the list", async () => {
    const res = await a.authority.rpc("manager_resident_type_counts", { p_society_id: a.id });
    expect(res.error).toBeNull();
    const owners = await list(a.authority, a.id, "owner");
    const tenants = await list(a.authority, a.id, "tenant");
    const family = await list(a.authority, a.id, "family_member");
    expect(res.data).toEqual({
      owner: owners.data.total,
      tenant: tenants.data.total,
      family_member: family.data.total,
    });
  });

  it("refuses another society's manager", async () => {
    const res = await b.authority.rpc("manager_resident_type_counts", { p_society_id: a.id });
    expect(codeOf(res)).toBe("NOT_SOCIETY_MANAGER");
  });
});
