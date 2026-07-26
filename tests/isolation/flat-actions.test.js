// Phase 6 flat-action isolation + behavior tests.
//
// Covers FLAT-01..06 + D-04 (fine lifecycle, admin-only waive) + D-05 (per-flat
// privacy) per 06-VALIDATION.md. Runs against the live local Supabase stack.
// File-parallelism is disabled by vitest.config.js.
//
// supabase-js v2 thenable quirk (Pitfall 1): always
// `const { data, error } = await supabase...`, NEVER `.catch` on a builder.
//
// JavaScript only — no TypeScript syntax.

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  adminClient,
  signInAsBoard,
  signInAsMember,
  signInAsSecretary,
  signInAsCoSecretary,
  seedTestSociety,
  teardownPhase6,
  seedFlatAction,
  seedPushDelivery,
  BOARD_A_PHONE,
  MEMBER_A_PHONE,
  MEMBER_B_PHONE,
  SECRETARY_A_PHONE,
  CO_SECRETARY_A_PHONE,
  MEMBER_A2_PHONE,
} from "./helpers/phase6.js";

const societyA = seedTestSociety("A"); // flatId = A-101, flat2Id = A-102
const societyB = seedTestSociety("B"); // flatId = B-101

let secretaryA; // Society A secretary (admin: issue + waive) — on A-102
let coSecretaryA; // Society A co_secretary (admin: waive parity) — on A-102
let boardA; // Society A board_member (can SEE but NOT issue/waive) — on A-102
let memberA101; // Society A member resident of A-101 (cross-flat subject)
let memberA102; // Society A member resident of A-102 (acknowledge own fine)
let memberB; // Society B member (cross-society)

beforeAll(async () => {
  await teardownPhase6([societyA.societyId, societyB.societyId]);

  // Sequential sign-in (shared test-OTP rate-limit safety).
  secretaryA = await signInAsSecretary(SECRETARY_A_PHONE, societyA.societyId, societyA.flat2Id);
  coSecretaryA = await signInAsCoSecretary(CO_SECRETARY_A_PHONE, societyA.societyId, societyA.flat2Id);
  boardA = await signInAsBoard(BOARD_A_PHONE, societyA.societyId, societyA.flat2Id);
  memberA101 = await signInAsMember(MEMBER_A_PHONE, societyA.societyId, societyA.flatId);
  memberA102 = await signInAsMember(MEMBER_A2_PHONE, societyA.societyId, societyA.flat2Id);
  memberB = await signInAsMember(MEMBER_B_PHONE, societyB.societyId, societyB.flatId);
}, 120_000);

afterAll(async () => {
  await teardownPhase6([societyA.societyId, societyB.societyId]);
});

// ---------------------------------------------------------------------------
// FLAT-01: issue authorization — admin issues, member cannot.
// ---------------------------------------------------------------------------
describe("issue authorization", () => {
  it("secretary can issue a warning against a flat", async () => {
    const { data, error } = await secretaryA.client.rpc("issue_flat_action", {
      p_flat_id: societyA.flatId,
      p_kind: "warning",
      p_body: "Please keep common areas clean",
    });
    expect(error).toBeNull();
    expect(data.flat_action_id).toBeTruthy();
    expect(data.society_id).toBe(societyA.societyId);

    // FLAT-02: attribution is denormalized (issuer_id + issuer_flat_id).
    const admin = adminClient();
    const { data: row } = await admin
      .from("flat_actions")
      .select("issuer_id, issuer_flat_id, flat_id, kind, fine_status")
      .eq("id", data.flat_action_id)
      .single();
    expect(row.issuer_id).toBe(secretaryA.userId);
    expect(row.issuer_flat_id).toBe(societyA.flat2Id);
    expect(row.flat_id).toBe(societyA.flatId);
    expect(row.kind).toBe("warning");
    expect(row.fine_status).toBeNull(); // non-fine -> NULL status
  });

  it("a regular member CANNOT issue (INSUFFICIENT_ROLE)", async () => {
    const { data, error } = await memberA101.client.rpc("issue_flat_action", {
      p_flat_id: societyA.flatId,
      p_kind: "notify",
      p_body: "member should not be able to do this",
    });
    expect(data).toBeNull();
    expect(error).not.toBeNull();
    expect(String(error.message)).toContain("INSUFFICIENT_ROLE");
  });

  it("a board_member CANNOT issue (admin-only — INSUFFICIENT_ROLE)", async () => {
    const { data, error } = await boardA.client.rpc("issue_flat_action", {
      p_flat_id: societyA.flatId,
      p_kind: "warning",
      p_body: "board cannot issue",
    });
    expect(data).toBeNull();
    expect(error).not.toBeNull();
    expect(String(error.message)).toContain("INSUFFICIENT_ROLE");
  });

  it("a fine without amount/due_date is rejected (FINE_FIELDS_REQUIRED)", async () => {
    const { error } = await secretaryA.client.rpc("issue_flat_action", {
      p_flat_id: societyA.flatId,
      p_kind: "fine",
      p_body: "bad fine",
    });
    expect(error).not.toBeNull();
    expect(String(error.message)).toContain("FINE_FIELDS_REQUIRED");
  });
});

