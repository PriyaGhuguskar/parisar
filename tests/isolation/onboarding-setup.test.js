/**
 * Society onboarding: setup structure, progress and completion. Migrations 063-064.
 * Runs against the real database with throwaway users.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  anonClient,
  clearRateBuckets,
  codeOf,
  countRows,
  createFixture,
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

describe("setup structure", () => {
  it("every setup RPC refuses a secretary of another society and a plain member", async () => {
    const member = await fx.user();
    await fx.seat(a, member, "104");
    for (const actor of [b.authority, member]) {
      const calls = [
        ["setup_get_state", { p_society_id: a.id }],
        ["setup_upsert_wing", { p_society_id: a.id, p_name: "Z" }],
        ["setup_upsert_floor", { p_society_id: a.id, p_wing_id: a.wingId, p_number: 9 }],
        [
          "setup_upsert_flat",
          { p_society_id: a.id, p_wing_id: a.wingId, p_floor_id: a.floorId, p_number: "999" },
        ],
        [
          "setup_bulk_create_flats",
          { p_society_id: a.id, p_floor_id: a.floorId, p_flats: [{ number: "998" }] },
        ],
        ["setup_save_draft", { p_society_id: a.id, p_step: "wings", p_draft: {} }],
        ["setup_skip_step", { p_society_id: a.id, p_step: "staff" }],
        ["setup_complete", { p_society_id: a.id }],
        ["setup_delete_wing", { p_wing_id: a.wingId }],
        ["setup_delete_floor", { p_floor_id: a.floorId }],
        ["setup_delete_flat", { p_flat_id: a.flats["101"] }],
      ];
      for (const [fn, args] of calls) {
        expect(codeOf(await actor.rpc(fn, args)), fn).toBe("NOT_SOCIETY_MANAGER");
      }
    }
    expect(
      (await anonClient().rpc("setup_get_state", { p_society_id: a.id })).error,
    ).not.toBeNull();
  });

  it("clients cannot write floors or flats directly", async () => {
    const auth = a.authority;
    const floor = await auth.client
      .from("floors")
      .insert({ society_id: a.id, wing_id: a.wingId, number: 50 });
    expect(floor.error).not.toBeNull();
    const flat = await auth.client
      .from("flats")
      .update({ status: "occupied" })
      .eq("id", a.flats["101"])
      .select();
    expect(flat.error).not.toBeNull();
  });

  it("floors are readable inside the society and not outside it", async () => {
    const inside = await a.authority.client.from("floors").select("id").eq("society_id", a.id);
    expect(inside.data.length).toBeGreaterThan(0);
    const outside = await b.authority.client.from("floors").select("id").eq("society_id", a.id);
    expect(outside.data).toEqual([]);
  });

  it("prevents duplicates, case-insensitively", async () => {
    const auth = a.authority;
    expect(codeOf(await auth.rpc("setup_upsert_wing", { p_society_id: a.id, p_name: "a" }))).toBe(
      "WING_NAME_EXISTS",
    );
    expect(
      codeOf(
        await auth.rpc("setup_upsert_wing", { p_society_id: a.id, p_name: "New", p_code: "a" }),
      ),
    ).toBe("WING_CODE_EXISTS");
    expect(
      codeOf(
        await auth.rpc("setup_upsert_floor", {
          p_society_id: a.id,
          p_wing_id: a.wingId,
          p_number: 1,
        }),
      ),
    ).toBe("FLOOR_EXISTS");
    expect(
      codeOf(
        await auth.rpc("setup_upsert_flat", {
          p_society_id: a.id,
          p_wing_id: a.wingId,
          p_floor_id: a.floorId,
          p_number: "101",
        }),
      ),
    ).toBe("FLAT_EXISTS");
  });

  it("a bulk create with one duplicate creates nothing", async () => {
    const before = await countRows("flats", { society_id: a.id });
    const res = await a.authority.rpc("setup_bulk_create_flats", {
      p_society_id: a.id,
      p_floor_id: a.floorId,
      p_flats: [{ number: "201" }, { number: "201" }],
    });
    expect(codeOf(res)).toBe("FLAT_EXISTS");
    expect(await countRows("flats", { society_id: a.id })).toBe(before);
  });

  it("stores and validates flat attributes", async () => {
    const auth = a.authority;
    const made = await auth.rpc("setup_upsert_flat", {
      p_society_id: a.id,
      p_wing_id: a.wingId,
      p_floor_id: a.floorId,
      p_number: "301",
      p_flat_type: "2bhk",
      p_area_sqft: 950.5,
      p_bedrooms: 2,
      p_parking_slot: "P-12",
      p_status: "under_construction",
    });
    expect(made.error).toBeNull();
    expect(made.data).toEqual(
      expect.objectContaining({
        flat_type: "2bhk",
        area_sqft: 950.5,
        bedrooms: 2,
        parking_slot: "P-12",
        status: "under_construction",
        effective_status: "under_construction",
      }),
    );
    const bad = (over) =>
      auth.rpc("setup_upsert_flat", {
        p_society_id: a.id,
        p_wing_id: a.wingId,
        p_floor_id: a.floorId,
        p_number: "302",
        ...over,
      });
    expect(codeOf(await bad({ p_status: "haunted" }))).toBe("INVALID_FLAT_STATUS");
    expect(codeOf(await bad({ p_flat_type: "castle" }))).toBe("INVALID_FLAT_TYPE");
    expect(codeOf(await bad({ p_bedrooms: 99 }))).toBe("INVALID_BEDROOMS");
    // A floor from another society is not usable here.
    expect(codeOf(await bad({ p_floor_id: b.floorId }))).toBe("FLOOR_NOT_FOUND");
  });

  it("will not delete a flat someone lives on", async () => {
    const member = await fx.user();
    await fx.seat(a, member, "103");
    expect(codeOf(await a.authority.rpc("setup_delete_flat", { p_flat_id: a.flats["103"] }))).toBe(
      "FLAT_IN_USE",
    );
    expect(codeOf(await a.authority.rpc("setup_delete_wing", { p_wing_id: a.wingId }))).toBe(
      "WING_IN_USE",
    );
    expect(codeOf(await a.authority.rpc("setup_delete_floor", { p_floor_id: a.floorId }))).toBe(
      "FLOOR_HAS_FLATS",
    );
  });
});

describe("setup progress and completion", () => {
  let s;

  beforeAll(async () => {
    const authority = await fx.user();
    const { data } = await staff.rpc("admin_register_society", {
      p_name: "Empty Society",
      p_address_line: "1 Test Road",
      p_city: "Pune",
      p_state: "Maharashtra",
      p_pincode: "411001",
      p_authorities: [{ name: authority.name, phone: authority.phone }],
    });
    fx.societyIds.push(data.society_id);
    await authority.rpc("claim_authority_for_society", { p_society_id: data.society_id });
    await authority.refresh();
    s = { id: data.society_id, authority };
  }, 60_000);

  it("saves a draft per step and returns it", async () => {
    const save = await s.authority.rpc("setup_save_draft", {
      p_society_id: s.id,
      p_step: "wings",
      p_draft: { wings: ["A", "B"] },
    });
    expect(save.data).toEqual({ step: "wings", status: "draft" });
    const { data: state } = await s.authority.rpc("setup_get_state", { p_society_id: s.id });
    const step = state.steps.find((x) => x.key === "wings");
    expect(step.status).toBe("draft");
    expect(step.draft).toEqual({ wings: ["A", "B"] });
    expect(step.required).toBe(true);
    expect(state.can_complete).toBe(false);
  });

  it("skips optional steps only", async () => {
    const skip = await s.authority.rpc("setup_skip_step", {
      p_society_id: s.id,
      p_step: "amenities",
    });
    expect(skip.data.status).toBe("skipped");
    expect(
      codeOf(await s.authority.rpc("setup_skip_step", { p_society_id: s.id, p_step: "flats" })),
    ).toBe("STEP_NOT_SKIPPABLE");
    expect(
      codeOf(await s.authority.rpc("setup_skip_step", { p_society_id: s.id, p_step: "nope" })),
    ).toBe("INVALID_STEP");
    expect(
      codeOf(await s.authority.rpc("setup_complete_step", { p_society_id: s.id, p_step: "wings" })),
    ).toBe("STEP_INCOMPLETE");
  });

  it("completion needs a real wing, then floor, then flat", async () => {
    const complete = () => s.authority.rpc("setup_complete", { p_society_id: s.id });
    expect(codeOf(await complete())).toBe("SETUP_NEEDS_WING");

    const wing = await s.authority.rpc("setup_upsert_wing", {
      p_society_id: s.id,
      p_name: "North",
      p_code: "n",
    });
    expect(wing.data.code).toBe("N");
    expect(codeOf(await complete())).toBe("SETUP_NEEDS_FLOOR");

    const floor = await s.authority.rpc("setup_upsert_floor", {
      p_society_id: s.id,
      p_wing_id: wing.data.id,
      p_number: 0,
      p_name: "Ground",
      p_flat_count: 2,
    });
    expect(codeOf(await complete())).toBe("SETUP_NEEDS_FLAT");

    await s.authority.rpc("setup_upsert_flat", {
      p_society_id: s.id,
      p_wing_id: wing.data.id,
      p_floor_id: floor.data.id,
      p_number: "G1",
    });
    const done = await complete();
    expect(done.error).toBeNull();
    expect(done.data.counts).toEqual({ wings: 1, floors: 1, flats: 1 });
    expect(done.data.setup_state).toBe("needs_personal_onboarding");

    const { data: state } = await s.authority.rpc("setup_get_state", { p_society_id: s.id });
    expect(state.society.setup_completed_at).toBeTruthy();
    expect(state.steps.find((x) => x.key === "flats").status).toBe("completed");
    expect(state.wings[0].floors[0].flats[0].number).toBe("G1");
  });
});
