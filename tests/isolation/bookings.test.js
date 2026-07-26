// Phase 5 bookings isolation + behavior tests (BOOK-01..07).
//
// Runs against the live local Supabase stack (no mock DB).
// File-parallelism is disabled by vitest.config.js.
//
// Covers:
//   - atomic first-approval race (BOOK-03): exactly one winner
//   - exclusion-constraint conflict (BOOK-05): overlapping APPROVED → slot_taken (23P01)
//   - partial-index non-block (BOOK-05): two PENDING overlaps both insert
//   - request_booking server-side guards (BOOK-01): LEAD_TIME/TOO_FAR/DURATION/OUTSIDE_HOURS
//   - cross-society isolation (BOOK-02/07): Society B board sees 0 Society A bookings
//   - reject_booking stores reason; approve denormalizes approver_flat_id (BOOK-04/06)
//
// JavaScript only — no TypeScript. Never chain .catch()/.then() on .rpc() (Pitfall 6).

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  adminClient,
  signInAsBoard,
  signInAsMember,
  seedTestSociety,
  seedAmenity,
  seedBooking,
  teardownPhase5,
  BOARD_A_PHONE,
  MEMBER_A_PHONE,
  BOARD_A2_PHONE,
  MEMBER_B_PHONE,
} from "./helpers/phase5.js";

const societyA = seedTestSociety("A");
const societyB = seedTestSociety("B");

let boardA; // Society A board member (approves)
let memberA; // Society A member (requests bookings)
let boardA2; // Society A 2nd board member (race test)
let memberB; // Society B member (cross-society)
let amenityA; // Society A amenity (06:00-22:00 default)

// Helper: ISO string N hours from now, on the hour boundary in UTC (kept inside
// the amenity IST window 06:00-22:00 → use mid-IST-day to stay safely in range).
function isoHoursFromNow(hours) {
  return new Date(Date.now() + hours * 3600_000).toISOString();
}

// A fixed slot inside the amenity's open IST window, far enough ahead to pass lead-time.
// 14:00-16:00 IST tomorrow → comfortably within 06:00-22:00 and < 30 days.
function istSlotTomorrow(startHourIst, endHourIst) {
  const now = new Date();
  // Build a UTC instant for "tomorrow HH:00 IST". IST = UTC+5:30.
  const d = new Date(now);
  d.setUTCDate(d.getUTCDate() + 1);
  const startUtcHour = startHourIst - 5.5;
  const endUtcHour = endHourIst - 5.5;
  const start = new Date(
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 0, 0, 0, 0),
  );
  start.setUTCMinutes(start.getUTCMinutes() + Math.round(startUtcHour * 60));
  const end = new Date(
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 0, 0, 0, 0),
  );
  end.setUTCMinutes(end.getUTCMinutes() + Math.round(endUtcHour * 60));
  return { startsAt: start.toISOString(), endsAt: end.toISOString() };
}

beforeAll(async () => {
  await teardownPhase5([societyA.societyId, societyB.societyId]);

  memberA = await signInAsMember(MEMBER_A_PHONE, societyA.societyId, societyA.flatId);
  boardA = await signInAsBoard(BOARD_A_PHONE, societyA.societyId, societyA.flat2Id);
  boardA2 = await signInAsBoard(BOARD_A2_PHONE, societyA.societyId, societyA.flat2Id);
  memberB = await signInAsMember(MEMBER_B_PHONE, societyB.societyId, societyB.flatId);

  amenityA = await seedAmenity(societyA.societyId, { name: "Clubhouse" });
}, 120_000);

afterAll(async () => {
  await teardownPhase5(
    [societyA.societyId, societyB.societyId],
    [memberA?.userId, boardA?.userId, boardA2?.userId, memberB?.userId].filter(Boolean),
  );
});

