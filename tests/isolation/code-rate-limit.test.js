// Code Rate-Limit Isolation Tests
// Covers: SETUP-04 — 5+ redemptions in 60s auto-pauses the code
//
// Uses:
//   +919000000001 = Secretary
//   +919000000003 = Member-A (redeems the code after rate-limit threshold)
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

describe("Phase 3 — Code Rate-Limit (SETUP-04)", () => {
  beforeEach(async () => {
    await resetTestState();
  });

  // Helper: create a society + flat for rate-limit testing
  async function setupSociety() {
    const sec = await signInTestPhone("+919000000001", "secretary");
    const { data: created, error } = await sec.client.rpc("create_society_with_secretary", {
      p_name: "RateLimit Society",
      p_address: "1 Rate Limit Street, Test City, MH 400001",
      p_co_secretary_phone: "9000000002",
    });
    if (error) throw new Error(`create_society_with_secretary failed: ${error.message}`);

    const admin = adminClient();
    const { data: wing } = await admin
      .from("wings")
      .insert({ society_id: created.society_id, name: "A" })
      .select()
      .single();
    const { data: flat1 } = await admin
      .from("flats")
      .insert({ society_id: created.society_id, wing_id: wing.id, number: "101" })
      .select()
      .single();
    const { data: flat2 } = await admin
      .from("flats")
      .insert({ society_id: created.society_id, wing_id: wing.id, number: "102" })
      .select()
      .single();

    return { sec, created, wing, flat1, flat2, admin };
  }

  it("SETUP-04: 5 existing redemptions in 60s window → redeem_society_code returns CODE_PAUSED_RATE_LIMIT, society_codes.paused_at is set, audit_log has code.auto_paused", async () => {
    const { created, flat1, flat2, admin } = await setupSociety();

    // Insert 5 code_redemptions rows within the 60s window via service-role
    // (bypasses the RLS/REVOKE because service-role ignores RLS)
    // We need a real user_id — sign in as Member-A to get a user_id
    const memberA = await signInTestPhone("+919000000003", "member");

    const redemptionRows = Array.from({ length: 5 }, () => ({
      code: created.code,
      user_id: memberA.userId,
      society_id: created.society_id,
      redeemed_at: new Date().toISOString(),
    }));
    const { error: insertError } = await admin.from("code_redemptions").insert(redemptionRows);
    expect(insertError).toBeNull();

    // Now call redeem_society_code — the rolling window count is 5, should auto-pause
    const { data: result, error: redeemError } = await memberA.client.rpc(
      "redeem_society_code",
      {
        p_code: created.code,
        p_flat_id: flat2.id,
        p_residency: "owner",
        p_household: "family",
        p_emergency: "9999999999",
      },
    );
    expect(redeemError).toBeNull();
    expect(result.error).toBe("CODE_PAUSED_RATE_LIMIT");

    // society_codes.paused_at must be set
    const { data: codeRow } = await admin
      .from("society_codes")
      .select("paused_at")
      .eq("code", created.code)
      .single();
    expect(codeRow.paused_at).not.toBeNull();

    // audit_log must have code.auto_paused
    const { data: logs } = await admin
      .from("audit_log")
      .select("action, payload")
      .eq("action", "code.auto_paused")
      .eq("society_id", created.society_id);
    expect(logs.length).toBeGreaterThanOrEqual(1);
    expect(logs[0].payload.code).toBe(created.code);
  });

  it("SETUP-04: single redemption with no prior history succeeds (status=active, no pause)", async () => {
    const { created, flat2, admin } = await setupSociety();

    const memberA = await signInTestPhone("+919000000003", "member");

    const { data: result, error } = await memberA.client.rpc("redeem_society_code", {
      p_code: created.code,
      p_flat_id: flat2.id,
      p_residency: "owner",
      p_household: "family",
      p_emergency: "9999999999",
    });

    expect(error).toBeNull();
    // Should succeed — no rate-limit error
    expect(result.error).toBeUndefined();
    expect(result.status).toBe("active");

    // Code should NOT be paused
    const { data: codeRow } = await admin
      .from("society_codes")
      .select("paused_at")
      .eq("code", created.code)
      .single();
    expect(codeRow.paused_at).toBeNull();
  });
});
