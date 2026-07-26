// Member Onboarding Isolation Tests
// Covers: ONBD-01, ONBD-04, ONBD-05, ONBD-06, ONBD-07
//         + co-secretary auto-elevation (ONBD-04 co-sec variant)
//         + pending_review phone reveal (ONBD-06 pending_review variant)
//
// Uses:
//   +919000000001 = Secretary
//   +919000000002 = Co-Secretary candidate (phone matches society.co_secretary_phone='9000000002')
//   +919000000003 = Member-A (first to claim a flat)
//   +919000000004 = Member-B (second to claim same flat → pending_review)
//
// JavaScript only — no TypeScript, no import type.

import { afterAll, beforeEach, describe, expect, it } from "vitest";
import {
  adminClient,
  cleanupTestUsers,
  refreshSession,
  resetTestState,
  signInTestPhone,
} from "./helpers/phase3.js";

afterAll(async () => {
  await resetTestState();
  await cleanupTestUsers();
});

describe("Phase 3 — Member Onboarding (ONBD-01, 04, 05, 06, 07 + co-sec auto-elevation + pending_review reveal)", () => {
  beforeEach(async () => {
    await resetTestState();
  });

  // -----------------------------------------------------------------------
  // Helper: create a standard test society with Secretary + 2 flats
  // -----------------------------------------------------------------------
  async function createTestSociety() {
    const sec = await signInTestPhone("+919000000001", "secretary");
    const { data: created, error } = await sec.client.rpc("create_society_with_secretary", {
      p_name: "Onboard Test Society",
      p_address: "42 Onboard Lane, Mumbai, MH 400001",
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

    // Finalize Secretary's membership
    const { error: finalizeError } = await sec.client.rpc("finalize_society_setup", {
      p_society_id: created.society_id,
      p_flat_id: flat1.id,
    });
    if (finalizeError) throw new Error(`finalize_society_setup failed: ${finalizeError.message}`);

    return { sec, created, wing, flat1, flat2, admin };
  }

  it("ONBD-01: validate_society_code returns INVALID_CODE for bad code; returns {society_id, name} for valid code", async () => {
    const { sec, created } = await createTestSociety();

    // Valid code
    const { data: validResult, error: validError } = await sec.client.rpc(
      "validate_society_code",
      { p_code: created.code },
    );
    expect(validError).toBeNull();
    expect(validResult.society_id).toBe(created.society_id);
    expect(validResult.name).toBe("Onboard Test Society");
    expect(typeof validResult.member_count).toBe("number");

    // Invalid code
    const { data: invalidResult, error: invalidError } = await sec.client.rpc(
      "validate_society_code",
      { p_code: "XXXX-XXXX" },
    );
    expect(invalidError).toBeNull();
    expect(invalidResult.error).toBe("INVALID_CODE");
  });

  it("ONBD-04: redeem_society_code with valid code + fresh flat → status=active, role=member, auto_elevated=false", async () => {
    const { created, flat2, admin } = await createTestSociety();

    const memberA = await signInTestPhone("+919000000003", "member");
    const { data: joinResult, error } = await memberA.client.rpc("redeem_society_code", {
      p_code: created.code,
      p_flat_id: flat2.id,
      p_residency: "owner",
      p_household: "family",
      p_emergency: "9999999999",
    });

    expect(error).toBeNull();
    expect(joinResult.status).toBe("active");
    expect(joinResult.role).toBe("member");
    expect(joinResult.auto_elevated_to_co_secretary).toBe(false);
    expect(joinResult.duplicate).toBe(false);

    // Assert membership row exists
    const { data: mem } = await admin
      .from("society_memberships")
      .select("role, status")
      .eq("id", joinResult.membership_id)
      .single();
    expect(mem.role).toBe("member");
    expect(mem.status).toBe("active");
  });

  it("ONBD-04 (auto-elevation): redeem_society_code elevates role to co_secretary when phone matches society.co_secretary_phone", async () => {
    const { created, flat2, admin } = await createTestSociety();

    // +919000000002 was set as co_secretary_phone during create_society_with_secretary
    const coSec = await signInTestPhone("+919000000002", "member");
    const { data: joinResult, error } = await coSec.client.rpc("redeem_society_code", {
      p_code: created.code,
      p_flat_id: flat2.id,
      p_residency: "owner",
      p_household: "family",
      p_emergency: "9999999999",
    });

    expect(error).toBeNull();
    expect(joinResult.auto_elevated_to_co_secretary).toBe(true);
    expect(joinResult.role).toBe("co_secretary");

    // Assert DB membership row has role=co_secretary
    const { data: mem } = await admin
      .from("society_memberships")
      .select("role")
      .eq("id", joinResult.membership_id)
      .single();
    expect(mem.role).toBe("co_secretary");

    // Assert audit_log payload includes auto_elevated_to_co_secretary: true
    const { data: logs } = await admin
      .from("audit_log")
      .select("payload")
      .eq("action", "member.joined")
      .eq("society_id", created.society_id);
    const joinLog = logs.find((l) => l.payload?.auto_elevated_to_co_secretary === true);
    expect(joinLog).toBeDefined();
  });

  it("ONBD-05: second member claiming same flat → status=pending_review, duplicate=true", async () => {
    const { created, flat2, admin } = await createTestSociety();

    // Member-A claims flat2 first (active)
    const memberA = await signInTestPhone("+919000000003", "member");
    await memberA.client.rpc("redeem_society_code", {
      p_code: created.code,
      p_flat_id: flat2.id,
      p_residency: "owner",
      p_household: "family",
      p_emergency: "9999999999",
    });

    // Member-B claims same flat → pending_review
    const memberB = await signInTestPhone("+919000000004", "member");
    const { data: joinResult, error } = await memberB.client.rpc("redeem_society_code", {
      p_code: created.code,
      p_flat_id: flat2.id,
      p_residency: "tenant",
      p_household: "bachelor",
      p_emergency: "8888888888",
    });

    expect(error).toBeNull();
    expect(joinResult.status).toBe("pending_review");
    expect(joinResult.duplicate).toBe(true);

    // Assert membership row in DB
    const { data: mem } = await admin
      .from("society_memberships")
      .select("status")
      .eq("id", joinResult.membership_id)
      .single();
    expect(mem.status).toBe("pending_review");
  });

  it("ONBD-06 (active member reveal): reveal_phone returns phone for active member + writes audit_log", async () => {
    const { sec, created, flat2, admin } = await createTestSociety();

    // Member-B joins flat2 (active)
    const memberB = await signInTestPhone("+919000000004", "member");
    await memberB.client.rpc("redeem_society_code", {
      p_code: created.code,
      p_flat_id: flat2.id,
      p_residency: "owner",
      p_household: "family",
      p_emergency: "9999999999",
    });

    // Refresh Secretary's session so JWT has society_id + role
    const refreshedSec = await refreshSession(sec.session.refresh_token);

    const { data: phone, error } = await refreshedSec.client.rpc("reveal_phone", {
      p_target_user_id: memberB.userId,
    });

    expect(error).toBeNull();
    expect(phone).toMatch(/^\+91\d{10}$/);

    // Assert audit_log row written
    const { data: logs } = await admin
      .from("audit_log")
      .select("action, target_id")
      .eq("action", "phone.revealed")
      .eq("target_id", memberB.userId);
    expect(logs.length).toBeGreaterThanOrEqual(1);
  });

  it("ONBD-06 (pending_review reveal): reveal_phone returns phone for pending_review member so Secretary can contact reviewees", async () => {
    const { sec, created, flat2, admin } = await createTestSociety();

    // Member-A joins flat2 (active)
    const memberA = await signInTestPhone("+919000000003", "member");
    await memberA.client.rpc("redeem_society_code", {
      p_code: created.code,
      p_flat_id: flat2.id,
      p_residency: "owner",
      p_household: "family",
      p_emergency: "9999999999",
    });

    // Member-B joins same flat → pending_review
    const memberB = await signInTestPhone("+919000000004", "member");
    await memberB.client.rpc("redeem_society_code", {
      p_code: created.code,
      p_flat_id: flat2.id,
      p_residency: "tenant",
      p_household: "bachelor",
      p_emergency: "8888888888",
    });

    // Confirm Member-B is pending_review
    const { data: pendingMem } = await admin
      .from("society_memberships")
      .select("status")
      .eq("user_id", memberB.userId)
      .eq("society_id", created.society_id)
      .single();
    expect(pendingMem.status).toBe("pending_review");

    // Refresh Secretary session so JWT has society claims
    const refreshedSec = await refreshSession(sec.session.refresh_token);

    // pending_review reveal test: Secretary reveals pending member's phone
    const { data: phone, error } = await refreshedSec.client.rpc("reveal_phone", {
      p_target_user_id: memberB.userId,
    });

    expect(error).toBeNull();
    expect(phone).toMatch(/^\+91\d{10}$/);

    // Audit log must record the reveal
    const { data: logs } = await admin
      .from("audit_log")
      .select("action, target_id")
      .eq("action", "phone.revealed")
      .eq("target_id", memberB.userId);
    expect(logs.length).toBeGreaterThanOrEqual(1);
  });

  it("ONBD-07: remove_member → status=deleted, profile=[REDACTED], family_members deleted, audit_log has member.removed", async () => {
    const { sec, created, flat2, admin } = await createTestSociety();

    // Member-B joins
    const memberB = await signInTestPhone("+919000000004", "member");
    const { data: joinResult } = await memberB.client.rpc("redeem_society_code", {
      p_code: created.code,
      p_flat_id: flat2.id,
      p_residency: "owner",
      p_household: "family",
      p_emergency: "9999999999",
    });

    // Insert a family member for Member-B
    await admin.from("family_members").insert({
      society_id: created.society_id,
      membership_id: joinResult.membership_id,
      full_name: "Family Person",
      phone: "+919111111111",
    });

    // Refresh Secretary session so JWT has society claims
    const refreshedSec = await refreshSession(sec.session.refresh_token);

    const { error: removeError } = await refreshedSec.client.rpc("remove_member", {
      p_membership_id: joinResult.membership_id,
    });
    expect(removeError).toBeNull();

    // Membership status → deleted
    const { data: mem } = await admin
      .from("society_memberships")
      .select("status")
      .eq("id", joinResult.membership_id)
      .single();
    expect(mem.status).toBe("deleted");

    // Family members deleted
    const { data: fam } = await admin
      .from("family_members")
      .select("id")
      .eq("membership_id", joinResult.membership_id);
    expect(fam).toHaveLength(0);

    // Profile PII redacted (Member-B has no other active memberships)
    const { data: profile } = await admin
      .from("profiles")
      .select("full_name, phone")
      .eq("user_id", memberB.userId)
      .single();
    expect(profile.full_name).toBe("[REDACTED]");
    expect(profile.phone).toMatch(/^REDACTED-[a-f0-9]{64}$/);

    // audit_log has member.removed
    const { data: logs } = await admin
      .from("audit_log")
      .select("action, payload")
      .eq("action", "member.removed")
      .eq("society_id", created.society_id);
    expect(logs.length).toBeGreaterThanOrEqual(1);
  });

  it("ONBD-07: non-Secretary calling remove_member raises INSUFFICIENT_PRIVILEGES", async () => {
    const { created, flat2 } = await createTestSociety();

    // Member-A joins (role=member)
    const memberA = await signInTestPhone("+919000000003", "member");
    const { data: joinResult } = await memberA.client.rpc("redeem_society_code", {
      p_code: created.code,
      p_flat_id: flat2.id,
      p_residency: "owner",
      p_household: "family",
      p_emergency: "9999999999",
    });

    // Refresh memberA so JWT has society_id (but role=member)
    const refreshedMemberA = await refreshSession(memberA.session.refresh_token);

    // Member-A tries to remove themselves — should fail
    const { error } = await refreshedMemberA.client.rpc("remove_member", {
      p_membership_id: joinResult.membership_id,
    });
    expect(error).not.toBeNull();
    expect(error.message ?? "").toMatch(/INSUFFICIENT_PRIVILEGES/);
  });
});