// ---------------------------------------------------------------------------
// BOOK-01: request_booking server-side guards.
// ---------------------------------------------------------------------------
describe("BOOK-01: request_booking guards", () => {
  it("accepts a valid slot inside amenity hours, >1h lead, <4h duration", async () => {
    const slot = istSlotTomorrow(14, 16);
    const { data, error } = await memberA.client.rpc("request_booking", {
      p_amenity_id: amenityA,
      p_starts_at: slot.startsAt,
      p_ends_at: slot.endsAt,
      p_purpose: "Birthday party",
    });
    expect(error).toBeNull();
    expect(data.booking_id).toBeTruthy();
    expect(data.society_id).toBe(societyA.societyId);
  });

  it("rejects lead-time < 1h (LEAD_TIME)", async () => {
    const { error } = await memberA.client.rpc("request_booking", {
      p_amenity_id: amenityA,
      p_starts_at: isoHoursFromNow(0.25),
      p_ends_at: isoHoursFromNow(1.25),
    });
    expect(error).not.toBeNull();
    expect(String(error.message)).toContain("LEAD_TIME");
  });

  it("rejects > 30 days ahead (TOO_FAR)", async () => {
    const { error } = await memberA.client.rpc("request_booking", {
      p_amenity_id: amenityA,
      p_starts_at: isoHoursFromNow(24 * 31),
      p_ends_at: isoHoursFromNow(24 * 31 + 1),
    });
    expect(error).not.toBeNull();
    expect(String(error.message)).toContain("TOO_FAR");
  });

  it("rejects > 4h duration (DURATION)", async () => {
    const slot = istSlotTomorrow(10, 16); // 6h
    const { error } = await memberA.client.rpc("request_booking", {
      p_amenity_id: amenityA,
      p_starts_at: slot.startsAt,
      p_ends_at: slot.endsAt,
    });
    expect(error).not.toBeNull();
    expect(String(error.message)).toContain("DURATION");
  });

  it("rejects a slot outside amenity open/close hours (OUTSIDE_HOURS)", async () => {
    const slot = istSlotTomorrow(4, 5); // 04:00-05:00 IST — before 06:00 open
    const { error } = await memberA.client.rpc("request_booking", {
      p_amenity_id: amenityA,
      p_starts_at: slot.startsAt,
      p_ends_at: slot.endsAt,
    });
    expect(error).not.toBeNull();
    expect(String(error.message)).toContain("OUTSIDE_HOURS");
  });
});

// ---------------------------------------------------------------------------
// BOOK-03: atomic first-approval — exactly one winner.
// ---------------------------------------------------------------------------
describe("BOOK-03: approve_booking atomic race", () => {
  it("two concurrent approve_booking calls — exactly one approved:true, one race_lost", async () => {
    const slot = istSlotTomorrow(8, 9);
    const bookingId = await seedBooking(societyA.societyId, amenityA, memberA.userId, {
      startsAt: slot.startsAt,
      endsAt: slot.endsAt,
      status: "pending",
      requesterFlatId: societyA.flatId,
    });

    const [r1, r2] = await Promise.all([
      boardA.client.rpc("approve_booking", { p_booking_id: bookingId }),
      boardA2.client.rpc("approve_booking", { p_booking_id: bookingId }),
    ]);

    const results = [r1.data, r2.data];
    const winners = results.filter((d) => d && d.approved === true);
    const losers = results.filter((d) => d && d.approved === false);
    expect(winners).toHaveLength(1);
    expect(losers).toHaveLength(1);
    expect(losers[0].reason).toBe("race_lost_or_not_pending");

    // DB state: approved by one of the two board users with denormalized approver_flat_id.
    const admin = adminClient();
    const { data: row } = await admin
      .from("bookings")
      .select("status, approved_by, approver_flat_id, approved_at")
      .eq("id", bookingId)
      .single();
    expect(row.status).toBe("approved");
    expect([boardA.userId, boardA2.userId]).toContain(row.approved_by);
    expect(row.approver_flat_id).toBe(societyA.flat2Id);
    expect(row.approved_at).toBeTruthy();
  });

  it("regular member cannot approve (INSUFFICIENT_ROLE)", async () => {
    const slot = istSlotTomorrow(9, 10);
    const bookingId = await seedBooking(societyA.societyId, amenityA, memberA.userId, {
      startsAt: slot.startsAt,
      endsAt: slot.endsAt,
      status: "pending",
      requesterFlatId: societyA.flatId,
    });
    const { error } = await memberA.client.rpc("approve_booking", { p_booking_id: bookingId });
    expect(error).not.toBeNull();
    expect(String(error.message)).toContain("INSUFFICIENT_ROLE");
  });
});

