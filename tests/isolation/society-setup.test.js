// Society Setup Isolation Tests
// Covers: SETUP-01, SETUP-02, SETUP-03, SETUP-05, SETUP-08, SETUP-10
//
// Migration 054: society creation is staff-only (create_society_with_secretary and
// finalize_society_setup are revoked from clients). Each test creates the society
// through the service role (helpers/phase3.js createSocietyAsSecretary — the state
// staff onboarding leaves it in) and then exercises the client RPCs that remain.
//
// Uses:
//   +919000000001 = Secretary
//   +919000000002 = Co-Secretary / Member-A
//
// JavaScript only — no TypeScript, no import type.

import { afterAll, beforeEach, describe, expect, it } from "vitest";
import {
  adminClient,
  cleanupTestUsers,
  createSocietyAsSecretary,
  refreshSession,
  resetTestState,
  signInTestPhone,
} from "./helpers/phase3.js";

const CODE_PATTERN = /^[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}$/;

afterAll(async () => {
  await resetTestState();
  await cleanupTestUsers();
});

/**
 * Society + wing A + flats 101/102, with the secretary attached to flat 101
 * (what finalize_society_setup used to do; now done via the service role).
 */
async function setupSocietyWithSecretaryFlat(sec, name) {
  const admin = adminClient();
  const created = await createSocietyAsSecretary(sec.userId, { name });
  const { data: wing, error: wErr } = await admin
    .from("wings")
    .insert({ society_id: created.societyId, name: "A" })
    .select()
    .single();
  if (wErr) throw new Error(`wing insert: ${wErr.message}`);
  const { data: flats, error: fErr } = await admin
    .from("flats")
    .insert([
      { society_id: created.societyId, wing_id: wing.id, number: "101" },
      { society_id: created.societyId, wing_id: wing.id, number: "102" },
    ])
    .select()
    .order("number");
  if (fErr) throw new Error(`flat insert: ${fErr.message}`);
  const [secFlat, otherFlat] = flats;
  const { error: mErr } = await admin
    .from("society_memberships")
    .update({ flat_id: secFlat.id })
    .eq("id", created.membershipId);
  if (mErr) throw new Error(`attach secretary flat: ${mErr.message}`);
  return { admin, created, wing, secFlat, otherFlat };
}

async function addCoSecretary(admin, societyId, userId, flatId) {
  const { error } = await admin.from("society_memberships").insert({
    society_id: societyId,
    user_id: userId,
    flat_id: flatId,
    role: "co_secretary",
    residency: "owner",
    household: "family",
    status: "active",
  });
  if (error) throw new Error(`co_secretary insert: ${error.message}`);
}

