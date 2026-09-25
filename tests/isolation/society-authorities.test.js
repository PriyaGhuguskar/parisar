/**
 * Society Authorities (migration …048) — replaces the single "chairman".
 *
 * Proves, against the real database:
 *   - staff create a society with an authorities LIST (validation included);
 *   - an authority's first sign-in claims ONE flat-less authority membership
 *     (needs_setup while the society has no flats);
 *   - onboarding as a resident attaches the flat to that SAME membership — one
 *     membership per person, so the JWT hook's single role stays correct;
 *   - a second authority claims after flats exist (needs_flat only);
 *   - an authority adds another authority; an existing resident is upgraded at once;
 *   - residents cannot add authorities or claim, and cannot read the list;
 *   - staff edit rules (phone locked once claimed) and duplicate protection.
 *
 * Test phones 9000000020-24 (+ 9000000029 never signs in) are used only here.
 * JavaScript only — no TypeScript.
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { adminClient, refreshSession, signInTestPhone } from "./helpers/phase3.js";

const PHONE = {
  staffAdmin: "9000000024",
  a1: "9000000020",
  a2: "9000000021",
  resident: "9000000022",
  outsider: "9000000023",
  neverSignsIn: "9000000029",
};

let staff;
let a1; // first authority — signed in once, session refreshed as claims change
let societyId;
let code;
let flats = [];
const userIds = [];

function errCode(error) {
  return error ? String(error.message).match(/[A-Z_]{5,}/)?.[0] ?? error.message : null;
}

async function createSociety(authorities) {
  return staff.client.rpc("admin_create_society", {
    p_name: "Authority Test Society",
    p_address_line: "1 Authority Road",
    p_city: "Pune",
    p_state: "MH",
    p_pincode: "411001",
    p_landmark: null,
    p_authorities: authorities,
  });
}

async function membershipsOf(userId) {
  const { data } = await adminClient()
    .from("society_memberships")
    .select("id, role, flat_id, status")
    .eq("user_id", userId)
    .eq("society_id", societyId);
  return data ?? [];
}

async function onboard(client, flatId, name) {
  return client.rpc("onboard_resident", {
    p_code: code,
    p_flat_id: flatId,
    p_full_name: name,
    p_residency: "owner",
    p_alt_phone: null,
    p_family: [],
  });
}

beforeAll(async () => {
  staff = await signInTestPhone(PHONE.staffAdmin, "member");
  userIds.push(staff.userId);
  const { error } = await adminClient()
    .from("platform_admins")
    .upsert({ user_id: staff.userId, role: "admin", note: "authorities test" }, { onConflict: "user_id" });
  if (error) throw error;
}, 120_000);

afterAll(async () => {
  const sb = adminClient();
  if (societyId) {
    await sb.from("audit_log").delete().eq("society_id", societyId);
    await sb.from("societies").delete().eq("id", societyId);
  }
  await sb.from("platform_admins").delete().eq("user_id", staff.userId);
  for (const id of userIds) await sb.auth.admin.deleteUser(id).catch(() => {});
});

describe("creating a society with authorities", () => {
  it("requires at least one authority", async () => {
    expect(errCode((await createSociety([])).error)).toBe("AUTHORITY_REQUIRED");
  });

  it("rejects invalid and duplicate authority phones", async () => {
    expect(errCode((await createSociety([{ name: "Ab", phone: "12345" }])).error)).toBe(
      "INVALID_AUTHORITY_PHONE",
    );
    expect(
      errCode(
        (
          await createSociety([
            { name: "One", phone: PHONE.a1 },
            { name: "Two", phone: `+91 ${PHONE.a1}` },
          ])
        ).error,
      ),
    ).toBe("DUPLICATE_AUTHORITY_PHONE");
  });

  it("stores every authority, unclaimed", async () => {
    const { data, error } = await createSociety([
      { name: "Asha Authority", phone: PHONE.a1 },
      { name: "Bala Authority", phone: PHONE.a2 },
    ]);
    expect(error).toBeNull();
    expect(data.authority_count).toBe(2);
    societyId = data.society_id;
    code = data.code;

    const { data: list } = await staff.client.rpc("admin_society_authorities", {
      p_society_id: societyId,
    });
    expect(list.map((a) => [a.full_name, a.phone, a.claimed])).toEqual([
      ["Asha Authority", PHONE.a1, false],
      ["Bala Authority", PHONE.a2, false],
    ]);
    // No membership exists until someone signs in.
    const { count } = await adminClient()
      .from("society_memberships")
      .select("id", { count: "exact", head: true })
      .eq("society_id", societyId);
    expect(count).toBe(0);
  });
});

describe("first authority signs in, sets up, and onboards as a resident", () => {
  it("claim gives ONE flat-less authority membership and asks for setup", async () => {
    a1 = await signInTestPhone(PHONE.a1, "member");
    userIds.push(a1.userId);
    const { data, error } = await a1.client.rpc("claim_society_authority");
    expect(error).toBeNull();
    expect(data).toEqual({ society_id: societyId, needs_setup: true, needs_flat: true });

    const mems = await membershipsOf(a1.userId);
    expect(mems).toHaveLength(1);
    expect(mems[0]).toEqual(expect.objectContaining({ role: "secretary", flat_id: null, status: "active" }));

    // Claim is idempotent.
    const again = await a1.client.rpc("claim_society_authority");
    expect(again.error).toBeNull();
    expect(await membershipsOf(a1.userId)).toHaveLength(1);
  });

  it("the JWT now carries the society and the authority role", async () => {
    a1 = { ...a1, ...(await refreshSession(a1.session.refresh_token)) };
    const payload = JSON.parse(
      Buffer.from(a1.accessToken.split(".")[1], "base64url").toString("utf8"),
    );
    expect(payload.app_metadata).toEqual(
      expect.objectContaining({ society_id: societyId, role: "secretary" }),
    );
  });

  it("onboarding attaches the flat to that same membership (still one row)", async () => {
    // Structure set up (as the first authority would on /setup/structure).
    const sb = adminClient();
    const { data: wing } = await sb
      .from("wings")
      .insert({ society_id: societyId, name: "A" })
      .select("id")
      .single();
    const { data: made } = await sb
      .from("flats")
      .insert(
        ["101", "102", "103", "104"].map((number) => ({
          society_id: societyId,
          wing_id: wing.id,
          number,
        })),
      )
      .select("id, number");
    flats = made.sort((x, y) => x.number.localeCompare(y.number));

    const { data, error } = await onboard(a1.client, flats[0].id, "Asha Authority");
    expect(error).toBeNull();
    expect(data).toEqual({ society_id: societyId, status: "active" });

    const mems = await membershipsOf(a1.userId);
    expect(mems).toHaveLength(1);
    expect(mems[0]).toEqual(
      expect.objectContaining({ role: "secretary", flat_id: flats[0].id, status: "active" }),
    );
  });

  it("the authority can read the authority list", async () => {
    const { data } = await a1.client
      .from("society_authorities")
      .select("phone, user_id")
      .eq("society_id", societyId);
    expect(data.map((a) => a.phone).sort()).toEqual([PHONE.a1, PHONE.a2]);
  });
});

describe("second authority, an existing resident, and an outsider", () => {
  let a2;
  let resident;
  let outsider;

  it("a second authority claims after flats exist: no setup, needs a flat", async () => {
    a2 = await signInTestPhone(PHONE.a2, "member");
    userIds.push(a2.userId);
    const { data, error } = await a2.client.rpc("claim_society_authority");
    expect(error).toBeNull();
    expect(data).toEqual({ society_id: societyId, needs_setup: false, needs_flat: true });
  });

  it("a normal resident joins as a member", async () => {
    resident = await signInTestPhone(PHONE.resident, "member");
    userIds.push(resident.userId);
    const { error } = await onboard(resident.client, flats[1].id, "Ravi Resident");
    expect(error).toBeNull();
    expect((await membershipsOf(resident.userId))[0].role).toBe("member");
  });

  it("an authority adds that resident as an authority — upgraded immediately", async () => {
    const fresh = await refreshSession(a1.session.refresh_token);
    a1 = { ...a1, ...fresh };

    const { data, error } = await fresh.client.rpc("add_society_authority", {
      p_society_id: societyId,
      p_name: "Ravi Resident",
      p_phone: `+91${PHONE.resident}`,
    });
    expect(error).toBeNull();
    expect(data.linked).toBe(true);
    const mems = await membershipsOf(resident.userId);
    expect(mems).toHaveLength(1);
    expect(mems[0]).toEqual(expect.objectContaining({ role: "secretary", flat_id: flats[1].id }));

    // Adding the same number again is refused.
    const dup = await fresh.client.rpc("add_society_authority", {
      p_society_id: societyId,
      p_name: "Ravi Again",
      p_phone: PHONE.resident,
    });
    expect(errCode(dup.error)).toBe("ALREADY_AUTHORITY");
  });

  it("an outsider resident cannot add authorities, claim, or read the list", async () => {
    outsider = await signInTestPhone(PHONE.outsider, "member");
    userIds.push(outsider.userId);
    await onboard(outsider.client, flats[2].id, "Omar Outsider");
    const fresh = await refreshSession(outsider.session.refresh_token);

    const add = await fresh.client.rpc("add_society_authority", {
      p_society_id: societyId,
      p_name: "Sneaky",
      p_phone: "9888888888",
    });
    expect(errCode(add.error)).toBe("NOT_AUTHORITY");

    const claim = await fresh.client.rpc("claim_society_authority");
    expect(errCode(claim.error)).toBe("NOT_AN_AUTHORITY");

    const { data } = await fresh.client
      .from("society_authorities")
      .select("id")
      .eq("society_id", societyId);
    expect(data).toEqual([]);

    // And cannot write the table directly.
    const direct = await fresh.client
      .from("society_authorities")
      .insert({ society_id: societyId, full_name: "Direct", phone: "9777777777" });
    expect(direct.error).toBeTruthy();
    expect((await membershipsOf(outsider.userId))[0].role).toBe("member");
  });
});

describe("staff editing authorities", () => {
  let claimedId;
  let unclaimedId;

  beforeAll(async () => {
    const { data: added } = await staff.client.rpc("admin_add_society_authority", {
      p_society_id: societyId,
      p_name: "Never Signs",
      p_phone: PHONE.neverSignsIn,
    });
    unclaimedId = added.id;
    const { data: list } = await staff.client.rpc("admin_society_authorities", {
      p_society_id: societyId,
    });
    claimedId = list.find((a) => a.phone === PHONE.a2).id;
  });

  it("a claimed authority's phone is locked but the name can change", async () => {
    const phoneChange = await staff.client.rpc("admin_update_society_authority", {
      p_authority_id: claimedId,
      p_name: "Bala Authority",
      p_phone: "9111111111",
    });
    expect(errCode(phoneChange.error)).toBe("AUTHORITY_ALREADY_CLAIMED");

    const rename = await staff.client.rpc("admin_update_society_authority", {
      p_authority_id: claimedId,
      p_name: "Bala Renamed",
      p_phone: PHONE.a2,
    });
    expect(rename.error).toBeNull();
    expect(rename.data).toEqual({ claimed: true });
  });

  it("an unclaimed authority's phone can change, but not onto another authority", async () => {
    const clash = await staff.client.rpc("admin_update_society_authority", {
      p_authority_id: unclaimedId,
      p_name: "Never Signs",
      p_phone: PHONE.a1,
    });
    expect(errCode(clash.error)).toBe("ALREADY_AUTHORITY");

    const ok = await staff.client.rpc("admin_update_society_authority", {
      p_authority_id: unclaimedId,
      p_name: "Never Signs",
      p_phone: "9222222222",
    });
    expect(ok.error).toBeNull();
    expect(ok.data).toEqual({ claimed: false });
  });
});
