// Society structure lookup by code — isolation tests.
//
// Migration 054 revoked list_society_structure from clients; the pre-membership
// flat picker now uses onboard_flats_for_code(p_code), which returns
//   { society_id, society_name, wings: [{ id, name, flats: [{ id, number, taken }] }] }
// or { error } for INVALID_CODE / CODE_PAUSED / SOCIETY_BLOCKED.
//   - Valid code → wings + nested flats
//   - Paused code → {error: 'CODE_PAUSED'}
//   - Revoked / non-existent code → {error: 'INVALID_CODE'}
//   - list_society_structure itself is no longer callable by clients
//
// Uses:
//   +919000000001 = Secretary (society created via service role)
//   +919000000003 = Member (looks the code up before joining)
//
// JavaScript only — no TypeScript, no import type.

import { afterAll, beforeEach, describe, expect, it } from "vitest";
import {
  adminClient,
  cleanupTestUsers,
  createSocietyAsSecretary,
  resetTestState,
  signInTestPhone,
} from "./helpers/phase3.js";

afterAll(async () => {
  await resetTestState();
  await cleanupTestUsers();
});

describe("Phase 3 — onboard_flats_for_code (code-status gating, 054 replacement for list_society_structure)", () => {
  beforeEach(async () => {
    await resetTestState();
  });

  async function createSocietyWithStructure(
    wings = [{ name: "A" }],
    flats = [{ wing_name: "A", number: "101" }],
  ) {
    const sec = await signInTestPhone("+919000000001", "secretary");
    const created = await createSocietyAsSecretary(sec.userId, { name: "ListStruct Society" });
    const { error } = await sec.client.rpc("bootstrap_society_structure", {
      p_society_id: created.societyId,
      p_wings: wings,
      p_flats: flats,
    });
    if (error) throw new Error(`bootstrap_society_structure failed: ${error.message}`);
    return { sec, created };
  }

  it("returns {society_id, society_name, wings[].flats[]} for a valid code", async () => {
    const { created } = await createSocietyWithStructure();
    const member = await signInTestPhone("+919000000003", "member");

    const { data, error } = await member.client.rpc("onboard_flats_for_code", {
      p_code: created.code,
    });

    expect(error).toBeNull();
    expect(data.society_id).toBe(created.societyId);
    expect(data.society_name).toBe("ListStruct Society");
    expect(data.wings).toHaveLength(1);
    expect(data.wings[0].name).toBe("A");
    expect(data.wings[0].flats).toHaveLength(1);
    expect(data.wings[0].flats[0].number).toBe("101");
    expect(data.wings[0].flats[0].taken).toBe(false);
  });

  it("returns {error: CODE_PAUSED} for a paused code", async () => {
    const { created } = await createSocietyWithStructure();
    const admin = adminClient();
    await admin
      .from("society_codes")
      .update({ paused_at: new Date().toISOString() })
      .eq("code", created.code);

    const member = await signInTestPhone("+919000000003", "member");
    const { data, error } = await member.client.rpc("onboard_flats_for_code", {
      p_code: created.code,
    });

    expect(error).toBeNull();
    expect(data.error).toBe("CODE_PAUSED");
  });

  it("returns {error: INVALID_CODE} for a revoked code", async () => {
    const { created } = await createSocietyWithStructure();
    const admin = adminClient();
    await admin
      .from("society_codes")
      .update({ revoked_at: new Date().toISOString() })
      .eq("code", created.code);

    const member = await signInTestPhone("+919000000003", "member");
    const { data, error } = await member.client.rpc("onboard_flats_for_code", {
      p_code: created.code,
    });

    expect(error).toBeNull();
    expect(data.error).toBe("INVALID_CODE");
  });

  it("returns {error: INVALID_CODE} for a non-existent code", async () => {
    const member = await signInTestPhone("+919000000003", "member");
    const { data, error } = await member.client.rpc("onboard_flats_for_code", {
      p_code: "ZZZZ-ZZZZ",
    });

    expect(error).toBeNull();
    expect(data.error).toBe("INVALID_CODE");
  });

  it("returns wings ordered by name with their flats nested", async () => {
    const { created } = await createSocietyWithStructure(
      [{ name: "C" }, { name: "A" }, { name: "B" }],
      [
        { wing_name: "C", number: "301" },
        { wing_name: "A", number: "102" },
        { wing_name: "A", number: "101" },
        { wing_name: "B", number: "201" },
      ],
    );

    const member = await signInTestPhone("+919000000003", "member");
    const { data, error } = await member.client.rpc("onboard_flats_for_code", {
      p_code: created.code,
    });

    expect(error).toBeNull();
    expect(data.wings.map((w) => w.name)).toEqual(["A", "B", "C"]);
    expect(data.wings[0].flats.map((f) => f.number)).toEqual(["101", "102"]);
    expect(data.wings.flatMap((w) => w.flats)).toHaveLength(4);
  });

  it("list_society_structure is revoked for authenticated clients (054)", async () => {
    const { created } = await createSocietyWithStructure();
    const member = await signInTestPhone("+919000000003", "member");
    const { error } = await member.client.rpc("list_society_structure", { p_code: created.code });
    expect(error).not.toBeNull();
  });
});
