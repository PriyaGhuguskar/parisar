/**
 * Society onboarding: registration from a request, authority login, society titles. Migrations 061-062.
 * Runs against the real database with throwaway users.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  adminClient,
  anonClient,
  clearRateBuckets,
  codeOf,
  createFixture,
  randomPhone,
} from "./helpers/onboarding.js";

const fx = createFixture();
let staff;
let resident;

const inAnHour = () => new Date(Date.now() + 3600_000).toISOString();
const _later = (h) => new Date(Date.now() + h * 3600_000).toISOString();

async function submit(overrides = {}) {
  const res = await anonClient().rpc("submit_connect_request", {
    p_society_name: "Green Meadows",
    p_contact_name: "Asha Patil",
    p_phone: randomPhone(),
    p_preferred_at: inAnHour(),
    ...overrides,
  });
  return res;
}

async function requestId(code) {
  const { data } = await adminClient()
    .from("society_enrollment_requests")
    .select("id")
    .eq("request_code", code)
    .single();
  fx.requestIds.push(data.id);
  return data.id;
}

beforeAll(async () => {
  await clearRateBuckets([
    "rpc:connect:ip",
    "rpc:connect:phone",
    "rpc:connect_status:ip",
    "rpc:connect_status:code",
  ]);
  staff = await fx.staff();
  resident = await fx.user();
}, 120_000);

// The per-address limit (10/hour) is real and this suite submits more than that from
// one address; the per-phone limit has its own test below.
beforeEach(async () => {
  await clearRateBuckets(["rpc:connect:ip"]);
});

afterAll(async () => {
  await fx.cleanup();
  await clearRateBuckets([
    "rpc:connect:ip",
    "rpc:connect:phone",
    "rpc:connect_status:ip",
    "rpc:connect_status:code",
  ]);
}, 120_000);

// A refusal test that is wrong would create a society; track it so cleanup removes it.
async function registerTracked(args) {
  const res = await staff.rpc("admin_register_society", args);
  if (res.data?.society_id) fx.societyIds.push(res.data.society_id);
  return res;
}

describe("registration from a request", () => {
  const regNo = `REG/${Date.now()}`;
  let societyId;
  let requestRow;
  let extraPhone;
  let contactPhone;

  it("creates the society, links the request and seeds every request number", async () => {
    contactPhone = randomPhone();
    extraPhone = randomPhone();
    const { data: made } = await submit({
      p_phone: contactPhone,
      p_authority_numbers: [{ name: "Bala Rao", phone: extraPhone }, { phone: randomPhone() }],
    });
    requestRow = await requestId(made.request_code);

    const { data, error } = await staff.rpc("admin_register_society", {
      p_name: "Registered Heights",
      p_address_line: "12 MG Road",
      p_city: "Pune",
      p_state: "Maharashtra",
      p_pincode: "411001",
      p_request_id: requestRow,
      p_registration_number: regNo,
      p_society_type: "cooperative_housing",
      p_registration_date: "2005-04-01",
      p_official_email: "office@heights.example",
      p_official_phone: "020 1234 5678",
      p_features: ["visitors"],
    });
    expect(error).toBeNull();
    societyId = data.society_id;
    fx.societyIds.push(societyId);
    expect(data.code).toBeTruthy();
    expect(data.authority_count).toBe(3);

    const { data: auth } = await staff.rpc("admin_society_authorities", {
      p_society_id: societyId,
    });
    expect(auth.map((a) => a.phone).sort()).toEqual(
      expect.arrayContaining([contactPhone, extraPhone]),
    );
    expect(auth.find((a) => a.phone === contactPhone).full_name).toBe("Asha Patil");
    expect(auth.find((a) => a.phone === extraPhone).full_name).toBe("Bala Rao");

    const view = await staff.rpc("admin_get_connect_request", { p_request_id: requestRow });
    expect(view.data.status).toBe("registered");
    expect(view.data.society.id).toBe(societyId);
  });

  it("cannot register the same request twice", async () => {
    expect(
      codeOf(
        await staff.rpc("admin_register_society", {
          p_name: "Twice",
          p_address_line: "12 MG Road",
          p_city: "Pune",
          p_state: "Maharashtra",
          p_pincode: "411001",
          p_request_id: requestRow,
        }),
      ),
    ).toBe("REQUEST_ALREADY_REGISTERED");
  });

  it("refuses a duplicate registration number, a future date and an unknown type", async () => {
    const base = {
      p_name: "Another Society",
      p_address_line: "12 MG Road",
      p_city: "Pune",
      p_state: "Maharashtra",
      p_pincode: "411001",
      p_authorities: [{ name: "Someone", phone: randomPhone() }],
    };
    expect(codeOf(await registerTracked({ ...base, p_registration_number: regNo }))).toBe(
      "DUPLICATE_REGISTRATION_NUMBER",
    );
    expect(codeOf(await registerTracked({ ...base, p_registration_date: "2999-01-01" }))).toBe(
      "INVALID_REGISTRATION_DATE",
    );
    expect(codeOf(await registerTracked({ ...base, p_society_type: "castle" }))).toBe(
      "INVALID_SOCIETY_TYPE",
    );
  });

  it("will not grant a catalogue item with no module", async () => {
    const res = await registerTracked({
      p_name: "Parking Society",
      p_address_line: "12 MG Road",
      p_city: "Pune",
      p_state: "Maharashtra",
      p_pincode: "411001",
      p_authorities: [{ name: "Someone", phone: randomPhone() }],
      p_features: ["parking"],
    });
    expect(codeOf(res)).toBe("UNKNOWN_FEATURE");
  });

  it("the catalogue records which keys have a real module", async () => {
    const { data } = await staff.rpc("admin_feature_catalogue");
    expect(data.features.every((f) => f.has_module === true)).toBe(true);
    expect(data.features.map((f) => f.key)).toEqual(
      expect.arrayContaining(["visitors", "sos", "complaints"]),
    );
    expect(data.unavailable.map((f) => f.key).sort()).toEqual([
      "accounting",
      "events",
      "parking",
      "vendors",
    ]);
    expect(data.unavailable.every((f) => f.has_module === false)).toBe(true);
  });

  it("registration fields are readable by staff and not by an outsider", async () => {
    const ok = await staff.rpc("get_society_registration", { p_society_id: societyId });
    expect(ok.data.registration_number).toBe(regNo);
    expect(ok.data.country).toBe("India");
    expect(
      codeOf(await resident.rpc("get_society_registration", { p_society_id: societyId })),
    ).toBe("NOT_A_MEMBER");
    expect(codeOf(await resident.rpc("my_society_features", { p_society_id: societyId }))).toBe(
      "NOT_A_MEMBER",
    );
  });

  it("registration edits are staff only", async () => {
    expect(
      codeOf(
        await resident.rpc("admin_update_society_registration", {
          p_society_id: societyId,
          p_country: "Nepal",
        }),
      ),
    ).toBe("NOT_PLATFORM_STAFF");
    const res = await staff.rpc("admin_update_society_registration", {
      p_society_id: societyId,
      p_official_phone: "020 9999 9999",
    });
    expect(res.data.official_phone).toBe("020 9999 9999");
    expect(res.data.registration_number).toBe(regNo);
  });

  it("an authority number resolves to the society only after OTP, and only for that number", async () => {
    const stranger = await fx.user();
    const none = await stranger.rpc("my_authority_societies");
    expect(none.data.societies).toEqual([]);

    const anon = await anonClient().rpc("my_authority_societies");
    expect(anon.error).not.toBeNull();

    const authority = await fx.user(extraPhone, { name: "Bala Rao" });
    const mine = await authority.rpc("my_authority_societies");
    expect(mine.data.societies).toHaveLength(1);
    expect(mine.data.societies[0]).toEqual(
      expect.objectContaining({
        society_id: societyId,
        society_name: "Registered Heights",
        claimed: false,
        setup_state: "needs_setup",
      }),
    );
  });
});

describe("authority login state and claiming", () => {
  let society;
  let second;

  beforeAll(async () => {
    society = await fx.society(staff, { complete: false });
  }, 120_000);

  it("walks needs_setup -> needs_personal_onboarding -> complete", async () => {
    const a = society.authority;
    const state = async () =>
      (await a.rpc("my_authority_societies")).data.societies.find(
        (s) => s.society_id === society.id,
      ).setup_state;

    expect(await state()).toBe("needs_setup");
    await a.rpc("setup_complete", { p_society_id: society.id });
    expect(await state()).toBe("needs_personal_onboarding");

    const flat = society.flats["101"];
    const joined = await a.rpc("onboard_resident", {
      p_code: society.code,
      p_flat_id: flat,
      p_full_name: a.name,
      p_residency: "owner",
      p_alt_phone: null,
      p_family: [],
    });
    expect(joined.error).toBeNull();
    expect(await state()).toBe("complete");

    const { data: mems } = await adminClient()
      .from("society_memberships")
      .select("id, role, flat_id")
      .eq("society_id", society.id)
      .eq("user_id", a.id);
    expect(mems).toHaveLength(1);
    expect(mems[0].role).toBe("secretary");
  });

  it("a non-resident authority can skip choosing a flat", async () => {
    second = await fx.society(staff);
    const res = await second.authority.rpc("authority_skip_personal_onboarding", {
      p_society_id: second.id,
    });
    expect(res.data.setup_state).toBe("complete");
  });

  it("nobody else can claim or skip for that society", async () => {
    const outsider = await fx.user();
    expect(
      codeOf(await outsider.rpc("claim_authority_for_society", { p_society_id: society.id })),
    ).toBe("NOT_AN_AUTHORITY");
    expect(
      codeOf(
        await outsider.rpc("authority_skip_personal_onboarding", { p_society_id: society.id }),
      ),
    ).toBe("NOT_AN_AUTHORITY");
  });

  it("one phone that is an authority of two societies can claim each", async () => {
    const shared = await fx.user();
    const add = (id) =>
      staff.rpc("admin_add_society_authority", {
        p_society_id: id,
        p_name: "Shared Authority",
        p_phone: shared.phone,
      });
    await add(society.id);
    await add(second.id);

    const listed = await shared.rpc("my_authority_societies");
    expect(listed.data.societies).toHaveLength(2);

    for (const id of [society.id, second.id]) {
      const claim = await shared.rpc("claim_authority_for_society", { p_society_id: id });
      expect(claim.error).toBeNull();
    }
    const { data: mems } = await adminClient()
      .from("society_memberships")
      .select("society_id, role")
      .eq("user_id", shared.id);
    expect(mems.map((m) => m.society_id).sort()).toEqual([society.id, second.id].sort());
    expect(mems.every((m) => m.role === "secretary")).toBe(true);
  });
});

describe("society title", () => {
  let society;
  let member;
  let coSec;

  beforeAll(async () => {
    society = await fx.society(staff);
    member = await fx.user();
    await fx.seat(society, member, "102");
    coSec = await fx.user();
    await fx.seat(society, coSec, "103");
  }, 120_000);

  const setTitle = (actor, target, title, id = society.id) =>
    actor.rpc("set_member_society_title", {
      p_society_id: id,
      p_target_user_id: target.id,
      p_title: title,
    });
  const roleOf = async (user) => {
    const { data } = await adminClient()
      .from("society_memberships")
      .select("role, society_title")
      .eq("society_id", society.id)
      .eq("user_id", user.id)
      .single();
    return data;
  };

  it.each([
    ["committee_member", "board_member"],
    ["treasurer", "co_secretary"],
    ["resident", "member"],
  ])("%s maps to the %s role", async (title, role) => {
    const res = await setTitle(society.authority, member, title);
    expect(res.error).toBeNull();
    expect(await roleOf(member)).toEqual({ role, society_title: title });
  });

  it("chairman maps to secretary through the authority list, and removal revokes it", async () => {
    await setTitle(society.authority, member, "chairman");
    expect(await roleOf(member)).toEqual({ role: "secretary", society_title: "chairman" });
    const { data: rows } = await adminClient()
      .from("society_authorities")
      .select("id")
      .eq("society_id", society.id)
      .eq("phone", member.phone);
    expect(rows).toHaveLength(1);

    await setTitle(society.authority, member, "resident");
    expect((await roleOf(member)).role).toBe("member");
    const { data: gone } = await adminClient()
      .from("society_authorities")
      .select("id")
      .eq("society_id", society.id)
      .eq("phone", member.phone);
    expect(gone).toHaveLength(0);
  });

  it("refuses non-secretaries, bad titles and changing your own permissions", async () => {
    await setTitle(society.authority, coSec, "treasurer");
    expect(codeOf(await setTitle(coSec, member, "committee_member"))).toBe(
      "ONLY_SECRETARY_CAN_SET_TITLE",
    );
    expect(codeOf(await setTitle(member, member, "chairman"))).toBe("ONLY_SECRETARY_CAN_SET_TITLE");
    expect(codeOf(await setTitle(society.authority, member, "king"))).toBe("INVALID_TITLE");
    expect(codeOf(await setTitle(society.authority, society.authority, "resident"))).toBe(
      "CANNOT_CHANGE_OWN_ROLE",
    );
    const self = await setTitle(society.authority, society.authority, "chairman");
    expect(self.error).toBeNull();
  });

  it("a secretary of another society cannot set a title here", async () => {
    const other = await fx.society(staff);
    expect(codeOf(await setTitle(other.authority, member, "chairman"))).toBe(
      "ONLY_SECRETARY_CAN_SET_TITLE",
    );
  });

  it("a role change elsewhere clears a title that no longer fits", async () => {
    await setTitle(society.authority, member, "committee_member");
    await society.authority.rpc("set_membership_role", {
      p_target_user_id: member.id,
      p_role: "member",
    });
    expect(await roleOf(member)).toEqual({ role: "member", society_title: null });
  });
});