// ---------------------------------------------------------------------------
// BOOK-05: exclusion constraint — overlapping APPROVED bookings blocked (23P01);
//          pending/rejected overlaps do NOT block (partial-index proof).
// ---------------------------------------------------------------------------
describe("BOOK-05: btree_gist exclusion constraint", () => {
  it("approving a booking that overlaps an already-approved one returns slot_taken", async () => {
    // First booking 18:00-20:00 IST → approved.
    const slot1 = istSlotTomorrow(18, 20);
    const b1 = await seedBooking(societyA.societyId, amenityA, memberA.userId, {
      startsAt: slot1.startsAt,
      endsAt: slot1.endsAt,
      status: "pending",
      requesterFlatId: societyA.flatId,
    });
    const { data: approve1, error: e1 } = await boardA.client.rpc("approve_booking", {
      p_booking_id: b1,
    });
    expect(e1).toBeNull();
    expect(approve1.approved).toBe(true);

    // Overlapping booking 19:00-21:00 IST on the SAME amenity → pending insert is fine.
    const slot2 = istSlotTomorrow(19, 21);
    const b2 = await seedBooking(societyA.societyId, amenityA, memberA.userId, {
      startsAt: slot2.startsAt,
      endsAt: slot2.endsAt,
      status: "pending",
      requesterFlatId: societyA.flatId,
    });

    // Approving the overlap must be rejected by the exclusion constraint → slot_taken.
    const { data: approve2, error: e2 } = await boardA.client.rpc("approve_booking", {
      p_booking_id: b2,
    });
    expect(e2).toBeNull(); // 23P01 is caught and converted, never a raw error
    expect(approve2.approved).toBe(false);
    expect(approve2.reason).toBe("slot_taken");

    // DB: b2 is still pending (the approve was blocked).
    const admin = adminClient();
    const { data: row } = await admin
      .from("bookings")
      .select("status")
      .eq("id", b2)
      .single();
    expect(row.status).toBe("pending");
  });

  it("two PENDING overlapping bookings both insert (partial index does not block pending)", async () => {
    const slot = istSlotTomorrow(11, 12);
    const overlap = istSlotTomorrow(11, 13);
    const admin = adminClient();

    const b1 = await seedBooking(societyA.societyId, amenityA, memberA.userId, {
      startsAt: slot.startsAt,
      endsAt: slot.endsAt,
      status: "pending",
      requesterFlatId: societyA.flatId,
    });
    const b2 = await seedBooking(societyA.societyId, amenityA, memberA.userId, {
      startsAt: overlap.startsAt,
      endsAt: overlap.endsAt,
      status: "pending",
      requesterFlatId: societyA.flatId,
    });

    const { data: rows } = await admin
      .from("bookings")
      .select("id, status")
      .in("id", [b1, b2]);
    expect(rows).toHaveLength(2);
    expect(rows.every((r) => r.status === "pending")).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// BOOK-04/06: reject_booking stores reason; rejecter attribution.
// ---------------------------------------------------------------------------
describe("BOOK-04/06: reject_booking", () => {
  it("rejects a pending booking with a reason + denormalized rejecter_flat_id", async () => {
    const slot = istSlotTomorrow(7, 8);
    const bookingId = await seedBooking(societyA.societyId, amenityA, memberA.userId, {
      startsAt: slot.startsAt,
      endsAt: slot.endsAt,
      status: "pending",
      requesterFlatId: societyA.flatId,
    });
    const { data, error } = await boardA.client.rpc("reject_booking", {
      p_booking_id: bookingId,
      p_reason: "Clubhouse under maintenance",
    });
    expect(error).toBeNull();
    expect(data.rejected).toBe(true);

    const admin = adminClient();
    const { data: row } = await admin
      .from("bookings")
      .select("status, rejected_by, rejecter_flat_id, rejection_reason")
      .eq("id", bookingId)
      .single();
    expect(row.status).toBe("rejected");
    expect(row.rejected_by).toBe(boardA.userId);
    expect(row.rejecter_flat_id).toBe(societyA.flat2Id);
    expect(row.rejection_reason).toBe("Clubhouse under maintenance");
  });
});

// ---------------------------------------------------------------------------
// BOOK-02/07: cross-society isolation + requester sees own.
// ---------------------------------------------------------------------------
describe("BOOK-02/07: booking visibility RLS", () => {
  let bookingAId;

  beforeAll(async () => {
    const slot = istSlotTomorrow(12, 13);
    const { data } = await memberA.client.rpc("request_booking", {
      p_amenity_id: amenityA,
      p_starts_at: slot.startsAt,
      p_ends_at: slot.endsAt,
      p_purpose: "Visibility test",
    });
    bookingAId = data.booking_id;
  });

  it("Society A board member sees the Society A booking", async () => {
    const { data, error } = await boardA.client
      .from("bookings")
      .select("id, society_id")
      .eq("id", bookingAId);
    expect(error).toBeNull();
    expect(data).toHaveLength(1);
  });

  it("requester (member A) sees their own booking", async () => {
    const { data, error } = await memberA.client
      .from("bookings")
      .select("id, requester_id")
      .eq("id", bookingAId);
    expect(error).toBeNull();
    expect(data).toHaveLength(1);
    expect(data[0].requester_id).toBe(memberA.userId);
  });

  it("Society B board/member sees 0 Society A bookings (cross-society isolation)", async () => {
    const { data, error } = await memberB.client
      .from("bookings")
      .select("id, society_id")
      .eq("society_id", societyA.societyId);
    expect(error).toBeNull();
    expect(data ?? []).toHaveLength(0);
  });
});
