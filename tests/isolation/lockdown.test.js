// Migration 054 (tenant lockdown) — negative isolation tests.
//
// Proves, against the real local stack (RLS + grants + SECURITY DEFINER RPCs):
//   * C1  members cannot write tenant tables directly (role/status self-promotion,
//         society service_status, family_members graft, society_codes oracle);
//   * C4  eligible_push_recipients / flat_action_recipients and the
//         notification_preferences_effective view are not reachable by members;
//   * HIGH 5  privileged RPCs reject another society's ids AND a demoted
//         secretary whose JWT still says 'secretary';
//   * HIGH 4  a demoted secretary loses the authority row; a removed member
//         cannot self-rejoin through onboard_resident;
//   * HIGH 6/10  profiles.phone, complaints/attachments INSERT and posts/ storage
//         writes are refused; legitimate writes still work.
//
// Every negative assertion checks that `error` is NON-NULL (a permission or
// RPC error), never just that `data ?? []` came back empty.
//
// JavaScript only — no TypeScript.

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import {
  adminClient,
  signInTestPhone,
  signInAsBoard,
  signInAsMember,
  signInAsSecretary,
  seedAmenity,
  seedBooking,
  seedFlatAction,
  SOCIETY_A_ID,
  SOCIETY_B_ID,
  FLAT_A_101,
  FLAT_A_102,
  FLAT_B_101,
  FLAT_B_102,
} from "./helpers/phase6.js";

// Phones (all in [auth.sms.test_otp]). signInTestPhone recreates the auth user.
const MEMBER_A_PHONE = "+919000000002";      // member, Society A, flat A-101
const REMOVED_A_PHONE = "+919000000003";     // member, Society A, removed during the test
const BOARD_B_PHONE = "+919000000004";       // board member, Society B
const SECRETARY_A_PHONE = "+919000000005";   // secretary, Society A
const SECRETARY_B_PHONE = "+919000000006";   // secretary, Society B
const DEMOTED_SEC_A_PHONE = "+919000000007"; // second secretary of A, demoted during the test
const RATE_LIMIT_PHONE = "+919000000008";    // no membership; burns code attempts
const FAMILY_PHONE = "+919000000009";        // no membership; target of a cross-society graft

const SEEDED_CODE_A = "TEST-A001";

let memberA;
let removedA;
let boardB;
let secretaryA;
let secretaryB;
let demotedSecA;

const cleanup = {
  complaintIds: [],
  bookingIds: [],
  amenityIds: [],
  flatActionIds: [],
  notificationIds: [],
  familyIds: [],
  storageKeys: [],
};

/** True when a supabase-js error looks like a privilege / RLS refusal. */
function isPermissionError(error) {
  if (!error) return false;
  const msg = String(error.message ?? "").toLowerCase();
  return (
    error.code === "42501" ||
    msg.includes("permission denied") ||
    msg.includes("row-level security")
  );
}

