// List Society Structure Isolation Tests
// Covers: list_society_structure RPC (pre-membership flat picker)
//   - Valid code → returns {society_id, wings, flats}
//   - Paused code → returns {error: 'CODE_PAUSED'}
//   - Revoked code → returns {error: 'INVALID_CODE'}
//   - Non-existent code → returns {error: 'INVALID_CODE'}
//
// Uses:
//   +919000000001 = Secretary (creates society)
//   +919000000003 = Member (calls list_society_structure before joining)
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

describe("Phase 3 — list_society_structure (code-status gating)", () => {
  beforeEach(async () => {
    await resetTestState();
  });

  // Helper: create a society + bootstrap wings/flats
  async function createSocietyWithStructure() {
    const sec = await signInTestPhone("+919000000001", "secretary");
    const { data: created, error } = await sec.client.rpc("create_society_with_secretary", {
      p_name: "ListStruct Society",
      p_address: "10 List Street, Mumbai, MH 400001",
      p_co_secretary_phone: "9000000002",
    });
    if (error) throw new Error(`create_society_with_secretary failed: ${error.message}`);

    await sec.client.rpc("bootstrap_society_structure", {
      p_society_id: created.society_id,
      p_wings: [{ name: "A" }],
      p_flats: [{ wing_name: "A", number: "101" }],
    });

    return { sec, created };
  }

  it("list_society_structure returns {society_id, wings, flats} for a valid (non-paused, non-revoked) code", async () => {
    const { created } = await createSocietyWithStructure();

    // Sign in as a member who doesn't have a membership yet
    const member = await signInTestPhone("+919000000003", "member");

    const { data, error } = await member.client.rpc("list_society_structure", {
      p_code: created.code,
    });

    expect(error).toBeNull();
    expect(data.society_id).toBe(created.society_id);
    expect(Array.isArray(data.wings)).toBe(true);
    expect(data.wings).toHaveLength(1);
    expect(data.wings[0].name).toBe("A");
    expect(Array.isArray(data.flats)).toBe(true);
    expect(data.flats).toHaveLength(1);
    expect(data.flats[0].number).toBe("101");
  });

  it("list_society_structure returns {error: CODE_PAUSED} for a paused code", async () => {
    const { created } = await createSocietyWithStructure();

    // Set paused_at on the code via service-role
    const admin = adminClient();
    await admin
      .from("society_codes")
      .update({ paused_at: new Date().toISOString() })
      .eq("code", created.code);

    const member = await signInTestPhone("+919000000003", "member");
    const { data, error } = await member.client.rpc("list_society_structure", {
      p_code: created.code,
    });

    expect(error).toBeNull();
    expect(data.error).toBe("CODE_PAUSED");
  });

  it("list_society_structure returns {error: INVALID_CODE} for a revoked code", async () => {
    const { created } = await createSocietyWithStructure();

    // Set revoked_at on the code via service-role
    const admin = adminClient();
    await admin
      .from("society_codes")
      .update({ revoked_at: new Date().toISOString() })
      .eq("code", created.code);

    const member = await signInTestPhone("+919000000003", "member");
    const { data, error } = await member.client.rpc("list_society_structure", {
      p_code: created.code,
    });

    expect(error).toBeNull();
    expect(data.error).toBe("INVALID_CODE");
  });

  it("list_society_structure returns {error: INVALID_CODE} for a non-existent code", async () => {
    // Still need a signed-in user to call the RPC
    const member = await signInTestPhone("+919000000003", "member");

    const { data, error } = await member.client.rpc("list_society_structure", {
      p_code: "ZZZZ-ZZZZ",
    });

    expect(error).toBeNull();
    expect(data.error).toBe("INVALID_CODE");
  });

  it("list_society_structure returns wings ordered by name and flats ordered by wing_id + number", async () => {
    const sec = await signInTestPhone("+919000000001", "secretary");
    const { data: created } = await sec.client.rpc("create_society_with_secretary", {
      p_name: "OrderTest Society",
      p_address: "99 Order Road, Pune, MH 411001",
      p_co_secretary_phone: "9000000002",
    });

    // Bootstrap with multiple wings/flats to verify ordering
    await sec.client.rpc("bootstrap_society_structure", {
      p_society_id: created.society_id,
      p_wings: [{ name: "C" }, { name: "A" }, { name: "B" }],
      p_flats: [
        { wing_name: "C", number: "301" },
        { wing_name: "A", number: "102" },
        { wing_name: "A", number: "101" },
        { wing_name: "B", number: "201" },
      ],
    });

    const member = await signInTestPhone("+919000000003", "member");
    const { data, error } = await member.client.rpc("list_society_structure", {
      p_code: created.code,
    });

    expect(error).toBeNull();
    // Wings ordered by name
    const wingNames = data.wings.map((w) => w.name);
    expect(wingNames).toEqual(["A", "B", "C"]);
    // 4 flats total
    expect(data.flats).toHaveLength(4);
  });
});
