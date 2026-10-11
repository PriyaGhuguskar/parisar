// Member Onboarding Isolation Tests
// Covers: ONBD-01, ONBD-04, ONBD-05, ONBD-06, ONBD-07
//         + pending_review resolution (054 approve/reject_pending_membership)
//         + pending_review phone reveal (ONBD-06 pending_review variant)
//
// Migration 054 revoked validate_society_code / redeem_society_code /
// create_society_with_secretary / finalize_society_setup from clients. Joining is
// onboard_resident (code + flat + name + family in one call, returns
// {society_id, status}); the code preview is onboard_flats_for_code. The society is
// created through the service role (helpers/phase3.js createSocietyAsSecretary).
//
// Uses:
//   +919000000001 = Secretary
//   +919000000003 = Member-A (first to claim a flat)
//   +919000000004 = Member-B (second to claim same flat → pending_review)
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

afterAll(async () => {
  await resetTestState();
  await cleanupTestUsers();
});

describe("Phase 3 — Member Onboarding (ONBD-01, 04, 05, 06, 07 + 054 review queue)", () => {
  beforeEach(async () => {
    await resetTestState();
  });

  // Society with wing A, flats 101 (secretary's) and 102 (free).
  async function createTestSociety() {
    const sec = await signInTestPhone("+919000000001", "secretary");
    const admin = adminClient();
    const created = await createSocietyAsSecretary(sec.userId, { name: "Onboard Test Society" });

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
    const [flat1, flat2] = flats;

    const { error: mErr } = await admin
      .from("society_memberships")
      .update({ flat_id: flat1.id })
      .eq("id", created.membershipId);
    if (mErr) throw new Error(`attach secretary flat: ${mErr.message}`);

    return { sec, created, wing, flat1, flat2, admin };
  }

  async function join(member, code, flatId, { residency = "owner", family = [] } = {}) {
    const { data, error } = await member.client.rpc("onboard_resident", {
      p_code: code,
      p_flat_id: flatId,
      p_full_name: `Member ${member.userId.slice(0, 4)}`,
      p_residency: residency,
      p_alt_phone: null,
      p_family: family,
    });
    if (error) throw new Error(`onboard_resident: ${error.message}`);
    return data;
  }

  async function membershipOf(admin, userId, societyId) {
    const { data, error } = await admin
      .from("society_memberships")
      .select("id, role, status, flat_id")
      .eq("user_id", userId)
      .eq("society_id", societyId)
      .single();
    if (error) throw new Error(`membership lookup: ${error.message}`);
    return data;
  }

  it("ONBD-01: onboard_flats_for_code returns INVALID_CODE for a bad code; {society_id, society_name} for a valid one", async () => {
    const { created } = await createTestSociety();
    const member = await signInTestPhone("+919000000003", "member");

    const { data: valid, error: validError } = await member.client.rpc("onboard_flats_for_code", {
      p_code: created.code,
    });
    expect(validError).toBeNull();
    expect(valid.society_id).toBe(created.societyId);
    expect(valid.society_name).toBe("Onboard Test Society");

    const { data: invalid, error: invalidError } = await member.client.rpc(
      "onboard_flats_for_code",
      { p_code: "XXXX-XXXX" },
    );
    expect(invalidError).toBeNull();
    expect(invalid.error).toBe("INVALID_CODE");

    // The legacy RPC is gone for clients.
    const { error: legacyError } = await member.client.rpc("validate_society_code", {
      p_code: created.code,
    });
    expect(legacyError).not.toBeNull();
  });

  it("ONBD-04: onboard_resident with valid code + fresh flat → status=active, role=member, family stored", async () => {
    const { created, flat2, admin } = await createTestSociety();

    const memberA = await signInTestPhone("+919000000003", "member");
    const result = await join(memberA, created.code, flat2.id, {
      family: [{ name: "Asha", relation: "Mother", is_resident: true }],
    });
    expect(result.status).toBe("active");
    expect(result.society_id).toBe(created.societyId);

    const mem = await membershipOf(admin, memberA.userId, created.societyId);
    expect(mem).toMatchObject({ role: "member", status: "active", flat_id: flat2.id });

    const { data: fam } = await admin
      .from("family_members")
      .select("full_name")
      .eq("membership_id", mem.id);
    expect(fam.map((f) => f.full_name)).toEqual(["Asha"]);
  });

  it("ONBD-05: second member claiming same flat → status=pending_review", async () => {
    const { created, flat2, admin } = await createTestSociety();

    const memberA = await signInTestPhone("+919000000003", "member");
    await join(memberA, created.code, flat2.id);

    const memberB = await signInTestPhone("+919000000004", "member");
    const result = await join(memberB, created.code, flat2.id, { residency: "tenant" });
    expect(result.status).toBe("pending_review");

    const mem = await membershipOf(admin, memberB.userId, created.societyId);
    expect(mem.status).toBe("pending_review");
  });

  it("054: approve_pending_membership approves one claimant; reject_pending_membership rejects", async () => {
    const { sec, created, flat2, admin } = await createTestSociety();

    const memberA = await signInTestPhone("+919000000003", "member");
    await join(memberA, created.code, flat2.id);
    const memberB = await signInTestPhone("+919000000004", "member");
    await join(memberB, created.code, flat2.id, { residency: "tenant" });
    const pendingB = await membershipOf(admin, memberB.userId, created.societyId);

    // A plain member cannot resolve the queue.
    const { error: memberError } = await memberA.client.rpc("approve_pending_membership", {
      p_membership_id: pendingB.id,
    });
    expect(memberError?.message ?? "").toMatch(/INSUFFICIENT_PRIVILEGES/);

    const refreshedSec = await refreshSession(sec.session.refresh_token);
    const { data: approved, error } = await refreshedSec.client.rpc("approve_pending_membership", {
      p_membership_id: pendingB.id,
    });
    expect(error).toBeNull();
    expect(approved.approved).toBe(pendingB.id);
    expect((await membershipOf(admin, memberB.userId, created.societyId)).status).toBe("active");

    // Resolving again → NOT_PENDING.
    const { error: againError } = await refreshedSec.client.rpc("reject_pending_membership", {
      p_membership_id: pendingB.id,
    });
    expect(againError?.message ?? "").toMatch(/NOT_PENDING/);
  });

  it("ONBD-06 (active member reveal): reveal_phone returns phone for active member + writes audit_log", async () => {
    const { sec, created, flat2, admin } = await createTestSociety();

    const memberB = await signInTestPhone("+919000000004", "member");
    await join(memberB, created.code, flat2.id);

    const refreshedSec = await refreshSession(sec.session.refresh_token);
    const { data: phone, error } = await refreshedSec.client.rpc("reveal_phone", {
      p_target_user_id: memberB.userId,
    });
    expect(error).toBeNull();
    expect(phone).toMatch(/^\+91\d{10}$/);

    const { data: logs } = await admin
      .from("audit_log")
      .select("action, target_id")
      .eq("action", "phone.revealed")
      .eq("target_id", memberB.userId);
    expect(logs.length).toBeGreaterThanOrEqual(1);
  });

  it("ONBD-06 (pending_review reveal): reveal_phone returns phone for a pending_review member", async () => {
    const { sec, created, flat2, admin } = await createTestSociety();

    const memberA = await signInTestPhone("+919000000003", "member");
    await join(memberA, created.code, flat2.id);
    const memberB = await signInTestPhone("+919000000004", "member");
    await join(memberB, created.code, flat2.id, { residency: "tenant" });
    expect((await membershipOf(admin, memberB.userId, created.societyId)).status).toBe(
      "pending_review",
    );

    const refreshedSec = await refreshSession(sec.session.refresh_token);
    const { data: phone, error } = await refreshedSec.client.rpc("reveal_phone", {
      p_target_user_id: memberB.userId,
    });
    expect(error).toBeNull();
    expect(phone).toMatch(/^\+91\d{10}$/);
  });

  it("ONBD-07: remove_member → status=deleted, profile=[REDACTED], family_members deleted, audit_log has member.removed", async () => {
    const { sec, created, flat2, admin } = await createTestSociety();

    const memberB = await signInTestPhone("+919000000004", "member");
    await join(memberB, created.code, flat2.id, {
      family: [{ name: "Family Person", phone: "9111111111" }],
    });
    const mem = await membershipOf(admin, memberB.userId, created.societyId);

    const refreshedSec = await refreshSession(sec.session.refresh_token);
    const { error: removeError } = await refreshedSec.client.rpc("remove_member", {
      p_membership_id: mem.id,
    });
    expect(removeError).toBeNull();

    const { data: after } = await admin
      .from("society_memberships")
      .select("status")
      .eq("id", mem.id)
      .single();
    expect(after.status).toBe("deleted");

    const { data: fam } = await admin
      .from("family_members")
      .select("id")
      .eq("membership_id", mem.id);
    expect(fam).toHaveLength(0);

    const { data: profile } = await admin
      .from("profiles")
      .select("full_name, phone")
      .eq("user_id", memberB.userId)
      .single();
    expect(profile.full_name).toBe("[REDACTED]");
    expect(profile.phone).toMatch(/^REDACTED-[a-f0-9]{64}$/);

    const { data: logs } = await admin
      .from("audit_log")
      .select("action")
      .eq("action", "member.removed")
      .eq("society_id", created.societyId);
    expect(logs.length).toBeGreaterThanOrEqual(1);

    // 054: a removed member cannot rejoin themselves with the code.
    const { data: rejoin, error: rejoinError } = await memberB.client.rpc("onboard_resident", {
      p_code: created.code,
      p_flat_id: flat2.id,
      p_full_name: "Back Again",
      p_residency: "owner",
      p_alt_phone: null,
      p_family: [],
    });
    expect(rejoinError).toBeNull();
    expect(rejoin.error).toBe("MEMBERSHIP_REMOVED");
  });

  it("ONBD-07: non-Secretary calling remove_member raises INSUFFICIENT_PRIVILEGES", async () => {
    const { created, flat2, admin } = await createTestSociety();

    const memberA = await signInTestPhone("+919000000003", "member");
    await join(memberA, created.code, flat2.id);
    const mem = await membershipOf(admin, memberA.userId, created.societyId);
    const refreshedMemberA = await refreshSession(memberA.session.refresh_token);

    const { error } = await refreshedMemberA.client.rpc("remove_member", {
      p_membership_id: mem.id,
    });
    expect(error).not.toBeNull();
    expect(error.message ?? "").toMatch(/INSUFFICIENT_PRIVILEGES/);
  });
});