describe("Phase 3 — Society Setup (SETUP-01 through SETUP-10)", () => {
  beforeEach(async () => {
    await resetTestState();
  });

  it("SETUP-01 (054): create_society_with_secretary is revoked for authenticated clients", async () => {
    const sec = await signInTestPhone("+919000000001", "secretary");
    const { error } = await sec.client.rpc("create_society_with_secretary", {
      p_name: "Test Society Alpha",
      p_address: "123 Main Street, Test City, MH 400001",
      p_co_secretary_phone: "9000000002",
    });
    expect(error).not.toBeNull();

    const admin = adminClient();
    const { data: societies } = await admin
      .from("societies")
      .select("id")
      .eq("name", "Test Society Alpha");
    expect(societies ?? []).toHaveLength(0);
  });

  it("SETUP-02: rotate_society_code returns a code matching /^[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}$/ (no 0/O/I/1/L)", async () => {
    const sec = await signInTestPhone("+919000000001", "secretary");
    const { created } = await setupSocietyWithSecretaryFlat(sec, "Code Format Society");
    const refreshed = await refreshSession(sec.session.refresh_token);

    const { data: rotated, error } = await refreshed.client.rpc("rotate_society_code", {
      p_society_id: created.societyId,
    });
    expect(error).toBeNull();
    expect(rotated.code).toMatch(CODE_PATTERN);
    expect(rotated.code).not.toMatch(/[0OI1L]/);
  });

  it("SETUP-03: rotate_society_code sets revoked_at on old code; new code is active with revoked_at=null", async () => {
    const sec = await signInTestPhone("+919000000001", "secretary");
    const { admin, created } = await setupSocietyWithSecretaryFlat(sec, "Rotate Society");
    const refreshed = await refreshSession(sec.session.refresh_token);

    const oldCode = created.code;
    const { data: rotated, error: rotateError } = await refreshed.client.rpc(
      "rotate_society_code",
      { p_society_id: created.societyId },
    );
    expect(rotateError).toBeNull();
    expect(rotated.code).toMatch(CODE_PATTERN);
    expect(rotated.code).not.toBe(oldCode);

    const { data: oldRow } = await admin
      .from("society_codes")
      .select("revoked_at")
      .eq("code", oldCode)
      .single();
    expect(oldRow.revoked_at).not.toBeNull();

    const { data: newRow } = await admin
      .from("society_codes")
      .select("revoked_at, paused_at")
      .eq("code", rotated.code)
      .single();
    expect(newRow.revoked_at).toBeNull();
    expect(newRow.paused_at).toBeNull();
  });

  it("SETUP-05 (054): finalize_society_setup is revoked; a secretary cannot INSERT wings/flats directly", async () => {
    const sec = await signInTestPhone("+919000000001", "secretary");
    const { created, secFlat, wing } = await setupSocietyWithSecretaryFlat(sec, "Finalize Society");
    const refreshed = await refreshSession(sec.session.refresh_token);

    const { error: finalizeError } = await refreshed.client.rpc("finalize_society_setup", {
      p_society_id: created.societyId,
      p_flat_id: secFlat.id,
    });
    expect(finalizeError).not.toBeNull();

    // Structure writes go through bootstrap_society_structure / secretary_add_wing only.
    const { error: wingError } = await refreshed.client
      .from("wings")
      .insert({ society_id: created.societyId, name: "Direct" });
    expect(wingError).not.toBeNull();
    const { error: flatError } = await refreshed.client
      .from("flats")
      .insert({ society_id: created.societyId, wing_id: wing.id, number: "999" });
    expect(flatError).not.toBeNull();
  });

  it("SETUP-08: co_secretary has same rotate_society_code powers as Secretary", async () => {
    const sec = await signInTestPhone("+919000000001", "secretary");
    const { admin, created, otherFlat } = await setupSocietyWithSecretaryFlat(
      sec,
      "CoSec Powers Society",
    );

    const memberA = await signInTestPhone("+919000000002", "member");
    await addCoSecretary(admin, created.societyId, memberA.userId, otherFlat.id);
    const refreshedCoSec = await refreshSession(memberA.session.refresh_token);

    const { data: rotated, error: rotateError } = await refreshedCoSec.client.rpc(
      "rotate_society_code",
      { p_society_id: created.societyId },
    );
    expect(rotateError).toBeNull();
    expect(rotated.code).toMatch(CODE_PATTERN);
  });

  it("SETUP-10: transfer_secretary_role demotes caller to member, promotes target to secretary; non-secretary calling raises error", async () => {
    const sec = await signInTestPhone("+919000000001", "secretary");
    const { admin, created, otherFlat } = await setupSocietyWithSecretaryFlat(
      sec,
      "Transfer Society",
    );

    const memberA = await signInTestPhone("+919000000002", "member");
    await addCoSecretary(admin, created.societyId, memberA.userId, otherFlat.id);
    const refreshedSec = await refreshSession(sec.session.refresh_token);

    const { error: transferError } = await refreshedSec.client.rpc("transfer_secretary_role", {
      p_new_secretary_user_id: memberA.userId,
    });
    expect(transferError).toBeNull();

    const { data: oldSecMem } = await admin
      .from("society_memberships")
      .select("role")
      .eq("user_id", sec.userId)
      .eq("society_id", created.societyId)
      .eq("status", "active")
      .single();
    expect(oldSecMem.role).toBe("member");

    const { data: newSecMem } = await admin
      .from("society_memberships")
      .select("role")
      .eq("user_id", memberA.userId)
      .eq("society_id", created.societyId)
      .eq("status", "active")
      .single();
    expect(newSecMem.role).toBe("secretary");

    const { data: logs } = await admin
      .from("audit_log")
      .select("action, payload")
      .eq("action", "role.transferred")
      .eq("society_id", created.societyId);
    expect(logs).toHaveLength(1);

    // 054: the role check is LIVE — the demoted secretary's stale JWT no longer works.
    const { error: nonSecError } = await refreshedSec.client.rpc("transfer_secretary_role", {
      p_new_secretary_user_id: memberA.userId,
    });
    expect(nonSecError?.message ?? "").toMatch(/ONLY_SECRETARY_CAN_TRANSFER/);
  });
});
