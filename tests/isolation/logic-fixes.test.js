// Migration 055 logic fixes — behaviour tests against the live local stack.
//
// Covers CODE-REVIEW.md items fixed in supabase/migrations/20261011000055:
//   request_booking      NULL times → INVALID_TIME; ≤5 future pending per user/amenity
//   add_facility_event   empty note no longer breaks notifications.body NOT NULL
//   resident_decide_visit compare-and-set (ALREADY_DECIDED), 30-min expiry (VISIT_EXPIRED)
//   guard_create_visit   30 per 10 min per guard (VISIT_RATE_LIMITED), lazy expiry sweep
//   report_content       one report per reporter, hide at 3 distinct reporters,
//                        board/secretary hides at once, 20/hour (REPORT_RATE_LIMITED)
//   raise_sos            3 per 10 min per user (SOS_RATE_LIMITED)
//   claim_guard          keeps an existing profile name; explicit p_society_id
//   register_push_token  token moves to the signed-in account
//   public lead forms    per-prefix insert throttle (RATE_LIMITED)
//
// Test phones +919000000008..012 are in [auth.sms.test_otp] and not used by any
// other suite. File parallelism is off (vitest.config.js).
//
// JavaScript only — no TypeScript.

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { anonClient } from "./helpers/phase3.js";
import {
  adminClient,
  refreshSession,
  seedAmenity,
  seedPost,
  seedTestSociety,
  signInAsMember,
  signInAsSecretary,
  signInTestPhone,
} from "./helpers/phase6.js";

const societyA = seedTestSociety("A"); // flatId = A-101, flat2Id = A-102
const societyB = seedTestSociety("B");

const MEMBER_X_PHONE = "+919000000008"; // A-101
const MEMBER_Y_PHONE = "+919000000009"; // A-102
const MEMBER_Z_PHONE = "+919000000010"; // A-101 (second resident of the same flat)
const SECRETARY_PHONE = "+919000000011"; // A-102
const GUARD_PHONE = "+919000000012";
const GUARD_PHONE_10 = GUARD_PHONE.slice(-10);

let memberX;
let memberY;
let memberZ;
let secretary;
let guard; // { userId, client } with guard_society_id = A

const cleanup = {
  amenityIds: [],
  postIds: [],
  notificationIds: [],
  facilityEventIds: [],
  leadPhones: [],
  pushTokens: [],
};

function errText(error) {
  return String(error?.message ?? "");
}

/** ISO timestamp for `hourIst`:00 IST, `daysAhead` days from now. */
function istSlot(daysAhead, hourIst) {
  const IST_OFFSET_MS = 5.5 * 3600 * 1000;
  const day = new Date(Date.now() + daysAhead * 86_400_000 + IST_OFFSET_MS)
    .toISOString()
    .slice(0, 10);
  const utcMs = Date.parse(`${day}T00:00:00Z`) + hourIst * 3600 * 1000 - IST_OFFSET_MS;
  return new Date(utcMs).toISOString();
}

async function signInGuard() {
  const admin = adminClient();
  await admin.from("society_guards").delete().eq("phone", GUARD_PHONE_10);

  const { error: addErr } = await secretary.client.rpc("secretary_add_guard", {
    p_society_id: societyA.societyId,
    p_name: "Gate Ramesh",
    p_phone: GUARD_PHONE_10,
  });
  if (addErr) throw new Error(`secretary_add_guard: ${addErr.message}`);

  const session = await signInTestPhone(GUARD_PHONE, "member");
  await admin.from("society_memberships").delete().eq("user_id", session.userId);
  return session;
}

beforeAll(async () => {
  memberX = await signInAsMember(MEMBER_X_PHONE, societyA.societyId, societyA.flatId);
  memberY = await signInAsMember(MEMBER_Y_PHONE, societyA.societyId, societyA.flat2Id);
  memberZ = await signInAsMember(MEMBER_Z_PHONE, societyA.societyId, societyA.flatId);
  secretary = await signInAsSecretary(SECRETARY_PHONE, societyA.societyId, societyA.flat2Id);
}, 180_000);

