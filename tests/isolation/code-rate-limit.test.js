// Code attempt throttle — isolation tests.
//
// Migration 054 revoked redeem_society_code (and with it the old 60s
// "5 redemptions → CODE_PAUSED_RATE_LIMIT" path). Joining is onboard_resident,
// throttled per user: after 5 failed code attempts (INVALID_CODE / CODE_PAUSED)
// within 15 minutes, onboard_resident AND onboard_flats_for_code raise
// TOO_MANY_CODE_ATTEMPTS — even for a valid code — so codes can't be brute-forced.
//
// Uses:
//   +919000000001 = Secretary
//   +919000000003 = Member-A (guesses codes, then joins)
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

const FAILED_ATTEMPTS_ALLOWED = 5;

afterAll(async () => {
  await resetTestState();
  await cleanupTestUsers();
});

describe("Phase 3 — code attempt throttle (054 onboard_resident / onboard_flats_for_code)", () => {
  beforeEach(async () => {
    await resetTestState();
  });

  async function setupSociety() {
    const sec = await signInTestPhone("+919000000001", "secretary");
    const created = await createSocietyAsSecretary(sec.userId, { name: "RateLimit Society" });

    const admin = adminClient();
    const { data: wing, error: wErr } = await admin
      .from("wings")
      .insert({ society_id: created.societyId, name: "A" })
      .select()
      .single();
    if (wErr) throw new Error(`wing insert: ${wErr.message}`);
    const { data: flat, error: fErr } = await admin
      .from("flats")
      .insert({ society_id: created.societyId, wing_id: wing.id, number: "101" })
      .select()
      .single();
    if (fErr) throw new Error(`flat insert: ${fErr.message}`);

    return { sec, created, flat, admin };
  }

  function onboard(client, code, flatId) {
    return client.rpc("onboard_resident", {
      p_code: code,
      p_flat_id: flatId,
      p_full_name: "Member A",
      p_residency: "owner",
      p_alt_phone: null,
      p_family: [],
    });
  }

  it("a single valid onboard_resident succeeds (status=active)", async () => {
    const { created, flat, admin } = await setupSociety();
    const memberA = await signInTestPhone("+919000000003", "member");

    const { data, error } = await onboard(memberA.client, created.code, flat.id);
    expect(error).toBeNull();
    expect(data.error).toBeUndefined();
    expect(data.status).toBe("active");

    const { data: mem } = await admin
      .from("society_memberships")
      .select("status, flat_id")
      .eq("user_id", memberA.userId)
      .eq("society_id", created.societyId)
      .single();
    expect(mem).toMatchObject({ status: "active", flat_id: flat.id });
  });

  it("after 5 failed codes, even a valid code raises TOO_MANY_CODE_ATTEMPTS", async () => {
    const { created, flat } = await setupSociety();
    const memberA = await signInTestPhone("+919000000003", "member");

    for (let i = 0; i < FAILED_ATTEMPTS_ALLOWED; i++) {
      const { data, error } = await memberA.client.rpc("onboard_flats_for_code", {
        p_code: "ZZZZ-ZZZZ",
      });
      expect(error).toBeNull();
      expect(data.error).toBe("INVALID_CODE");
    }

    const lookup = await memberA.client.rpc("onboard_flats_for_code", { p_code: created.code });
    expect(lookup.error?.message ?? "").toMatch(/TOO_MANY_CODE_ATTEMPTS/);

    const join = await onboard(memberA.client, created.code, flat.id);
    expect(join.error?.message ?? "").toMatch(/TOO_MANY_CODE_ATTEMPTS/);
  });

  it("redeem_society_code is revoked for authenticated clients (054)", async () => {
    const { created, flat } = await setupSociety();
    const memberA = await signInTestPhone("+919000000003", "member");
    const { error } = await memberA.client.rpc("redeem_society_code", {
      p_code: created.code,
      p_flat_id: flat.id,
      p_residency: "owner",
      p_household: "family",
      p_emergency: null,
    });
    expect(error).not.toBeNull();
  });
});
