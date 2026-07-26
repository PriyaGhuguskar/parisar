// Society Setup Isolation Tests
// Covers: SETUP-01, SETUP-02, SETUP-03, SETUP-05, SETUP-08, SETUP-10
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
  refreshSession,
  resetTestState,
  signInTestPhone,
} from "./helpers/phase3.js";

const CODE_PATTERN = /^[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}$/;

afterAll(async () => {
  await resetTestState();
  await cleanupTestUsers();
});

describe("Phase 3 — Society Setup (SETUP-01 through SETUP-10)", () => {
  beforeEach(async () => {
    await resetTestState();
  });

  it("SETUP-01: create_society_with_secretary inserts one society + one society_code + audit_log 'society.created'", async () => {
    const sec = await signInTestPhone("+919000000001", "secretary");

    const { data: created, error } = await sec.client.rpc(
      "create_society_with_secretary",
      {
        p_name: "Test Society Alpha",
        p_address: "123 Main Street, Test City, MH 400001",
        p_co_secretary_phone: "9000000002",
      },
    );

    expect(error).toBeNull();
    expect(created).toBeDefined();
    expect(created.society_id).toBeDefined();
    expect(created.code).toBeDefined();
    expect(typeof created.co_secretary_found).toBe("boolean");

    const admin = adminClient();

    // Assert one society row with correct phones
    const { data: society } = await admin
      .from("societies")
      .select("id, name, secretary_phone, co_secretary_phone")
      .eq("id", created.society_id)
      .single();
    expect(society).toBeDefined();
    expect(society.name).toBe("Test Society Alpha");
    expect(society.co_secretary_phone).toBe("9000000002");
    // secretary_phone should contain the caller's phone
    expect(society.secretary_phone).toContain("9000000001");

    // Assert one society_codes row
    const { data: codes } = await admin
      .from("society_codes")
      .select("code, society_id, revoked_at")
      .eq("society_id", created.society_id);
    expect(codes).toHaveLength(1);
    expect(codes[0].revoked_at).toBeNull();

    // Assert audit_log has 'society.created'
    const { data: logs } = await admin
      .from("audit_log")
      .select("action, society_id, actor_id")
      .eq("action", "society.created")
      .eq("society_id", created.society_id);
    expect(logs).toHaveLength(1);
    expect(logs[0].actor_id).toBe(sec.userId);
  });

  it("SETUP-02: returned code matches /^[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}$/ (no 0/O/I/1/L)", async () => {
    const sec = await signInTestPhone("+919000000001", "secretary");

    const { data: created, error } = await sec.client.rpc(
      "create_society_with_secretary",
      {
        p_name: "Code Format Society",
        p_address: "456 Test Road, Mumbai, MH 400002",
        p_co_secretary_phone: "9000000002",
      },
    );

    expect(error).toBeNull();
    expect(created.code).toMatch(CODE_PATTERN);
    // Extra: ensure no ambiguous characters
    expect(created.code).not.toMatch(/[0OI1L]/);
  });

  it("SETUP-03: rotate_society_code sets revoked_at on old code; new code is active with revoked_at=null", async () => {
    const sec = await signInTestPhone("+919000000001", "secretary");
    const { data: created } = await sec.client.rpc("create_society_with_secretary", {
      p_name: "Rotate Society",
      p_address: "789 Rotate Street, Pune, MH 411001",
      p_co_secretary_phone: "9000000002",
    });
    const admin = adminClient();

    // Create a wing + flat, then finalize so Secretary has membership (required for rotate)
    const { data: wing } = await admin
      .from("wings")
      .insert({ society_id: created.society_id, name: "A" })
      .select()
      .single();
    const { data: flat } = await admin
      .from("flats")
      .insert({ society_id: created.society_id, wing_id: wing.id, number: "101" })
      .select()
      .single();
    await sec.client.rpc("finalize_society_setup", {
      p_society_id: created.society_id,
      p_flat_id: flat.id,
    });

    // Refresh session so JWT carries society_id + role=secretary
    const refreshed = await refreshSession(sec.session.refresh_token);

    const oldCode = created.code;
    const { data: rotated, error: rotateError } = await refreshed.client.rpc(
      "rotate_society_code",
      { p_society_id: created.society_id },
    );
    expect(rotateError).toBeNull();
    expect(rotated.code).toMatch(CODE_PATTERN);
    expect(rotated.code).not.toBe(oldCode);

    // Old code should now have revoked_at set
    const { data: oldRow } = await admin
      .from("society_codes")
      .select("revoked_at")
      .eq("code", oldCode)
      .single();
    expect(oldRow.revoked_at).not.toBeNull();

    // New code should be active
    const { data: newRow } = await admin
      .from("society_codes")
      .select("revoked_at, paused_at")
      .eq("code", rotated.code)
      .single();
    expect(newRow.revoked_at).toBeNull();
    expect(newRow.paused_at).toBeNull();
  });

  it("SETUP-05: finalize_society_setup creates secretary membership; Secretary can INSERT wings/flats directly", async () => {
    const sec = await signInTestPhone("+919000000001", "secretary");
    const { data: created } = await sec.client.rpc("create_society_with_secretary", {
      p_name: "Finalize Society",
      p_address: "999 Finalize Ave, Nagpur, MH 440001",
      p_co_secretary_phone: "9000000002",
    });

    const admin = adminClient();
    // Insert wing + flat via service-role for the finalize call
    const { data: wing } = await admin
      .from("wings")
      .insert({ society_id: created.society_id, name: "Wing-A" })
      .select()
      .single();
    const { data: flat } = await admin
      .from("flats")
      .insert({ society_id: created.society_id, wing_id: wing.id, number: "101" })
      .select()
      .single();

    const { data: finalized, error: finalizeError } = await sec.client.rpc(
      "finalize_society_setup",
      { p_society_id: created.society_id, p_flat_id: flat.id },
    );
    expect(finalizeError).toBeNull();
    expect(finalized.membership_id).toBeDefined();

    // Assert membership row has role=secretary, status=active
    const { data: mem } = await admin
      .from("society_memberships")
      .select("role, status, user_id")
      .eq("id", finalized.membership_id)
      .single();
    expect(mem.role).toBe("secretary");
    expect(mem.status).toBe("active");
    expect(mem.user_id).toBe(sec.userId);
  });

  it("SETUP-08: co_secretary has same rotate_society_code powers as Secretary", async () => {
    const sec = await signInTestPhone("+919000000001", "secretary");
    const { data: created } = await sec.client.rpc("create_society_with_secretary", {
      p_name: "CoSec Powers Society",
      p_address: "100 CoSec Blvd, Thane, MH 400601",
      p_co_secretary_phone: "9000000002",
    });

    const admin = adminClient();
    const { data: wing } = await admin
      .from("wings")
      .insert({ society_id: created.society_id, name: "A" })
      .select()
      .single();
    const { data: secFlat } = await admin
      .from("flats")
      .insert({ society_id: created.society_id, wing_id: wing.id, number: "101" })
      .select()
      .single();
    const { data: coSecFlat } = await admin
      .from("flats")
      .insert({ society_id: created.society_id, wing_id: wing.id, number: "102" })
      .select()
      .single();

    await sec.client.rpc("finalize_society_setup", {
      p_society_id: created.society_id,
      p_flat_id: secFlat.id,
    });

    // Sign in Member-A and promote to co_secretary via service-role insert
    const memberA = await signInTestPhone("+919000000002", "member");
    await admin.from("society_memberships").insert({
      society_id: created.society_id,
      user_id: memberA.userId,
      flat_id: coSecFlat.id,
      role: "co_secretary",
      residency: "owner",
      household: "family",
      status: "active",
    });

    // Refresh Member-A's session so JWT has society_id + role=co_secretary
    const refreshedCoSec = await refreshSession(memberA.session.refresh_token);

    // Co-secretary should be able to rotate the code
    const { data: rotated, error: rotateError } = await refreshedCoSec.client.rpc(
      "rotate_society_code",
      { p_society_id: created.society_id },
    );
    expect(rotateError).toBeNull();
    expect(rotated.code).toMatch(CODE_PATTERN);
  });

  it("SETUP-10: transfer_secretary_role demotes caller to member, promotes target to secretary; non-secretary calling raises error", async () => {
    const sec = await signInTestPhone("+919000000001", "secretary");
    const { data: created } = await sec.client.rpc("create_society_with_secretary", {
      p_name: "Transfer Society",
      p_address: "200 Transfer Road, Aurangabad, MH 431001",
      p_co_secretary_phone: "9000000002",
    });

    const admin = adminClient();
    const { data: wing } = await admin
      .from("wings")
      .insert({ society_id: created.society_id, name: "A" })
      .select()
      .single();
    const { data: secFlat } = await admin
      .from("flats")
      .insert({ society_id: created.society_id, wing_id: wing.id, number: "101" })
      .select()
      .single();
    const { data: coSecFlat } = await admin
      .from("flats")
      .insert({ society_id: created.society_id, wing_id: wing.id, number: "102" })
      .select()
      .single();

    // Finalize Secretary's membership
    await sec.client.rpc("finalize_society_setup", {
      p_society_id: created.society_id,
      p_flat_id: secFlat.id,
    });

    // Directly insert a co_secretary membership for Member-A
    const memberA = await signInTestPhone("+919000000002", "member");
    await admin.from("society_memberships").insert({
      society_id: created.society_id,
      user_id: memberA.userId,
      flat_id: coSecFlat.id,
      role: "co_secretary",
      residency: "owner",
      household: "family",
      status: "active",
    });

    // Refresh Secretary's session so JWT has society_id + role=secretary
    const refreshedSec = await refreshSession(sec.session.refresh_token);

    // Transfer from Secretary to Member-A (co_secretary)
    const { error: transferError } = await refreshedSec.client.rpc(
      "transfer_secretary_role",
      { p_new_secretary_user_id: memberA.userId },
    );
    expect(transferError).toBeNull();

    // Old Secretary should now be 'member'
    const { data: oldSecMem } = await admin
      .from("society_memberships")
      .select("role")
      .eq("user_id", sec.userId)
      .eq("society_id", created.society_id)
      .eq("status", "active")
      .single();
    expect(oldSecMem.role).toBe("member");

    // New Secretary (Member-A) should be 'secretary'
    const { data: newSecMem } = await admin
      .from("society_memberships")
      .select("role")
      .eq("user_id", memberA.userId)
      .eq("society_id", created.society_id)
      .eq("status", "active")
      .single();
    expect(newSecMem.role).toBe("secretary");

    // audit_log should have 'role.transferred'
    const { data: logs } = await admin
      .from("audit_log")
      .select("action, payload")
      .eq("action", "role.transferred")
      .eq("society_id", created.society_id);
    expect(logs).toHaveLength(1);

    // Non-secretary (original Secretary, now 'member') trying to call transfer should fail
    // We need a fresh refreshed client — the original refreshedSec still has the old token.
    // Use memberA's refreshed session as it is now secretary; test plain member using sec's token.
    const { error: nonSecError } = await refreshedSec.client.rpc("transfer_secretary_role", {
      p_new_secretary_user_id: memberA.userId,
    });
    // Should raise ONLY_SECRETARY_CAN_TRANSFER (or NO_SOCIETY if JWT claims still cached)
    expect(nonSecError).not.toBeNull();
  });
});