afterAll(async () => {
  const admin = adminClient();
  const userIds = [memberX, memberY, memberZ, secretary, guard]
    .filter(Boolean)
    .map((u) => u.userId);

  if (cleanup.postIds.length > 0) {
    await admin.from("reports").delete().in("target_id", cleanup.postIds);
    await admin.from("moderation_events").delete().in("target_id", cleanup.postIds);
    await admin.from("posts").delete().in("id", cleanup.postIds);
  }
  if (cleanup.amenityIds.length > 0) {
    await admin.from("bookings").delete().in("amenity_id", cleanup.amenityIds);
    await admin.from("amenities").delete().in("id", cleanup.amenityIds);
  }
  if (cleanup.facilityEventIds.length > 0) {
    await admin.from("facility_events").delete().in("id", cleanup.facilityEventIds);
  }
  if (cleanup.notificationIds.length > 0) {
    await admin.from("notifications").delete().in("id", cleanup.notificationIds);
  }
  if (cleanup.leadPhones.length > 0) {
    await admin.from("society_enrollment_requests").delete().in("phone", cleanup.leadPhones);
  }
  if (cleanup.pushTokens.length > 0) {
    await admin.from("push_tokens").delete().in("expo_token", cleanup.pushTokens);
  }
  if (userIds.length > 0) {
    await admin.from("sos_alerts").delete().in("raised_by", userIds);
    await admin.from("reports").delete().in("reporter_id", userIds);
    await admin.from("visitor_requests").delete().in("decided_by", userIds);
    await admin.from("audit_log").delete().in("actor_id", userIds);
  }
  await admin.from("visitor_requests").delete().eq("visitor_name", "Logic test visitor");
  await admin.from("society_guards").delete().eq("phone", GUARD_PHONE_10);
});

