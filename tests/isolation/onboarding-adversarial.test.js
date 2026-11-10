/**
 * Society onboarding: adversarial review. Migration 090 plus a sweep of the new
 * RPCs from the outside. Runs against the real database with throwaway users.
 *
 * - onboard_resident (the older join RPC) must not hand a tenant an active flat:
 *   tenants go through the approval chain (068), so a direct call lands in the
 *   society's pending_review queue instead.
 * - A flat the society has already recorded for someone else (imported record,
 *   recorded owner, open tenancy) is not "free": a stranger claiming it waits
 *   for review.
 * - Nobody decides their own tenancy at the owner step.
 * - Outsiders and other societies' managers get only refusals from every
 *   society-scoped RPC; anon gets permission errors.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  adminClient,
  anonClient,
  codeOf,
  createFixture,
  randomPhone,
} from "./helpers/onboarding.js";

const fx = createFixture();
let staff;
let a;
let b;

async function membershipOf(society, user) {
  const { data, error } = await adminClient()
    .from("society_memberships")
    .select("status, resident_type, flat_id, role")
    .eq("society_id", society.id)
    .eq("user_id", user.id);
  if (error) throw error;
  return data;
}

function join(user, society, flat, residency) {
  return user.rpc("onboard_resident", {
    p_code: society.code,
    p_flat_id: society.flats[flat],
    p_full_name: user.name,
    p_residency: residency,
    p_alt_phone: null,
    p_family: [],
  });
}

beforeAll(async () => {
  await adminClient()
    .from("edge_rate_events")
    .delete()
    .in("bucket", ["rpc:tenant_register", "rpc:import_validate"]);
  staff = await fx.staff();
  a = await fx.society(staff, { flats: ["101", "102", "103", "104", "105", "106"] });
  b = await fx.society(staff);
}, 180_000);

afterAll(async () => {
  await fx.cleanup();
}, 120_000);

describe("onboard_resident respects the tenant chain", () => {
  it("a tenant calling onboard_resident on a vacant flat waits for review", async () => {
    const tenant = await fx.user();
    const res = await join(tenant, a, "101", "tenant");
    expect(res.error).toBeNull();
    expect(res.data.status).toBe("pending_review");
    const rows = await membershipOf(a, tenant);
    expect(rows).toHaveLength(1);
    expect(rows[0].status).toBe("pending_review");
  });

  it("an owner on a genuinely vacant flat still joins straight away", async () => {
    const owner = await fx.user();
    const res = await join(owner, a, "102", "owner");
    expect(res.error).toBeNull();
    expect(res.data.status).toBe("active");
  });

  it("an authority picking a flat as a tenant is not held back", async () => {
    const s = await fx.society(staff);
    const res = await join(s.authority, s, "101", "tenant");
    expect(res.error).toBeNull();
    expect(res.data.status).toBe("active");
  });
});

describe("a flat already recorded for someone else is not free", () => {
  it("an imported resident record on the flat sends a stranger to review", async () => {
    const real = await fx.user();
    const added = await a.authority.rpc("manager_add_resident_record", {
      p_society_id: a.id,
      p_flat_id: a.flats["103"],
      p_full_name: "Real Owner",
      p_phone: real.phone,
      p_resident_type: "owner",
    });
    expect(added.error).toBeNull();

    const squatter = await fx.user();
    const res = await join(squatter, a, "103", "owner");
    expect(res.error).toBeNull();
    expect(res.data.status).toBe("pending_review");

    // The person the record is for confirms it and is let in.
    const mine = await real.rpc("my_resident_records");
    const rec = mine.data.find((r) => r.society_id === a.id);
    const ok = await real.rpc("resident_confirm_record", { p_record_id: rec.id });
    expect(ok.error).toBeNull();
    expect(ok.data.status).toBe("verified");
  });

  it("the record's own number is not blocked by its own record", async () => {
    const real = await fx.user();
    const added = await a.authority.rpc("manager_add_resident_record", {
      p_society_id: a.id,
      p_flat_id: a.flats["104"],
      p_full_name: "Owner Self",
      p_phone: real.phone,
      p_resident_type: "owner",
    });
    expect(added.error).toBeNull();
    const res = await join(real, a, "104", "owner");
    expect(res.error).toBeNull();
    expect(res.data.status).toBe("active");
  });

  it("a recorded owner who does not use the app keeps the flat from being claimed", async () => {
    const saved = await a.authority.rpc("manager_save_flat_owner", {
      p_flat_id: a.flats["105"],
      p_full_name: "Offline Owner",
      p_phone: "9811122233",
    });
    expect(saved.error).toBeNull();
    const squatter = await fx.user();
    const res = await join(squatter, a, "105", "owner");
    expect(res.error).toBeNull();
    expect(res.data.status).toBe("pending_review");
  });

  it("the structure picker marks such a flat as taken", async () => {
    const visitor = await fx.user();
    const res = await visitor.rpc("onboard_structure_for_code", { p_code: a.code });
    expect(res.error).toBeNull();
    const flats = Object.fromEntries(res.data.wings[0].flats.map((f) => [f.number, f.taken]));
    expect(flats["103"]).toBe(true);
    expect(flats["105"]).toBe(true);
    expect(flats["106"]).toBe(false);
  });
});

describe("no self-approval in the tenant chain", () => {
  it("a person cannot approve their own tenancy at the owner step", async () => {
    const s = await fx.society(staff);
    const t = await fx.user();
    const reg = await t.rpc("tenant_register", {
      p_code: s.code,
      p_flat_id: s.flats["102"],
      p_full_name: t.name,
    });
    expect(reg.error).toBeNull();
    // Make the registrant an owner of that flat out of band (e.g. bought it later).
    await fx.seat(s, t, "102", "owner");
    const self = await t.rpc("tenant_owner_decide", { p_tenant_id: reg.data.id, p_approve: true });
    expect(codeOf(self)).toBe("CANNOT_DECIDE_OWN_REQUEST");
    const { data } = await adminClient()
      .from("flat_tenants")
      .select("status")
      .eq("id", reg.data.id)
      .single();
    expect(data.status).toBe("registered");
  });
});

describe("outsiders get refusals from every society-scoped RPC", () => {
  const REFUSALS = ["NOT_SOCIETY_MANAGER", "NOT_A_MEMBER", "NOT_ALLOWED"];
  const calls = (sid) => [
    ["setup_get_state", { p_society_id: sid }],
    ["society_admin_dashboard", { p_society_id: sid }],
    ["manager_list_society_residents", { p_society_id: sid, p_resident_type: "owner" }],
    ["manager_resident_type_counts", { p_society_id: sid }],
    ["manager_list_resident_records", { p_society_id: sid }],
    ["import_list_batches", { p_society_id: sid }],
    ["manager_list_tenants", { p_society_id: sid }],
    ["manager_list_staff", { p_society_id: sid }],
    ["get_society_registration", { p_society_id: sid }],
    ["my_society_features", { p_society_id: sid }],
    ["resident_dashboard", { p_society_id: sid }],
    ["family_invite_list", { p_society_id: sid }],
    ["setup_upsert_wing", { p_society_id: sid, p_name: "Evil" }],
    [
      "import_validate_rows",
      { p_society_id: sid, p_file_name: "x.xlsx", p_rows: [{ full_name: "X" }] },
    ],
  ];

  it("a signed-in stranger is refused everywhere", async () => {
    const stranger = await fx.user();
    for (const [fn, args] of calls(a.id)) {
      const res = await stranger.rpc(fn, args);
      expect(res.data ?? null, fn).toBeNull();
      expect(REFUSALS, `${fn}: ${res.error?.message}`).toContain(codeOf(res));
    }
  });

  it("another society's secretary is refused everywhere", async () => {
    for (const [fn, args] of calls(a.id)) {
      if (fn === "resident_dashboard" || fn === "family_invite_list") continue;
      const res = await b.authority.rpc(fn, args);
      expect(REFUSALS, `${fn}: ${res.error?.message}`).toContain(codeOf(res));
    }
  });

  it("anon cannot run the signed-in onboarding RPCs at all", async () => {
    const anon = anonClient();
    const cases = [
      ["my_authority_societies", {}],
      ["claim_authority_for_society", { p_society_id: a.id }],
      ["onboard_structure_for_code", { p_code: a.code }],
      ["household_lookup", { p_code: a.code, p_wing: "A", p_floor: "1", p_flat: "101" }],
      ["family_invite_preview", { p_token: "0".repeat(64) }],
      ["import_confirm_batch", { p_batch_id: a.id }],
      ["resident_confirm_record", { p_record_id: a.id }],
    ];
    for (const [fn, args] of cases) {
      const res = await anon.rpc(fn, args);
      expect(res.data ?? null, fn).toBeNull();
      expect(res.error?.message ?? "", fn).toMatch(/permission denied/i);
    }
  });

  it("profiles.phone stays unreadable to a signed-in client", async () => {
    const someone = await fx.user();
    const res = await someone.client.from("profiles").select("phone").limit(1);
    expect(res.error).not.toBeNull();
  });
});

describe("an unconfirmed phone proves nothing (092)", () => {
  /** A session whose auth.users.phone is set but was never OTP-verified. */
  async function unverifiedSession(phone) {
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
    const headers = { Authorization: `Bearer ${signed.session.access_token}` };
    return { id: data.user.id, rpc: (fn, args) => anon.rpc(fn, args, { headers }) };
  }

  it("the older claim_society_authority does not accept it", async () => {
    const s = await fx.society(staff);
    const phone = randomPhone();
    await adminClient()
      .from("society_authorities")
      .insert({ society_id: s.id, full_name: "Number Only", phone });
    const caller = await unverifiedSession(phone);
    const res = await caller.rpc("claim_society_authority");
    expect(codeOf(res)).toBe("NO_PHONE");
    const { data } = await adminClient()
      .from("society_memberships")
      .select("role")
      .eq("society_id", s.id)
      .eq("user_id", caller.id);
    expect(data).toEqual([]);
  });

  it("onboard_resident does not treat it as the authority's number", async () => {
    const s = await fx.society(staff);
    const phone = randomPhone();
    await adminClient()
      .from("society_authorities")
      .insert({ society_id: s.id, full_name: "Number Only", phone });
    const caller = await unverifiedSession(phone);
    await caller.rpc("onboard_resident", {
      p_code: s.code,
      p_flat_id: s.flats["103"],
      p_full_name: "Number Only",
      p_residency: "owner",
      p_alt_phone: null,
      p_family: [],
    });
    const { data: auth } = await adminClient()
      .from("society_authorities")
      .select("user_id")
      .eq("society_id", s.id)
      .eq("phone", phone)
      .single();
    expect(auth.user_id).toBeNull();
    const { data: mem } = await adminClient()
      .from("society_memberships")
      .select("role")
      .eq("society_id", s.id)
      .eq("user_id", caller.id);
    for (const m of mem) expect(m.role).toBe("member");
  });

  it("claim_family_membership does not accept it", async () => {
    const s = await fx.society(staff);
    const owner = await fx.user();
    const ownerMem = await fx.seat(s, owner, "104");
    const phone = randomPhone();
    await adminClient()
      .from("family_members")
      .insert({
        society_id: s.id,
        membership_id: ownerMem,
        full_name: "Pre Registered",
        phone: `+91${phone}`,
        relation: "spouse",
        is_resident: true,
      });
    const caller = await unverifiedSession(phone);
    const res = await caller.rpc("claim_family_membership");
    expect(codeOf(res)).toBe("NO_PHONE");
  });
});
