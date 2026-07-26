// Bootstrap Society Structure Isolation Tests
// Covers: bootstrap_society_structure RPC (wizard Steps 2+3 backend)
//   - Creator can batch-insert wings + flats
//   - Non-creator raises NOT_SOCIETY_CREATOR
//   - Unknown wing_name in flats array raises WING_NOT_FOUND
//
// Uses:
//   +919000000001 = Secretary (society creator)
//   +919000000003 = Intruder (different authenticated user)
//
// JavaScript only — no TypeScript, no import type.

import { afterAll, beforeEach, describe, expect, it } from "vitest";
import {
  adminClient,
  cleanupTestUsers,
  resetTestState,
  signInTestPhone,
} from "./helpers/phase3.js";

afterAll(async () => {
  await resetTestState();
  await cleanupTestUsers();
});

describe("Phase 3 — bootstrap_society_structure (creator-gate + wings/flats batch insert)", () => {
  beforeEach(async () => {
    await resetTestState();
  });

  it("bootstrap_society_structure inserts wings + flats for the society creator, returns inserted ids", async () => {
    const sec = await signInTestPhone("+919000000001", "secretary");
    const { data: created, error: createError } = await sec.client.rpc(
      "create_society_with_secretary",
      {
        p_name: "Bootstrap Society",
        p_address: "1 Bootstrap Avenue, Mumbai, MH 400001",
        p_co_secretary_phone: "9000000002",
      },
    );
    expect(createError).toBeNull();

    const { data: result, error } = await sec.client.rpc("bootstrap_society_structure", {
      p_society_id: created.society_id,
      p_wings: [{ name: "A" }, { name: "B" }],
      p_flats: [
        { wing_name: "A", number: "101" },
        { wing_name: "A", number: "102" },
        { wing_name: "B", number: "201" },
      ],
    });

    expect(error).toBeNull();
    expect(result.wings).toHaveLength(2);
    expect(result.flats).toHaveLength(3);

    // Assert wings exist in DB with correct society_id
    const admin = adminClient();
    const { data: dbWings } = await admin
      .from("wings")
      .select("id, name, society_id")
      .eq("society_id", created.society_id)
      .order("name");
    expect(dbWings).toHaveLength(2);
    expect(dbWings[0].name).toBe("A");
    expect(dbWings[1].name).toBe("B");

    // Assert flats exist in DB
    const { data: dbFlats } = await admin
      .from("flats")
      .select("id, number, society_id")
      .eq("society_id", created.society_id)
      .order("number");
    expect(dbFlats).toHaveLength(3);
    const flatNumbers = dbFlats.map((f) => f.number).sort();
    expect(flatNumbers).toEqual(["101", "102", "201"]);

    // Wing ids returned by RPC should match DB ids
    const returnedWingIds = result.wings.map((w) => w.id).sort();
    const dbWingIds = dbWings.map((w) => w.id).sort();
    expect(returnedWingIds).toEqual(dbWingIds);
  });

  it("bootstrap_society_structure raises NOT_SOCIETY_CREATOR for a different authenticated user", async () => {
    const sec = await signInTestPhone("+919000000001", "secretary");
    const { data: created } = await sec.client.rpc("create_society_with_secretary", {
      p_name: "Bootstrap Guarded Society",
      p_address: "2 Guard Road, Pune, MH 411001",
      p_co_secretary_phone: "9000000002",
    });

    // Intruder signs in as a different user
    const intruder = await signInTestPhone("+919000000003", "member");

    const { error } = await intruder.client.rpc("bootstrap_society_structure", {
      p_society_id: created.society_id,
      p_wings: [{ name: "A" }],
      p_flats: [],
    });

    expect(error).not.toBeNull();
    expect(error.message ?? "").toMatch(/NOT_SOCIETY_CREATOR/);
  });

  it("bootstrap_society_structure raises WING_NOT_FOUND when flat references an unknown wing_name", async () => {
    const sec = await signInTestPhone("+919000000001", "secretary");
    const { data: created } = await sec.client.rpc("create_society_with_secretary", {
      p_name: "Bootstrap WingRef Society",
      p_address: "3 Wing Ref Street, Thane, MH 400601",
      p_co_secretary_phone: "9000000002",
    });

    const { error } = await sec.client.rpc("bootstrap_society_structure", {
      p_society_id: created.society_id,
      p_wings: [{ name: "A" }],
      p_flats: [{ wing_name: "Z", number: "101" }], // "Z" does not exist in wings
    });

    expect(error).not.toBeNull();
    expect(error.message ?? "").toMatch(/WING_NOT_FOUND/);
  });

  it("bootstrap_society_structure with empty wings and empty flats succeeds with empty result", async () => {
    const sec = await signInTestPhone("+919000000001", "secretary");
    const { data: created } = await sec.client.rpc("create_society_with_secretary", {
      p_name: "Empty Bootstrap Society",
      p_address: "4 Empty Road, Aurangabad, MH 431001",
      p_co_secretary_phone: "9000000002",
    });

    const { data: result, error } = await sec.client.rpc("bootstrap_society_structure", {
      p_society_id: created.society_id,
      p_wings: [],
      p_flats: [],
    });

    expect(error).toBeNull();
    expect(result.wings).toHaveLength(0);
    expect(result.flats).toHaveLength(0);
  });
});