// ---------------------------------------------------------------------------
// request_booking
// ---------------------------------------------------------------------------
describe("request_booking guards", () => {
  let amenityId;

  beforeAll(async () => {
    amenityId = await seedAmenity(societyA.societyId, {
      name: `Logic hall ${Date.now()}`,
      openTime: "06:00",
      closeTime: "22:00",
      isCustom: true,
    });
    cleanup.amenityIds.push(amenityId);
  });

  it("rejects NULL start/end with INVALID_TIME (no unbounded range)", async () => {
    const { data, error } = await memberX.client.rpc("request_booking", {
      p_amenity_id: amenityId,
      p_starts_at: null,
      p_ends_at: istSlot(2, 11),
    });
    expect(data).toBeNull();
    expect(errText(error)).toContain("INVALID_TIME");

    const { error: endErr } = await memberX.client.rpc("request_booking", {
      p_amenity_id: amenityId,
      p_starts_at: istSlot(2, 10),
      p_ends_at: null,
    });
    expect(errText(endErr)).toContain("INVALID_TIME");

    const admin = adminClient();
    const { data: rows } = await admin.from("bookings").select("id").eq("amenity_id", amenityId);
    expect(rows ?? []).toHaveLength(0);
  });

  it("allows 5 pending requests per user per amenity, then TOO_MANY_PENDING", async () => {
    for (let i = 0; i < 5; i++) {
      const { error } = await memberX.client.rpc("request_booking", {
        p_amenity_id: amenityId,
        p_starts_at: istSlot(2, 10 + i),
        p_ends_at: istSlot(2, 11 + i),
        p_purpose: `slot ${i}`,
      });
      expect(error).toBeNull();
    }

    const { data, error } = await memberX.client.rpc("request_booking", {
      p_amenity_id: amenityId,
      p_starts_at: istSlot(3, 10),
      p_ends_at: istSlot(3, 11),
    });
    expect(data).toBeNull();
    expect(errText(error)).toContain("TOO_MANY_PENDING");

    // The cap is per user: another member can still request.
    const { error: otherErr } = await memberY.client.rpc("request_booking", {
      p_amenity_id: amenityId,
      p_starts_at: istSlot(3, 10),
      p_ends_at: istSlot(3, 11),
    });
    expect(otherErr).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// add_facility_event
// ---------------------------------------------------------------------------
describe("add_facility_event with an empty note", () => {
  it("succeeds and the notification body falls back to the title", async () => {
    const title = `Tank cleaning ${Date.now()}`;
    const { data, error } = await secretary.client.rpc("add_facility_event", {
      p_society_id: societyA.societyId,
      p_category: "water_shutdown",
      p_title: title,
      p_note: "   ",
      p_starts_at: istSlot(2, 9),
    });
    expect(error).toBeNull();
    expect(data?.id).toBeTruthy();
    cleanup.facilityEventIds.push(data.id);

    const admin = adminClient();
    const { data: notes } = await admin
      .from("notifications")
      .select("id, title, body")
      .eq("society_id", societyA.societyId)
      .eq("title", title);
    expect(notes).toHaveLength(1);
    expect(notes[0].body).toBe(title);
    cleanup.notificationIds.push(notes[0].id);
  });
});

// ---------------------------------------------------------------------------
// claim_guard + visitors
// ---------------------------------------------------------------------------
describe("claim_guard keeps the existing profile name", () => {
  it("links the guard row without overwriting profiles.full_name", async () => {
    const session = await signInGuard();
    const admin = adminClient();
    const { data: before } = await admin
      .from("profiles")
      .select("full_name")
      .eq("user_id", session.userId)
      .single();
    expect(before.full_name).toBeTruthy();

    const { data, error } = await session.client.rpc("claim_guard");
    expect(error).toBeNull();
    expect(data.society_id).toBe(societyA.societyId);

    const { data: after } = await admin
      .from("profiles")
      .select("full_name")
      .eq("user_id", session.userId)
      .single();
    expect(after.full_name).toBe(before.full_name);
    expect(after.full_name).not.toBe("Gate Ramesh");

    const refreshed = await refreshSession(session.session.refresh_token);
    guard = { userId: session.userId, client: refreshed.client };
  });
});

describe("visitor decisions", () => {
  async function createVisit() {
    const { data, error } = await guard.client.rpc("guard_create_visit", {
      p_flat_id: societyA.flatId,
      p_visitor_name: "Logic test visitor",
    });
    if (error) throw new Error(`guard_create_visit: ${error.message}`);
    return data.request_id;
  }

  it("the first decision wins; a second one gets ALREADY_DECIDED", async () => {
    const requestId = await createVisit();

    const { data, error } = await memberX.client.rpc("resident_decide_visit", {
      p_request_id: requestId,
      p_approve: true,
    });
    expect(error).toBeNull();
    expect(data.status).toBe("approved");

    const { error: second } = await memberZ.client.rpc("resident_decide_visit", {
      p_request_id: requestId,
      p_approve: false,
    });
    expect(errText(second)).toContain("ALREADY_DECIDED");

    const admin = adminClient();
    const { data: row } = await admin
      .from("visitor_requests")
      .select("status, decided_by")
      .eq("id", requestId)
      .single();
    expect(row.status).toBe("approved");
    expect(row.decided_by).toBe(memberX.userId);
  });

  it("concurrent decisions: exactly one succeeds", async () => {
    const requestId = await createVisit();
    const [a, b] = await Promise.all([
      memberX.client.rpc("resident_decide_visit", { p_request_id: requestId, p_approve: false }),
      memberZ.client.rpc("resident_decide_visit", { p_request_id: requestId, p_approve: true }),
    ]);
    const successes = [a, b].filter((r) => r.error === null);
    const failures = [a, b].filter((r) => r.error !== null);
    expect(successes).toHaveLength(1);
    expect(failures).toHaveLength(1);
    expect(errText(failures[0].error)).toContain("ALREADY_DECIDED");
  });

  it("a request older than 30 minutes cannot be decided (VISIT_EXPIRED) and is swept to expired", async () => {
    const requestId = await createVisit();
    const admin = adminClient();
    await admin
      .from("visitor_requests")
      .update({ created_at: new Date(Date.now() - 31 * 60 * 1000).toISOString() })
      .eq("id", requestId);

    const { error } = await memberX.client.rpc("resident_decide_visit", {
      p_request_id: requestId,
      p_approve: true,
    });
    expect(errText(error)).toContain("VISIT_EXPIRED");

    // The guard's next request lazily expires stale pending ones.
    await createVisit();
    const { data: row } = await admin
      .from("visitor_requests")
      .select("status, decided_by")
      .eq("id", requestId)
      .single();
    expect(row.status).toBe("expired");
    expect(row.decided_by).toBeNull();
  });

  it("a resident of another flat cannot decide (NOT_YOUR_FLAT)", async () => {
    const requestId = await createVisit();
    const { error } = await memberY.client.rpc("resident_decide_visit", {
      p_request_id: requestId,
      p_approve: true,
    });
    expect(errText(error)).toContain("NOT_YOUR_FLAT");
  });

  it("throttles a guard at 30 requests per 10 minutes (VISIT_RATE_LIMITED)", async () => {
    const admin = adminClient();
    const { data: g } = await admin
      .from("society_guards")
      .select("id")
      .eq("user_id", guard.userId)
      .eq("society_id", societyA.societyId)
      .single();
    await admin.from("visitor_requests").delete().eq("guard_id", g.id);

    for (let i = 0; i < 30; i++) {
      await createVisit();
    }
    const { data, error } = await guard.client.rpc("guard_create_visit", {
      p_flat_id: societyA.flatId,
      p_visitor_name: "Logic test visitor",
    });
    expect(data).toBeNull();
    expect(errText(error)).toContain("VISIT_RATE_LIMITED");
  }, 90_000);
});

describe("claim_guard with an explicit society", () => {
  it("claims the requested society when one phone guards two societies", async () => {
    const admin = adminClient();
    const { error: insErr } = await admin.from("society_guards").insert({
      society_id: societyB.societyId,
      name: "Gate B",
      phone: GUARD_PHONE_10,
    });
    expect(insErr).toBeNull();

    const { data, error } = await guard.client.rpc("claim_guard", {
      p_society_id: societyB.societyId,
    });
    expect(error).toBeNull();
    expect(data.society_id).toBe(societyB.societyId);

    // A society where this phone is not a guard → NOT_A_GUARD.
    const { error: wrong } = await guard.client.rpc("claim_guard", {
      p_society_id: "00000000-0000-0000-0000-0000000000ff",
    });
    expect(errText(wrong)).toContain("NOT_A_GUARD");
  });
});

// ---------------------------------------------------------------------------
// report_content
// ---------------------------------------------------------------------------
describe("report_content threshold + dedupe", () => {
  let postId;

  beforeAll(async () => {
    postId = await seedPost({
      societyId: societyA.societyId,
      authorId: secretary.userId,
      authorFlatId: societyA.flat2Id,
      body: "Threshold probe",
    });
    cleanup.postIds.push(postId);
  });

  async function hiddenAt(id) {
    const { data } = await adminClient().from("posts").select("hidden_at").eq("id", id).single();
    return data.hidden_at;
  }

  it("one member's report does not hide the post", async () => {
    const { data, error } = await memberX.client.rpc("report_content", {
      p_target_kind: "post",
      p_target_id: postId,
      p_reason: "spam",
    });
    expect(error).toBeNull();
    expect(data.hidden).toBe(false);
    expect(data.already_reported).toBe(false);
    expect(await hiddenAt(postId)).toBeNull();
  });

  it("the same reporter again is idempotent (no second row, no extra vote)", async () => {
    const { data, error } = await memberX.client.rpc("report_content", {
      p_target_kind: "post",
      p_target_id: postId,
      p_reason: "harassment",
    });
    expect(error).toBeNull();
    expect(data.already_reported).toBe(true);
    expect(data.hidden).toBe(false);

    const { data: rows } = await adminClient()
      .from("reports")
      .select("id")
      .eq("target_kind", "post")
      .eq("target_id", postId);
    expect(rows).toHaveLength(1);
  });

  it("hides after the third distinct reporter", async () => {
    const second = await memberY.client.rpc("report_content", {
      p_target_kind: "post",
      p_target_id: postId,
      p_reason: "spam",
    });
    expect(second.error).toBeNull();
    expect(second.data.hidden).toBe(false);
    expect(await hiddenAt(postId)).toBeNull();

    const third = await memberZ.client.rpc("report_content", {
      p_target_kind: "post",
      p_target_id: postId,
      p_reason: "spam",
    });
    expect(third.error).toBeNull();
    expect(third.data.hidden).toBe(true);
    expect(third.data.report_count).toBe(3);
    expect(await hiddenAt(postId)).not.toBeNull();
  });

  it("a secretary's report hides immediately", async () => {
    const otherPost = await seedPost({
      societyId: societyA.societyId,
      authorId: memberX.userId,
      authorFlatId: societyA.flatId,
      body: "Secretary-hide probe",
    });
    cleanup.postIds.push(otherPost);

    const { data, error } = await secretary.client.rpc("report_content", {
      p_target_kind: "post",
      p_target_id: otherPost,
      p_reason: "inappropriate",
    });
    expect(error).toBeNull();
    expect(data.hidden).toBe(true);
  });

  it("rate-limits a reporter at 20 reports per hour (REPORT_RATE_LIMITED)", async () => {
    const admin = adminClient();
    const { data: seeded, error: seedErr } = await admin
      .from("posts")
      .insert(
        Array.from({ length: 21 }, (_, i) => ({
          society_id: societyA.societyId,
          author_id: secretary.userId,
          author_flat_id: societyA.flat2Id,
          kind: "general",
          body: `Rate probe ${i}`,
        })),
      )
      .select("id");
    expect(seedErr).toBeNull();
    const ids = seeded.map((p) => p.id);
    cleanup.postIds.push(...ids);

    // memberY already has 1 report this hour; add 19 more directly → 20.
    const { error: repErr } = await admin.from("reports").insert(
      ids.slice(0, 19).map((id) => ({
        society_id: societyA.societyId,
        target_kind: "post",
        target_id: id,
        reporter_id: memberY.userId,
        reason: "spam",
      })),
    );
    expect(repErr).toBeNull();

    const { data, error } = await memberY.client.rpc("report_content", {
      p_target_kind: "post",
      p_target_id: ids[20],
      p_reason: "spam",
    });
    expect(data).toBeNull();
    expect(errText(error)).toContain("REPORT_RATE_LIMITED");
  });
});

// ---------------------------------------------------------------------------
// raise_sos
// ---------------------------------------------------------------------------
describe("raise_sos throttle", () => {
  it("allows 3 alerts per 10 minutes, then SOS_RATE_LIMITED", async () => {
    const admin = adminClient();
    await admin.from("sos_alerts").delete().eq("raised_by", memberY.userId);

    for (let i = 0; i < 3; i++) {
      const { error } = await memberY.client.rpc("raise_sos", {
        p_society_id: societyA.societyId,
        p_description: `Logic SOS ${i}`,
        p_audience: "all",
      });
      expect(error).toBeNull();
    }
    const { data, error } = await memberY.client.rpc("raise_sos", {
      p_society_id: societyA.societyId,
      p_description: "Logic SOS 4",
      p_audience: "all",
    });
    expect(data).toBeNull();
    expect(errText(error)).toContain("SOS_RATE_LIMITED");
  });
});

// ---------------------------------------------------------------------------
// register_push_token / unregister_push_token
// ---------------------------------------------------------------------------
describe("register_push_token", () => {
  it("moves a device token to the account that signed in last", async () => {
    const token = `ExpoPushToken[logic-${Date.now()}]`;
    cleanup.pushTokens.push(token);
    const admin = adminClient();

    const first = await memberX.client.rpc("register_push_token", {
      p_token: token,
      p_platform: "android",
    });
    expect(first.error).toBeNull();

    // A direct upsert by a different account cannot take the row over (RLS, and since 057 no INSERT/UPDATE grant)…
    const direct = await memberY.client
      .from("push_tokens")
      .upsert(
        { user_id: memberY.userId, expo_token: token, platform: "android" },
        { onConflict: "expo_token" },
      );
    expect(direct.error).not.toBeNull();

    // …but the RPC does.
    const second = await memberY.client.rpc("register_push_token", {
      p_token: token,
      p_platform: "android",
    });
    expect(second.error).toBeNull();

    const { data: rows } = await admin
      .from("push_tokens")
      .select("user_id")
      .eq("expo_token", token);
    expect(rows).toHaveLength(1);
    expect(rows[0].user_id).toBe(memberY.userId);

    // Only the current owner can unregister.
    const notOwner = await memberX.client.rpc("unregister_push_token", { p_token: token });
    expect(notOwner.error).toBeNull();
    expect(notOwner.data).toBe(false);
    const owner = await memberY.client.rpc("unregister_push_token", { p_token: token });
    expect(owner.data).toBe(true);

    const { data: gone } = await admin.from("push_tokens").select("id").eq("expo_token", token);
    expect(gone ?? []).toHaveLength(0);
  });

  it("rejects an unknown platform", async () => {
    const { error } = await memberX.client.rpc("register_push_token", {
      p_token: "ExpoPushToken[bad-platform]",
      p_platform: "symbian",
    });
    expect(errText(error)).toContain("INVALID_PLATFORM");
  });
});

// ---------------------------------------------------------------------------
// Public lead form throttle
// ---------------------------------------------------------------------------
describe("public enrollment form throttle", () => {
  it("accepts 5 requests per phone prefix per hour, then RATE_LIMITED", async () => {
    const anon = anonClient();
    const admin = adminClient();
    const phones = Array.from({ length: 6 }, (_, i) => `+9187654${String(i).padStart(5, "0")}`);
    cleanup.leadPhones.push(...phones);
    await admin.from("society_enrollment_requests").delete().in("phone", phones);

    for (const phone of phones.slice(0, 5)) {
      const { error } = await anon.from("society_enrollment_requests").insert({
        society_name: "Logic Heights",
        contact_name: "Logic Tester",
        phone,
        preferred_slot: "Morning",
        // enrollment_validate_slot (017) requires call_now or preferred_at.
        call_now: true,
      });
      expect(error).toBeNull();
    }
    const { error } = await anon.from("society_enrollment_requests").insert({
      society_name: "Logic Heights",
      contact_name: "Logic Tester",
      phone: phones[5],
      preferred_slot: "Morning",
      call_now: true,
    });
    expect(errText(error)).toContain("RATE_LIMITED");
  });
});