async function membershipOf(userId, societyId) {
  const { data, error } = await adminClient()
    .from("society_memberships")
    .select("id, role, status")
    .eq("user_id", userId)
    .eq("society_id", societyId)
    .order("joined_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(`membershipOf: ${error.message}`);
  return data;
}

beforeAll(async () => {
  // Leftovers from other suites / earlier runs that would change the outcome.
  const admin = adminClient();
  await admin.from("society_codes").update({ paused_at: null }).eq("code", SEEDED_CODE_A);
  await admin.from("society_authorities").delete().eq("phone", DEMOTED_SEC_A_PHONE.slice(-10));
  await admin.from("family_members").delete().is("claimed_user_id", null).eq("phone", FAMILY_PHONE);
  await admin.from("amenities").delete().eq("society_id", SOCIETY_A_ID).like("name", "Lockdown %");

  memberA = await signInAsMember(MEMBER_A_PHONE, SOCIETY_A_ID, FLAT_A_101);
  removedA = await signInAsMember(REMOVED_A_PHONE, SOCIETY_A_ID, FLAT_A_102);
  boardB = await signInAsBoard(BOARD_B_PHONE, SOCIETY_B_ID, FLAT_B_101);
  secretaryA = await signInAsSecretary(SECRETARY_A_PHONE, SOCIETY_A_ID, FLAT_A_102);
  secretaryB = await signInAsSecretary(SECRETARY_B_PHONE, SOCIETY_B_ID, FLAT_B_102);
  demotedSecA = await signInAsSecretary(DEMOTED_SEC_A_PHONE, SOCIETY_A_ID, FLAT_A_101);
});

afterAll(async () => {
  const admin = adminClient();
  if (cleanup.storageKeys.length > 0) {
    await admin.storage.from("parisar-attachments").remove(cleanup.storageKeys);
  }
  if (cleanup.familyIds.length > 0) {
    await admin.from("family_members").delete().in("id", cleanup.familyIds);
  }
  if (cleanup.complaintIds.length > 0) {
    await admin.from("complaint_responses").delete().in("complaint_id", cleanup.complaintIds);
    await admin.from("complaints").delete().in("id", cleanup.complaintIds);
  }
  if (cleanup.bookingIds.length > 0) {
    await admin.from("bookings").delete().in("id", cleanup.bookingIds);
  }
  if (cleanup.amenityIds.length > 0) {
    await admin.from("amenities").delete().in("id", cleanup.amenityIds);
  }
  if (cleanup.flatActionIds.length > 0) {
    await admin.from("flat_actions").delete().in("id", cleanup.flatActionIds);
  }
  if (cleanup.notificationIds.length > 0) {
    await admin.from("notifications").delete().in("id", cleanup.notificationIds);
  }
  await admin.from("society_authorities").delete().eq("phone", DEMOTED_SEC_A_PHONE.slice(-10));
  await admin.from("amenities").delete().eq("society_id", SOCIETY_A_ID).like("name", "Lockdown %");
});

// ---------------------------------------------------------------------------
// C1 — direct writes to tenant tables
// ---------------------------------------------------------------------------
describe("C1: members cannot write tenant tables directly", () => {
  it("member cannot UPDATE their own role to secretary", async () => {
    const { error } = await memberA.client
      .from("society_memberships")
      .update({ role: "secretary" })
      .eq("user_id", memberA.userId);
    expect(error).not.toBeNull();
    expect(isPermissionError(error)).toBe(true);

    const row = await membershipOf(memberA.userId, SOCIETY_A_ID);
    expect(row.role).toBe("member");
  });

  it("member cannot UPDATE their own membership status", async () => {
    const { error } = await memberA.client
      .from("society_memberships")
      .update({ status: "pending_review" })
      .eq("user_id", memberA.userId);
    expect(error).not.toBeNull();
    expect(isPermissionError(error)).toBe(true);

    const row = await membershipOf(memberA.userId, SOCIETY_A_ID);
    expect(row.status).toBe("active");
  });

  it("member cannot INSERT a membership (graft onto another flat)", async () => {
    const { error } = await memberA.client.from("society_memberships").insert({
      society_id: SOCIETY_A_ID,
      user_id: memberA.userId,
      flat_id: FLAT_A_102,
      role: "secretary",
      residency: "owner",
      household: "family",
      status: "active",
    });
    expect(error).not.toBeNull();
    expect(isPermissionError(error)).toBe(true);
  });

  it("member cannot UPDATE societies.service_status (block the society)", async () => {
    const { error } = await memberA.client
      .from("societies")
      .update({ service_status: "blocked", service_reason: "pwned" })
      .eq("id", SOCIETY_A_ID);
    expect(error).not.toBeNull();
    expect(isPermissionError(error)).toBe(true);

    const { data } = await adminClient()
      .from("societies")
      .select("service_status")
      .eq("id", SOCIETY_A_ID)
      .single();
    expect(data.service_status).toBe("active");
  });

  it("member cannot UPDATE societies.secretary_phone", async () => {
    const { error } = await memberA.client
      .from("societies")
      .update({ secretary_phone: "9999999999" })
      .eq("id", SOCIETY_A_ID);
    expect(error).not.toBeNull();
    expect(isPermissionError(error)).toBe(true);
  });

  it("member cannot INSERT family_members", async () => {
    const { data: mem } = await adminClient()
      .from("society_memberships")
      .select("id")
      .eq("user_id", memberA.userId)
      .eq("society_id", SOCIETY_A_ID)
      .limit(1)
      .single();
    const { error } = await memberA.client.from("family_members").insert({
      society_id: SOCIETY_A_ID,
      membership_id: mem.id,
      full_name: "Grafted Person",
      phone: "+919888888888",
    });
    expect(error).not.toBeNull();
    expect(isPermissionError(error)).toBe(true);
  });

  it("member cannot INSERT society_codes (existence oracle)", async () => {
    const { error } = await memberA.client
      .from("society_codes")
      .insert({ code: "ZZZZ-9999", society_id: SOCIETY_A_ID });
    expect(error).not.toBeNull();
    expect(isPermissionError(error)).toBe(true);
  });

  it("member cannot INSERT wings / flats / amenities", async () => {
    const wing = await memberA.client.from("wings").insert({ society_id: SOCIETY_A_ID, name: "ZZ" });
    expect(wing.error).not.toBeNull();
    const flat = await memberA.client
      .from("flats")
      .insert({ society_id: SOCIETY_A_ID, wing_id: "00000000-0000-0000-0000-00000000a001", number: "999" });
    expect(flat.error).not.toBeNull();
    const amenity = await memberA.client
      .from("amenities")
      .insert({ society_id: SOCIETY_A_ID, name: "Lockdown Direct" });
    expect(amenity.error).not.toBeNull();
  });

  it("even a secretary cannot INSERT amenities directly, but the setup RPC is idempotent", async () => {
    const direct = await secretaryA.client
      .from("amenities")
      .insert({ society_id: SOCIETY_A_ID, name: "Lockdown Direct Sec" });
    expect(direct.error).not.toBeNull();

    const payload = [{ name: "Lockdown Gym" }, { name: "Lockdown Pool", is_custom: true }];
    const first = await secretaryA.client.rpc("secretary_add_setup_amenities", {
      p_society_id: SOCIETY_A_ID,
      p_amenities: payload,
    });
    expect(first.error).toBeNull();
    expect(first.data.inserted).toBe(2);

    const second = await secretaryA.client.rpc("secretary_add_setup_amenities", {
      p_society_id: SOCIETY_A_ID,
      p_amenities: payload,
    });
    expect(second.error).toBeNull();
    expect(second.data.inserted).toBe(0);
  });

  it("secretary cannot write society_guards directly (user_id was settable)", async () => {
    const { error } = await secretaryA.client.from("society_guards").insert({
      society_id: SOCIETY_A_ID,
      user_id: memberA.userId,
      name: "Fake Guard",
      phone: "9876500000",
    });
    expect(error).not.toBeNull();
    expect(isPermissionError(error)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// HIGH 6 — profiles column grants
// ---------------------------------------------------------------------------
describe("HIGH 6: profiles", () => {
  it("member cannot UPDATE their own profiles.phone", async () => {
    const { error } = await memberA.client
      .from("profiles")
      .update({ phone: "+919999999999" })
      .eq("user_id", memberA.userId);
    expect(error).not.toBeNull();
    expect(isPermissionError(error)).toBe(true);
  });

  it("member cannot UPDATE their own profiles.pin_set", async () => {
    const { error } = await memberA.client
      .from("profiles")
      .update({ pin_set: true })
      .eq("user_id", memberA.userId);
    expect(error).not.toBeNull();
    expect(isPermissionError(error)).toBe(true);
  });

  it("member CAN still update their own full_name", async () => {
    const { error } = await memberA.client
      .from("profiles")
      .update({ full_name: "Lockdown Member" })
      .eq("user_id", memberA.userId);
    expect(error).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// C4 — service-only helpers + preferences view
// ---------------------------------------------------------------------------
describe("C4: service-only surfaces are closed to members", () => {
  it("notification_preferences_effective is not readable by a member", async () => {
    const { data, error } = await memberA.client
      .from("notification_preferences_effective")
      .select("user_id, society_id");
    expect(error).not.toBeNull();
    expect(data).toBeNull();
  });

  it("eligible_push_recipients is not executable by authenticated", async () => {
    const { data, error } = await memberA.client.rpc("eligible_push_recipients", {
      p_notification_id: randomUUID(),
    });
    expect(error).not.toBeNull();
    expect(data).toBeNull();
  });

  it("flat_action_recipients is not executable by authenticated", async () => {
    const { data, error } = await memberA.client.rpc("flat_action_recipients", {
      p_flat_action_id: randomUUID(),
    });
    expect(error).not.toBeNull();
    expect(data).toBeNull();
  });

  it("legacy create_society_with_secretary is not executable by authenticated", async () => {
    const { error } = await memberA.client.rpc("create_society_with_secretary", {
      p_name: "Rogue Society",
      p_address: "1 Rogue Street, Pune",
      p_co_secretary_phone: "9876543210",
    });
    expect(error).not.toBeNull();
  });
});

// ---------------------------------------------------------------------------
// HIGH 5 — privileged RPCs across societies
// ---------------------------------------------------------------------------
describe("HIGH 5: society B cannot act on society A ids", () => {
  let complaintId;
  let bookingId;
  let fineId;
  let pollId;
  let optionId;

  beforeAll(async () => {
    const admin = adminClient();

    const { data: c, error: cErr } = await admin
      .from("complaints")
      .insert({
        society_id: SOCIETY_A_ID,
        reporter_id: memberA.userId,
        reporter_flat_id: FLAT_A_101,
        kind: "society",
        description: "Lockdown test complaint",
      })
      .select("id")
      .single();
    if (cErr) throw new Error(`seed complaint: ${cErr.message}`);
    complaintId = c.id;
    cleanup.complaintIds.push(complaintId);

    const amenityId = await seedAmenity(SOCIETY_A_ID, { name: "Lockdown Hall" });
    cleanup.amenityIds.push(amenityId);
    const start = new Date(Date.now() + 2 * 24 * 3600 * 1000);
    start.setUTCHours(5, 30, 0, 0); // 11:00 IST
    const end = new Date(start.getTime() + 3600 * 1000);
    bookingId = await seedBooking(SOCIETY_A_ID, amenityId, memberA.userId, {
      startsAt: start.toISOString(),
      endsAt: end.toISOString(),
    });
    cleanup.bookingIds.push(bookingId);

    fineId = await seedFlatAction({
      societyId: SOCIETY_A_ID,
      flatId: FLAT_A_101,
      issuerId: secretaryA.userId,
      kind: "fine",
      amount: 500,
      dueDate: "2030-01-01",
    });
    cleanup.flatActionIds.push(fineId);

    const { data: n, error: nErr } = await admin
      .from("notifications")
      .insert({
        society_id: SOCIETY_A_ID,
        author_id: secretaryA.userId,
        kind: "poll",
        category: "polls",
        title: "Lockdown poll",
        body: "Vote",
      })
      .select("id")
      .single();
    if (nErr) throw new Error(`seed notification: ${nErr.message}`);
    cleanup.notificationIds.push(n.id);
    const { data: p, error: pErr } = await admin
      .from("polls")
      .insert({ society_id: SOCIETY_A_ID, notification_id: n.id, question: "Paint?" })
      .select("id")
      .single();
    if (pErr) throw new Error(`seed poll: ${pErr.message}`);
    pollId = p.id;
    const { data: o, error: oErr } = await admin
      .from("poll_options")
      .insert({ society_id: SOCIETY_A_ID, poll_id: pollId, label: "Yes", position: 1 })
      .select("id")
      .single();
    if (oErr) throw new Error(`seed option: ${oErr.message}`);
    optionId = o.id;
  });

  it("board member of B cannot claim_complaint on A's complaint", async () => {
    const { error } = await boardB.client.rpc("claim_complaint", {
      p_complaint_id: complaintId,
      p_response_kind: "checking",
      p_free_text: null,
    });
    expect(error).not.toBeNull();

    const { data } = await adminClient().from("complaints").select("owner_id").eq("id", complaintId).single();
    expect(data.owner_id).toBeNull();
  });

  it("board member of B cannot approve_booking on A's booking", async () => {
    const { error } = await boardB.client.rpc("approve_booking", { p_booking_id: bookingId });
    expect(error).not.toBeNull();

    const { data } = await adminClient().from("bookings").select("status").eq("id", bookingId).single();
    expect(data.status).toBe("pending");
  });

  it("board member of B cannot reject_booking on A's booking", async () => {
    const { error } = await boardB.client.rpc("reject_booking", { p_booking_id: bookingId, p_reason: null });
    expect(error).not.toBeNull();
  });

  it("secretary of B cannot waive_fine on A's fine", async () => {
    const { error } = await secretaryB.client.rpc("waive_fine", { p_action_id: fineId });
    expect(error).not.toBeNull();

    const { data } = await adminClient().from("flat_actions").select("fine_status").eq("id", fineId).single();
    expect(data.fine_status).toBe("outstanding");
  });

  it("secretary of B cannot issue_flat_action against A's flat", async () => {
    const { error } = await secretaryB.client.rpc("issue_flat_action", {
      p_flat_id: FLAT_A_101,
      p_kind: "warning",
      p_body: "cross-society warning",
    });
    expect(error).not.toBeNull();
  });

  it("board member of B cannot vote_on_poll in A's poll", async () => {
    const { error } = await boardB.client.rpc("vote_on_poll", {
      p_poll_id: pollId,
      p_option_id: optionId,
    });
    expect(error).not.toBeNull();
  });

  it("member of A cannot set_active_society to B", async () => {
    const { error } = await memberA.client.rpc("set_active_society", { p_society_id: SOCIETY_B_ID });
    expect(error).not.toBeNull();
  });

  it("my_active_society reports A for member A", async () => {
    const { data, error } = await memberA.client.rpc("my_active_society");
    expect(error).toBeNull();
    expect(data.society_id).toBe(SOCIETY_A_ID);
    expect(data.role).toBe("member");
  });
});

// ---------------------------------------------------------------------------
// HIGH 4/5 — demoted secretary, authority row, removed member
// ---------------------------------------------------------------------------
describe("HIGH 4/5: demotion and removal are effective immediately", () => {
  it("a demoted secretary cannot call set_membership_role before their token refreshes", async () => {
    const admin = adminClient();
    // The demoted person is also on the authority list (claimed).
    const { error: authErr } = await admin.from("society_authorities").upsert(
      {
        society_id: SOCIETY_A_ID,
        full_name: "Lockdown Authority",
        phone: DEMOTED_SEC_A_PHONE.slice(-10),
        user_id: demotedSecA.userId,
        claimed_at: new Date().toISOString(),
      },
      { onConflict: "society_id,phone" },
    );
    if (authErr) throw new Error(`seed authority: ${authErr.message}`);

    // The real chairman demotes them.
    const demote = await secretaryA.client.rpc("set_membership_role", {
      p_target_user_id: demotedSecA.userId,
      p_role: "member",
    });
    expect(demote.error).toBeNull();

    // Their OLD token still says role=secretary — the RPC must re-check live.
    const { error } = await demotedSecA.client.rpc("set_membership_role", {
      p_target_user_id: memberA.userId,
      p_role: "board_member",
    });
    expect(error).not.toBeNull();
    expect(String(error.message)).toContain("ONLY_SECRETARY_CAN_SET_ROLE");

    const row = await membershipOf(memberA.userId, SOCIETY_A_ID);
    expect(row.role).toBe("member");
  });

  it("the demotion removed their authority row, so they cannot reclaim secretary", async () => {
    const { data: rows, error: readErr } = await adminClient()
      .from("society_authorities")
      .select("id")
      .eq("society_id", SOCIETY_A_ID)
      .eq("phone", DEMOTED_SEC_A_PHONE.slice(-10));
    expect(readErr).toBeNull();
    expect(rows).toHaveLength(0);

    const { error } = await demotedSecA.client.rpc("claim_society_authority");
    expect(error).not.toBeNull();

    const row = await membershipOf(demotedSecA.userId, SOCIETY_A_ID);
    expect(row.role).toBe("member");
  });

  it("a removed member cannot rejoin themselves with the society code", async () => {
    const before = await membershipOf(removedA.userId, SOCIETY_A_ID);
    const removal = await secretaryA.client.rpc("remove_member", { p_membership_id: before.id });
    expect(removal.error).toBeNull();

    const { data, error } = await removedA.client.rpc("onboard_resident", {
      p_code: SEEDED_CODE_A,
      p_flat_id: FLAT_A_102,
      p_full_name: "Removed Person",
      p_residency: "owner",
      p_alt_phone: null,
      p_family: [],
    });
    expect(error).toBeNull();
    expect(data?.error).toBe("MEMBERSHIP_REMOVED");

    const after = await membershipOf(removedA.userId, SOCIETY_A_ID);
    expect(after.status).toBe("deleted");
  });
});

// ---------------------------------------------------------------------------
// HIGH (claim_family_membership) — cross-society graft
// ---------------------------------------------------------------------------
describe("claim_family_membership rejects a cross-society primary", () => {
  it("a family row in A pointing at a membership in B is not honoured", async () => {
    const family = await signInTestPhone(FAMILY_PHONE, "member");
    const boardBMembership = await membershipOf(boardB.userId, SOCIETY_B_ID);

    const { data: fam, error: famErr } = await adminClient()
      .from("family_members")
      .insert({
        society_id: SOCIETY_A_ID,
        membership_id: boardBMembership.id,
        full_name: "Grafted Family",
        phone: FAMILY_PHONE,
      })
      .select("id")
      .single();
    if (famErr) throw new Error(`seed family: ${famErr.message}`);
    cleanup.familyIds.push(fam.id);

    const { error } = await family.client.rpc("claim_family_membership");
    expect(error).not.toBeNull();

    const { data: rows } = await adminClient()
      .from("society_memberships")
      .select("id")
      .eq("user_id", family.userId);
    expect(rows ?? []).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// HIGH 7 — failed society-code attempts are throttled
// ---------------------------------------------------------------------------
describe("society-code attempts are rate limited", () => {
  it("the 6th failed code within 15 minutes is refused", async () => {
    const guesser = await signInTestPhone(RATE_LIMIT_PHONE, "member");
    for (let i = 0; i < 5; i += 1) {
      const { data, error } = await guesser.client.rpc("onboard_flats_for_code", {
        p_code: `ZZZZ-ZZZ${i}`,
      });
      expect(error).toBeNull();
      expect(data?.error).toBe("INVALID_CODE");
    }
    const { data, error } = await guesser.client.rpc("onboard_flats_for_code", { p_code: SEEDED_CODE_A });
    expect(error).not.toBeNull();
    expect(String(error.message)).toContain("TOO_MANY_CODE_ATTEMPTS");
    expect(data).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// HIGH 10 — complaints / attachments / storage
// ---------------------------------------------------------------------------
describe("HIGH 10: complaints, attachments and storage", () => {
  it("member cannot INSERT complaints directly", async () => {
    const { error } = await memberA.client.from("complaints").insert({
      society_id: SOCIETY_A_ID,
      reporter_id: memberA.userId,
      reporter_flat_id: FLAT_A_101,
      kind: "society",
      description: "direct insert",
    });
    expect(error).not.toBeNull();
    expect(isPermissionError(error)).toBe(true);
  });

  it("member cannot INSERT attachments directly", async () => {
    const { error } = await memberA.client.from("attachments").insert({
      society_id: SOCIETY_A_ID,
      owner_kind: "complaint",
      owner_id: randomUUID(),
      storage_key: `${SOCIETY_A_ID}/complaints/${randomUUID()}/x.jpg`,
      created_by: memberA.userId,
    });
    expect(error).not.toBeNull();
    expect(isPermissionError(error)).toBe(true);
  });

  it("file_complaint rejects a storage key for another record", async () => {
    const { error } = await memberA.client.rpc("file_complaint", {
      p_kind: "society",
      p_description: "bad key",
      p_reporter_flat_id: FLAT_A_101,
      p_language_code: "en",
      p_complaint_id: randomUUID(),
      p_storage_key: `${SOCIETY_A_ID}/complaints/${randomUUID()}/photo.jpg`,
      p_mime_type: "image/jpeg",
      p_byte_size: 10,
    });
    expect(error).not.toBeNull();
    expect(String(error.message)).toContain("INVALID_ATTACHMENT_KEY");
  });

  it("member cannot upload straight into posts/ (bypassing moderation)", async () => {
    const key = `${SOCIETY_A_ID}/posts/${randomUUID()}/${randomUUID()}.jpg`;
    const { error } = await memberA.client.storage
      .from("parisar-attachments")
      .upload(key, new Uint8Array([1, 2, 3]), { contentType: "image/jpeg", upsert: false });
    expect(error).not.toBeNull();
  });

  it("member cannot upload into another society's prefix", async () => {
    const key = `${SOCIETY_B_ID}/complaints/${randomUUID()}/${randomUUID()}.jpg`;
    const { error } = await memberA.client.storage
      .from("parisar-attachments")
      .upload(key, new Uint8Array([1, 2, 3]), { contentType: "image/jpeg", upsert: false });
    expect(error).not.toBeNull();
  });

  it("member CAN still upload a complaint photo to the expected path", async () => {
    const key = `${SOCIETY_A_ID}/complaints/${randomUUID()}/${randomUUID()}.jpg`;
    const { error } = await memberA.client.storage
      .from("parisar-attachments")
      .upload(key, new Uint8Array([1, 2, 3]), { contentType: "image/jpeg", upsert: false });
    expect(error).toBeNull();
    cleanup.storageKeys.push(key);
  });
});
