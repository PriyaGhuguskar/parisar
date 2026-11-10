/**
 * Society onboarding: owner details and the tenant approval chain. Migrations 067-068.
 * Runs against the real database with throwaway users.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  adminClient,
  clearRateBuckets,
  codeOf,
  countRows,
  createFixture,
  randomPhone,
} from "./helpers/onboarding.js";

const fx = createFixture();
let staff;
let a;
let b;
let owner; // active owner of A-101

const tomorrow = () => new Date(Date.now() + 2 * 86400_000).toISOString().slice(0, 10);

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

describe("owner details", () => {
  it("an owner saves their own details; several owners per flat, one primary", async () => {
    const res = await owner.rpc("owner_save_my_details", {
      p_flat_id: a.flats["101"],
      p_full_name: "Rahul Sharma",
      p_is_primary: true,
      p_start_date: "2015-06-01",
      p_membership_number: "M-001",
    });
    expect(res.error).toBeNull();
    expect(res.data.is_primary).toBe(true);
    expect(res.data.verified).toBe(false);

    const co = await a.authority.rpc("manager_save_flat_owner", {
      p_flat_id: a.flats["101"],
      p_full_name: "Neha Sharma",
      p_phone: randomPhone(),
    });
    expect(co.error).toBeNull();
    expect(co.data.is_primary).toBe(false);

    expect(
      codeOf(
        await a.authority.rpc("manager_save_flat_owner", {
          p_flat_id: a.flats["101"],
          p_full_name: "Third Person",
          p_is_primary: true,
        }),
      ),
    ).toBe("PRIMARY_OWNER_EXISTS");
    expect(
      codeOf(
        await a.authority.rpc("manager_save_flat_owner", {
          p_flat_id: a.flats["102"],
          p_full_name: "Duplicate Number",
          p_membership_number: "m-001",
        }),
      ),
    ).toBe("MEMBERSHIP_NUMBER_TAKEN");
  });

  it("a non-owner cannot save, and a resident of another flat cannot list", async () => {
    const tenant = await fx.user();
    await fx.seat(a, tenant, "103", "tenant");
    expect(
      codeOf(
        await tenant.rpc("owner_save_my_details", {
          p_flat_id: a.flats["103"],
          p_full_name: "Not Owner",
        }),
      ),
    ).toBe("NOT_FLAT_OWNER");
    expect(
      codeOf(
        await tenant.rpc("owner_save_my_details", {
          p_flat_id: a.flats["101"],
          p_full_name: "Not Owner",
        }),
      ),
    ).toBe("NOT_FLAT_OWNER");
    expect(codeOf(await tenant.rpc("list_flat_owners", { p_flat_id: a.flats["101"] }))).toBe(
      "NOT_ALLOWED",
    );
    expect(codeOf(await b.authority.rpc("list_flat_owners", { p_flat_id: a.flats["101"] }))).toBe(
      "NOT_ALLOWED",
    );
    expect(
      codeOf(
        await b.authority.rpc("manager_save_flat_owner", {
          p_flat_id: a.flats["101"],
          p_full_name: "Cross Tenant",
        }),
      ),
    ).toBe("NOT_SOCIETY_MANAGER");
  });

  it("only a manager sees owner phones", async () => {
    const asOwner = await owner.rpc("list_flat_owners", { p_flat_id: a.flats["101"] });
    expect(asOwner.data.length).toBe(2);
    expect(asOwner.data.every((o) => o.phone === null)).toBe(true);
    const asManager = await a.authority.rpc("list_flat_owners", { p_flat_id: a.flats["101"] });
    expect(asManager.data.some((o) => o.phone !== null)).toBe(true);
  });

  it("only a manager of that society verifies an owner", async () => {
    const { data: list } = await a.authority.rpc("list_flat_owners", { p_flat_id: a.flats["101"] });
    const id = list[0].id;
    expect(codeOf(await owner.rpc("manager_verify_flat_owner", { p_owner_id: id }))).toBe(
      "OWNER_NOT_FOUND",
    );
    expect(codeOf(await b.authority.rpc("manager_verify_flat_owner", { p_owner_id: id }))).toBe(
      "OWNER_NOT_FOUND",
    );
    expect(
      (await a.authority.rpc("manager_verify_flat_owner", { p_owner_id: id })).data.verified,
    ).toBe(true);
  });
});

describe("tenant approval chain", () => {
  const register = (user, flat = "101", over = {}) =>
    user.rpc("tenant_register", {
      p_code: a.code,
      p_flat_id: a.flats[flat],
      p_full_name: user.name,
      p_agreement_start: "2026-01-01",
      p_agreement_end: "2026-12-31",
      p_owner_name: "Rahul Sharma",
      p_owner_phone: owner.phone,
      ...over,
    });

  it("registered -> owner approved -> society admin approved -> active", async () => {
    const tenant = await fx.user();
    const reg = await register(tenant);
    expect(reg.error).toBeNull();
    expect(reg.data.status).toBe("registered");
    // No membership until the chain finishes, so nothing can skip it.
    expect(await countRows("society_memberships", { society_id: a.id, user_id: tenant.id })).toBe(
      0,
    );

    expect(
      codeOf(
        await a.authority.rpc("tenant_admin_decide", { p_tenant_id: reg.data.id, p_approve: true }),
      ),
    ).toBe("OWNER_APPROVAL_REQUIRED");

    const stranger = await fx.user();
    await fx.seat(a, stranger, "102");
    for (const actor of [stranger, tenant, b.authority, a.authority]) {
      expect(
        codeOf(
          await actor.rpc("tenant_owner_decide", { p_tenant_id: reg.data.id, p_approve: true }),
        ),
      ).toBe("TENANT_NOT_FOUND");
    }

    const listed = await owner.rpc("owner_list_tenant_requests");
    const row = listed.data.find((t) => t.id === reg.data.id);
    expect(row.phone).toBeNull();
    expect(row.owner_phone).toBeNull();

    const ownerOk = await owner.rpc("tenant_owner_decide", {
      p_tenant_id: reg.data.id,
      p_approve: true,
    });
    expect(ownerOk.data.status).toBe("owner_approved");
    expect(await countRows("society_memberships", { society_id: a.id, user_id: tenant.id })).toBe(
      0,
    );

    for (const actor of [owner, tenant, b.authority]) {
      expect(
        codeOf(
          await actor.rpc("tenant_admin_decide", { p_tenant_id: reg.data.id, p_approve: true }),
        ),
      ).toBe("TENANT_NOT_FOUND");
    }

    const admin = await a.authority.rpc("tenant_admin_decide", {
      p_tenant_id: reg.data.id,
      p_approve: true,
    });
    expect(admin.data.status).toBe("active");
    expect(admin.data.admin_approved_at).toBeTruthy();

    const { data: mems } = await adminClient()
      .from("society_memberships")
      .select("flat_id, role, resident_type, residency, status")
      .eq("society_id", a.id)
      .eq("user_id", tenant.id);
    expect(mems).toEqual([
      {
        flat_id: a.flats["101"],
        role: "member",
        resident_type: "tenant",
        residency: "tenant",
        status: "active",
      },
    ]);
    expect(
      codeOf(
        await a.authority.rpc("tenant_admin_decide", { p_tenant_id: reg.data.id, p_approve: true }),
      ),
    ).toBe("INVALID_TENANT_STATE");
  });

  it("rejection at either stage stops the chain and leaves no membership", async () => {
    const t1 = await fx.user();
    const r1 = await register(t1);
    expect(
      codeOf(await owner.rpc("tenant_owner_decide", { p_tenant_id: r1.data.id, p_approve: false })),
    ).toBe("INVALID_REASON");
    const rej = await owner.rpc("tenant_owner_decide", {
      p_tenant_id: r1.data.id,
      p_approve: false,
      p_reason: "Not my tenant",
    });
    expect(rej.data.status).toBe("rejected");
    expect(rej.data.rejected_stage).toBe("owner");
    expect(await countRows("society_memberships", { society_id: a.id, user_id: t1.id })).toBe(0);

    const t2 = await fx.user();
    const r2 = await register(t2);
    await owner.rpc("tenant_owner_decide", { p_tenant_id: r2.data.id, p_approve: true });
    const rej2 = await a.authority.rpc("tenant_admin_decide", {
      p_tenant_id: r2.data.id,
      p_approve: false,
      p_reason: "Documents missing",
    });
    expect(rej2.data.status).toBe("rejected");
    expect(rej2.data.rejected_stage).toBe("admin");

    const again = await register(t2);
    expect(again.data.status).toBe("registered");
  });

  it("a flat with no active owner goes straight to the manager, and it is recorded", async () => {
    const t = await fx.user();
    const r = await register(t, "104");
    const res = await a.authority.rpc("tenant_admin_decide", {
      p_tenant_id: r.data.id,
      p_approve: true,
    });
    expect(res.data.status).toBe("active");
    expect(res.data.owner_step_skipped).toBe(true);
  });

  it("a future start date rests at admin_approved until it arrives", async () => {
    const t = await fx.user();
    const r = await register(t, "104", { p_agreement_start: tomorrow(), p_agreement_end: null });
    const res = await a.authority.rpc("tenant_admin_decide", {
      p_tenant_id: r.data.id,
      p_approve: true,
    });
    expect(res.data.status).toBe("admin_approved");
    expect(await countRows("society_memberships", { society_id: a.id, user_id: t.id })).toBe(0);
    expect(codeOf(await t.rpc("tenant_activate", { p_tenant_id: r.data.id }))).toBe(
      "TENANCY_NOT_STARTED",
    );
    const early = await a.authority.rpc("tenant_activate", { p_tenant_id: r.data.id });
    expect(early.data.status).toBe("active");
  });

  it("a tenant cannot mark their own police verification verified", async () => {
    const t = await fx.user();
    expect(codeOf(await register(t, "101", { p_police_status: "verified" }))).toBe(
      "INVALID_POLICE_STATUS",
    );
    const r = await register(t, "101", {
      p_police_status: "submitted",
      p_police_reference: "PV-1",
    });
    expect(r.data.police_status).toBe("submitted");
    expect(
      codeOf(
        await b.authority.rpc("manager_set_tenant_police_status", {
          p_tenant_id: r.data.id,
          p_status: "verified",
        }),
      ),
    ).toBe("TENANT_NOT_FOUND");
    const ok = await a.authority.rpc("manager_set_tenant_police_status", {
      p_tenant_id: r.data.id,
      p_status: "verified",
    });
    expect(ok.data.police_status).toBe("verified");

    const edit = await t.rpc("tenant_save_my_details", {
      p_society_id: a.id,
      p_full_name: t.name,
      p_police_status: "not_submitted",
    });
    expect(edit.data.police_status).toBe("verified");
  });

  it("a flat from another society is refused and bad codes are counted", async () => {
    const t = await fx.user();
    const res = await t.rpc("tenant_register", {
      p_code: a.code,
      p_flat_id: b.flats["101"],
      p_full_name: t.name,
    });
    expect(res.data).toEqual({ error: "FLAT_NOT_IN_SOCIETY" });
    const attempt = () =>
      t.rpc("tenant_register", {
        p_code: "NOPE-NOPE",
        p_flat_id: a.flats["101"],
        p_full_name: t.name,
      });
    for (let i = 0; i < 5; i++) expect((await attempt()).data).toEqual({ error: "INVALID_CODE" });
    // The failures committed even though each call returned normally.
    expect(codeOf(await attempt())).toBe("TOO_MANY_CODE_ATTEMPTS");
  });

  it("manager list is scoped to the society", async () => {
    const mine = await a.authority.rpc("manager_list_tenants", { p_society_id: a.id });
    expect(mine.data.total).toBeGreaterThan(0);
    expect(codeOf(await b.authority.rpc("manager_list_tenants", { p_society_id: a.id }))).toBe(
      "NOT_SOCIETY_MANAGER",
    );
    expect(codeOf(await owner.rpc("manager_list_tenants", { p_society_id: a.id }))).toBe(
      "NOT_SOCIETY_MANAGER",
    );
  });
});