// ---------------------------------------------------------------------------
// D-05 / FLAT-06: cross-flat isolation — A-101 member cannot see A-102's action.
// ---------------------------------------------------------------------------
describe("cross-flat isolation", () => {
  let actionAgainstA102;

  beforeAll(async () => {
    const { data } = await secretaryA.client.rpc("issue_flat_action", {
      p_flat_id: societyA.flat2Id, // target = A-102
      p_kind: "warning",
      p_body: "Noise complaint against A-102",
    });
    actionAgainstA102 = data.flat_action_id;
  });

  it("member of A-101 receives ZERO rows for an A-102 action", async () => {
    const { data, error } = await memberA101.client
      .from("flat_actions")
      .select("id")
      .eq("id", actionAgainstA102);
    expect(error).toBeNull();
    expect(data ?? []).toHaveLength(0);
  });

  it("member of A-102 (the target flat) CAN see the A-102 action", async () => {
    const { data, error } = await memberA102.client
      .from("flat_actions")
      .select("id")
      .eq("id", actionAgainstA102);
    expect(error).toBeNull();
    expect(data).toHaveLength(1);
  });

  it("a board_member sees the A-102 action (board can SEE all flats)", async () => {
    const { data, error } = await boardA.client
      .from("flat_actions")
      .select("id")
      .eq("id", actionAgainstA102);
    expect(error).toBeNull();
    expect(data).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// D-05: cross-society isolation — B member sees no A actions.
// ---------------------------------------------------------------------------
describe("cross-society isolation", () => {
  it("a Society B member sees ZERO Society A flat actions", async () => {
    // Ensure at least one A action exists.
    await seedFlatAction({
      societyId: societyA.societyId,
      flatId: societyA.flatId,
      issuerId: secretaryA.userId,
      issuerFlatId: societyA.flat2Id,
      kind: "notify",
      body: "A-society notice",
    });
    const { data, error } = await memberB.client
      .from("flat_actions")
      .select("id, society_id")
      .eq("society_id", societyA.societyId);
    expect(error).toBeNull();
    expect(data ?? []).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// D-04: fine lifecycle — member-ack (own flat), non-resident cannot, admin
// waives, board_member CANNOT waive.
// ---------------------------------------------------------------------------
describe("fine lifecycle", () => {
  async function freshFine() {
    const { data } = await secretaryA.client.rpc("issue_flat_action", {
      p_flat_id: societyA.flat2Id, // target = A-102
      p_kind: "fine",
      p_body: "Parking violation fine",
      p_amount: 500,
      p_due_date: "2026-12-31",
    });
    return data.flat_action_id;
  }

  it("a NON-resident member cannot acknowledge another flat's fine (ok:false)", async () => {
    const fineId = await freshFine();
    // memberA101 is NOT a resident of A-102.
    const { data, error } = await memberA101.client.rpc("acknowledge_fine", {
      p_action_id: fineId,
    });
    expect(error).toBeNull();
    expect(data.ok).toBe(false);

    const admin = adminClient();
    const { data: row } = await admin
      .from("flat_actions")
      .select("fine_status")
      .eq("id", fineId)
      .single();
    expect(row.fine_status).toBe("outstanding"); // unchanged
  });

  it("the target-flat resident acknowledges the fine (outstanding -> acknowledged)", async () => {
    const fineId = await freshFine();
    const { data, error } = await memberA102.client.rpc("acknowledge_fine", {
      p_action_id: fineId,
    });
    expect(error).toBeNull();
    expect(data.ok).toBe(true);
    expect(data.fine_status).toBe("acknowledged");
  });

  it("a board_member CANNOT waive a fine (admin-only — INSUFFICIENT_ROLE)", async () => {
    const fineId = await freshFine();
    const { data, error } = await boardA.client.rpc("waive_fine", { p_action_id: fineId });
    expect(data).toBeNull();
    expect(error).not.toBeNull();
    expect(String(error.message)).toContain("INSUFFICIENT_ROLE");

    const admin = adminClient();
    const { data: row } = await admin
      .from("flat_actions")
      .select("fine_status")
      .eq("id", fineId)
      .single();
    expect(row.fine_status).toBe("outstanding"); // board attempt did not change it
  });

  it("a regular member CANNOT waive a fine (INSUFFICIENT_ROLE)", async () => {
    const fineId = await freshFine();
    const { data, error } = await memberA102.client.rpc("waive_fine", { p_action_id: fineId });
    expect(data).toBeNull();
    expect(error).not.toBeNull();
    expect(String(error.message)).toContain("INSUFFICIENT_ROLE");
  });

  it("the secretary waives an outstanding fine (-> waived)", async () => {
    const fineId = await freshFine();
    const { data, error } = await secretaryA.client.rpc("waive_fine", { p_action_id: fineId });
    expect(error).toBeNull();
    expect(data.ok).toBe(true);
    expect(data.fine_status).toBe("waived");
  });

  it("the co_secretary can also waive (admin parity)", async () => {
    const fineId = await freshFine();
    const { data, error } = await coSecretaryA.client.rpc("waive_fine", { p_action_id: fineId });
    expect(error).toBeNull();
    expect(data.ok).toBe(true);
    expect(data.fine_status).toBe("waived");
  });
});

// ---------------------------------------------------------------------------
// D-04 / Pitfall 6: no 'overdue' value in the fine_status enum.
// ---------------------------------------------------------------------------
describe("no overdue status", () => {
  it("'overdue' is NOT a valid fine_status enum value (insert rejected)", async () => {
    const admin = adminClient();
    // A service-role insert bypasses RLS/REVOKE but NOT the enum type check.
    const { error } = await admin.from("flat_actions").insert({
      society_id: societyA.societyId,
      flat_id: societyA.flatId,
      issuer_id: secretaryA.userId,
      kind: "fine",
      body: "overdue probe",
      amount: 1,
      due_date: "2026-01-01",
      fine_status: "overdue",
    });
    expect(error).not.toBeNull();
    expect(String(error.message).toLowerCase()).toContain("invalid input value");
  });

  it("the three valid fine_status values all insert successfully", async () => {
    const admin = adminClient();
    for (const status of ["outstanding", "acknowledged", "waived"]) {
      const { data, error } = await admin
        .from("flat_actions")
        .insert({
          society_id: societyA.societyId,
          flat_id: societyA.flatId,
          issuer_id: secretaryA.userId,
          kind: "fine",
          body: `valid ${status}`,
          amount: 1,
          due_date: "2026-01-01",
          fine_status: status,
        })
        .select("id")
        .single();
      expect(error).toBeNull();
      expect(data.id).toBeTruthy();
    }
  });
});

// ---------------------------------------------------------------------------
// FLAT-03: flat_action_recipients returns only the target flat's members.
// ---------------------------------------------------------------------------
describe("flat-scoped recipients", () => {
  it("returns only target-flat members' tokens (not other flats)", async () => {
    const admin = adminClient();

    // Register a push token for each A member so the recipient query has rows.
    for (const m of [memberA101, memberA102]) {
      await admin.from("push_tokens").upsert(
        {
          user_id: m.userId,
          expo_token: `ExpoPushToken[fa-${m.userId.slice(0, 8)}]`,
          platform: "android",
          notifications_enabled: true,
        },
        { onConflict: "expo_token" },
      );
    }

    // Issue a NOTIFY against A-102 (mute_general category, not quiet-hours-bound
    // for the test cap — seed 0 deliveries so the cap never excludes).
    await seedPushDelivery(societyA.societyId, memberA102.userId, "general", "2000-01-01T00:00:00Z");
    const actionId = await seedFlatAction({
      societyId: societyA.societyId,
      flatId: societyA.flat2Id, // target = A-102
      issuerId: secretaryA.userId,
      issuerFlatId: societyA.flat2Id,
      kind: "notify",
      body: "flat-scoped recipients probe",
    });

    const { data, error } = await admin.rpc("flat_action_recipients", {
      p_flat_action_id: actionId,
    });
    expect(error).toBeNull();
    const recipientIds = (data ?? []).map((r) => r.user_id);
    // A-102 resident is a candidate; A-101 resident must NOT appear.
    expect(recipientIds).not.toContain(memberA101.userId);
    // Every returned recipient must be an A-102 resident.
    const { data: a102Members } = await admin
      .from("society_memberships")
      .select("user_id")
      .eq("society_id", societyA.societyId)
      .eq("flat_id", societyA.flat2Id)
      .eq("status", "active");
    const a102Ids = (a102Members ?? []).map((r) => r.user_id);
    for (const id of recipientIds) {
      expect(a102Ids).toContain(id);
    }
  });
});
