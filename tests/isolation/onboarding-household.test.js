/**
 * Society onboarding: family invites and same-flat household. Migration 070.
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

describe("family invites", () => {
  it("token is shown once, stored hashed, and links the flat on accept", async () => {
    const relative = await fx.user(undefined, { name: "Neha Sharma" });
    const made = await owner.rpc("family_invite_create", {
      p_society_id: a.id,
      p_full_name: "Neha Sharma",
      p_relationship: "spouse",
      p_phone: relative.phone,
    });
    expect(made.error).toBeNull();
    expect(made.data.sent).toBe(false);
    expect(made.data.token).toHaveLength(64);

    const { data: stored } = await adminClient()
      .from("family_invites")
      .select("token_hash")
      .eq("id", made.data.invite_id)
      .single();
    expect(stored.token_hash).not.toBe(made.data.token);

    const list = await owner.rpc("family_invite_list", { p_society_id: a.id });
    expect(JSON.stringify(list.data)).not.toContain(made.data.token);

    // The wrong person, holding a valid token, learns nothing and gets nothing.
    const wrong = await fx.user();
    expect((await wrong.rpc("family_invite_preview", { p_token: made.data.token })).data).toEqual({
      error: "INVITE_PHONE_MISMATCH",
    });
    expect((await wrong.rpc("family_invite_accept", { p_token: made.data.token })).data).toEqual({
      error: "INVITE_PHONE_MISMATCH",
    });
    expect(await countRows("society_memberships", { society_id: a.id, user_id: wrong.id })).toBe(0);

    const preview = await relative.rpc("family_invite_preview", { p_token: made.data.token });
    expect(preview.data.flat_label).toBe("A-101");
    expect(preview.data.invited_by).toBe("R**** S****");

    const accepted = await relative.rpc("family_invite_accept", { p_token: made.data.token });
    expect(accepted.error).toBeNull();
    expect(accepted.data.flat_id).toBe(a.flats["101"]);

    const { data: mems } = await adminClient()
      .from("society_memberships")
      .select("flat_id, role, resident_type")
      .eq("society_id", a.id)
      .eq("user_id", relative.id);
    expect(mems).toEqual([
      { flat_id: a.flats["101"], role: "member", resident_type: "family_member" },
    ]);
    expect(
      await countRows("family_members", { society_id: a.id, claimed_user_id: relative.id }),
    ).toBe(1);

    expect((await relative.rpc("family_invite_accept", { p_token: made.data.token })).data).toEqual(
      {
        error: "INVITE_USED",
      },
    );
    expect(await countRows("society_memberships", { society_id: a.id, user_id: relative.id })).toBe(
      1,
    );
  });

  it("a guessed token gets nothing; revoked and expired ones stop working", async () => {
    const someone = await fx.user();
    expect((await someone.rpc("family_invite_accept", { p_token: "0".repeat(64) })).data).toEqual({
      error: "INVITE_NOT_FOUND",
    });

    const r = await owner.rpc("family_invite_create", {
      p_society_id: a.id,
      p_full_name: "Revoked Person",
      p_relationship: "other",
    });
    expect(
      codeOf(await b.authority.rpc("family_invite_revoke", { p_invite_id: r.data.invite_id })),
    ).toBe("INVITE_NOT_FOUND");
    await owner.rpc("family_invite_revoke", { p_invite_id: r.data.invite_id });
    expect((await someone.rpc("family_invite_accept", { p_token: r.data.token })).data).toEqual({
      error: "INVITE_REVOKED",
    });

    const e = await owner.rpc("family_invite_create", {
      p_society_id: a.id,
      p_full_name: "Expired Person",
      p_relationship: "child",
    });
    await adminClient()
      .from("family_invites")
      .update({ expires_at: new Date(Date.now() - 1000).toISOString() })
      .eq("id", e.data.invite_id);
    expect((await someone.rpc("family_invite_accept", { p_token: e.data.token })).data).toEqual({
      error: "INVITE_EXPIRED",
    });
  });

  it("only an owner or tenant of the society can invite", async () => {
    const args = { p_society_id: a.id, p_full_name: "Nobody Here", p_relationship: "other" };
    expect(codeOf(await b.authority.rpc("family_invite_create", args))).toBe("NOT_ALLOWED");
    expect(codeOf(await staff.rpc("family_invite_create", args))).toBe("NOT_ALLOWED");
    expect(
      codeOf(await owner.rpc("family_invite_create", { ...args, p_relationship: "butler" })),
    ).toBe("INVALID_RELATIONSHIP");
    expect((await anonClient().rpc("family_invite_create", args)).error).not.toBeNull();
  });
});

describe("same-flat household", () => {
  const lookup = (user, flat = "101", code = a.code) =>
    user.rpc("household_lookup", { p_code: code, p_wing: "A", p_floor: "1", p_flat: flat });
  const request = (user, flat = "101", over = {}) =>
    user.rpc("household_request_access", {
      p_code: a.code,
      p_flat_id: a.flats[flat],
      p_full_name: user.name,
      p_relationship: "parent",
      ...over,
    });

  it("an unverified person sees masked names and a count, never a phone", async () => {
    const visitor = await fx.user();
    const { data, error } = await lookup(visitor);
    expect(error).toBeNull();
    expect(data.member_count).toBeGreaterThan(0);
    expect(data.masked_members).toContain("R**** S****");
    const text = JSON.stringify(data);
    expect(text).not.toContain("Rahul");
    expect(text).not.toContain(owner.phone);
    expect(Object.keys(data).sort()).toEqual(
      [
        "already_on_flat",
        "flat_id",
        "flat_label",
        "masked_members",
        "member_count",
        "society_id",
        "society_name",
      ].sort(),
    );
  });

  it("a wrong code or flat reveals nothing, and anon cannot call it", async () => {
    const visitor = await fx.user();
    expect((await lookup(visitor, "101", "NOPE-NOPE")).data).toEqual({ error: "INVALID_CODE" });
    expect((await lookup(visitor, "9999")).data).toEqual({ error: "FLAT_NOT_FOUND" });
    const anon = await anonClient().rpc("household_lookup", {
      p_code: a.code,
      p_wing: "A",
      p_floor: "1",
      p_flat: "101",
    });
    expect(anon.error).not.toBeNull();
  });

  it("knowing the flat number grants nothing until someone approves", async () => {
    const visitor = await fx.user(undefined, { name: "Old Parent" });
    const res = await request(visitor);
    expect(res.data.status).toBe("pending");
    expect(await countRows("society_memberships", { society_id: a.id, user_id: visitor.id })).toBe(
      0,
    );
    await visitor.refresh();
    const flats = await visitor.client.from("flats").select("id").eq("society_id", a.id);
    expect(flats.data).toEqual([]);
    const board = await visitor.client.from("notifications").select("id").eq("society_id", a.id);
    expect(board.data).toEqual([]);
    expect(codeOf(await request(visitor))).toBe("HOUSEHOLD_REQUEST_EXISTS");
    expect(
      codeOf(
        await visitor.rpc("household_decide_request", {
          p_request_id: res.data.request_id,
          p_approve: true,
        }),
      ),
    ).toBe("REQUEST_NOT_FOUND");
  });

  it("approval by the owner links to the flat with no duplicates", async () => {
    const visitor = await fx.user(undefined, { name: "Approved Parent" });
    await adminClient().from("resident_records").insert({
      society_id: a.id,
      flat_id: a.flats["101"],
      full_name: "Approved Parent",
      phone10: visitor.phone,
      resident_type: "family_member",
    });
    const { data: req } = await request(visitor);

    const pending = await owner.rpc("household_pending_for_me");
    const row = pending.data.find((r) => r.id === req.request_id);
    expect(row.full_name).toBe("Approved Parent");
    expect(row.phone_last4).toBe(visitor.phone.slice(-4));
    expect(row).not.toHaveProperty("phone");

    const neighbour = await fx.user();
    await fx.seat(a, neighbour, "102");
    for (const actor of [neighbour, b.authority, staff]) {
      expect(
        codeOf(
          await actor.rpc("household_decide_request", {
            p_request_id: req.request_id,
            p_approve: true,
          }),
        ),
      ).toBe("REQUEST_NOT_FOUND");
      expect((await actor.rpc("household_pending_for_me")).data.map((r) => r.id)).not.toContain(
        req.request_id,
      );
    }

    const ok = await owner.rpc("household_decide_request", {
      p_request_id: req.request_id,
      p_approve: true,
    });
    expect(ok.data.status).toBe("approved");
    expect(await countRows("society_memberships", { society_id: a.id, user_id: visitor.id })).toBe(
      1,
    );
    expect(
      await countRows("family_members", { society_id: a.id, claimed_user_id: visitor.id }),
    ).toBe(1);
    const { data: rec } = await adminClient()
      .from("resident_records")
      .select("status, user_id")
      .eq("society_id", a.id)
      .eq("phone10", visitor.phone)
      .single();
    expect(rec).toEqual({ status: "verified", user_id: visitor.id });

    expect(
      codeOf(
        await owner.rpc("household_decide_request", {
          p_request_id: req.request_id,
          p_approve: true,
        }),
      ),
    ).toBe("REQUEST_CLOSED");
  });

  it("a family member cannot approve, a tenant cannot approve an owner request, a manager can", async () => {
    const family = await fx.user();
    await fx.seat(a, family, "102", "family_member");
    const tenant = await fx.user();
    await fx.seat(a, tenant, "102", "tenant");

    const v1 = await fx.user();
    const { data: r1 } = await request(v1, "102");
    expect(
      codeOf(
        await family.rpc("household_decide_request", {
          p_request_id: r1.request_id,
          p_approve: true,
        }),
      ),
    ).toBe("REQUEST_NOT_FOUND");
    expect(
      (
        await tenant.rpc("household_decide_request", {
          p_request_id: r1.request_id,
          p_approve: true,
        })
      ).data.status,
    ).toBe("approved");

    const v2 = await fx.user();
    const { data: r2 } = await request(v2, "102", { p_resident_type: "owner" });
    expect(
      codeOf(
        await tenant.rpc("household_decide_request", {
          p_request_id: r2.request_id,
          p_approve: true,
        }),
      ),
    ).toBe("REQUEST_NOT_FOUND");
    const rej = await a.authority.rpc("household_decide_request", {
      p_request_id: r2.request_id,
      p_approve: false,
      p_reason: "Not an owner on record",
    });
    expect(rej.data.status).toBe("rejected");
    expect(await countRows("society_memberships", { society_id: a.id, user_id: v2.id })).toBe(0);

    const v3 = await fx.user();
    expect(codeOf(await request(v3, "102", { p_resident_type: "tenant" }))).toBe(
      "USE_TENANT_REGISTRATION",
    );
  });

  it("the requester sees and can cancel their own request only", async () => {
    const v = await fx.user();
    const { data: r } = await request(v, "103");
    expect((await v.rpc("household_my_requests")).data[0].status).toBe("pending");
    expect(
      codeOf(await owner.rpc("household_cancel_request", { p_request_id: r.request_id })),
    ).toBe("REQUEST_NOT_FOUND");
    expect(
      (await v.rpc("household_cancel_request", { p_request_id: r.request_id })).data.status,
    ).toBe("cancelled");
  });
});
