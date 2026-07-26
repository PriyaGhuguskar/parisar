// Unit tests for the non-Supabase logic in src/bookings.js.
// Real DB behavior is exercised by tests/isolation/bookings.test.js (Plan 05-01).

import { describe, expect, it, vi } from "vitest";
import {
  approveBooking,
  BOOKING_STATUS,
  rejectBooking,
  requestBooking,
  subscribeToBookings,
} from "../bookings.js";

function makeRpcClient(rpcImpl) {
  return { rpc: vi.fn(rpcImpl) };
}

function makeChannelClient() {
  const subscribeFn = vi.fn(function subscribeFn(cb) {
    if (cb) cb("SUBSCRIBED");
    return this;
  });
  const onFn = vi.fn(function onFn() {
    return this;
  });
  const channel = { on: onFn, subscribe: subscribeFn };
  const channelFn = vi.fn(() => channel);
  const removeChannel = vi.fn();
  return { client: { channel: channelFn, removeChannel }, channel, onFn, removeChannel };
}

// ---------------------------------------------------------------------------
// Enum re-export
// ---------------------------------------------------------------------------

describe("enum re-export", () => {
  it("re-exports BOOKING_STATUS with pending + approved + rejected", () => {
    expect(BOOKING_STATUS.PENDING).toBe("pending");
    expect(BOOKING_STATUS.APPROVED).toBe("approved");
    expect(BOOKING_STATUS.REJECTED).toBe("rejected");
  });
});

// ---------------------------------------------------------------------------
// requestBooking — p_ named params, returns bookingId
// ---------------------------------------------------------------------------

describe("requestBooking", () => {
  it("passes p_amenity_id/p_starts_at/p_ends_at/p_purpose and returns bookingId", async () => {
    const supabase = makeRpcClient(async () => ({ data: { booking_id: "b-1" }, error: null }));
    const result = await requestBooking(supabase, {
      amenityId: "a-1",
      startsAt: "2026-06-01T12:30:00.000Z",
      endsAt: "2026-06-01T14:30:00.000Z",
      purpose: "Birthday",
    });
    expect(result).toEqual({ bookingId: "b-1" });
    expect(supabase.rpc).toHaveBeenCalledWith("request_booking", {
      p_amenity_id: "a-1",
      p_starts_at: "2026-06-01T12:30:00.000Z",
      p_ends_at: "2026-06-01T14:30:00.000Z",
      p_purpose: "Birthday",
    });
  });

  it("defaults purpose to null", async () => {
    const supabase = makeRpcClient(async () => ({ data: { booking_id: "b-2" }, error: null }));
    await requestBooking(supabase, {
      amenityId: "a-1",
      startsAt: "2026-06-01T12:30:00.000Z",
      endsAt: "2026-06-01T13:30:00.000Z",
    });
    expect(supabase.rpc.mock.calls[0][1].p_purpose).toBeNull();
  });

  it("propagates the RPC's named validation error (LEAD_TIME etc.)", async () => {
    const err = new Error("LEAD_TIME");
    const supabase = makeRpcClient(async () => ({ data: null, error: err }));
    await expect(
      requestBooking(supabase, {
        amenityId: "a-1",
        startsAt: "x",
        endsAt: "y",
      }),
    ).rejects.toBe(err);
  });
});

// ---------------------------------------------------------------------------
// approveBooking — pass-through of {approved, reason?, booking?}, no raw throw
// ---------------------------------------------------------------------------

describe("approveBooking", () => {
  it("returns {approved:true, booking} on win", async () => {
    const booking = { id: "b-1", status: "approved" };
    const supabase = makeRpcClient(async () => ({
      data: { approved: true, booking },
      error: null,
    }));
    const result = await approveBooking(supabase, { bookingId: "b-1" });
    expect(result).toEqual({ approved: true, booking });
    expect(supabase.rpc).toHaveBeenCalledWith("approve_booking", { p_booking_id: "b-1" });
  });

  it("returns {approved:false, reason:'slot_taken'} WITHOUT throwing (BOOK-05)", async () => {
    const supabase = makeRpcClient(async () => ({
      data: { approved: false, reason: "slot_taken" },
      error: null,
    }));
    const result = await approveBooking(supabase, { bookingId: "b-1" });
    expect(result).toEqual({ approved: false, reason: "slot_taken" });
  });

  it("returns {approved:false, reason:'race_lost_or_not_pending'} WITHOUT throwing", async () => {
    const supabase = makeRpcClient(async () => ({
      data: { approved: false, reason: "race_lost_or_not_pending" },
      error: null,
    }));
    const result = await approveBooking(supabase, { bookingId: "b-1" });
    expect(result).toEqual({ approved: false, reason: "race_lost_or_not_pending" });
  });

  it("throws only on a genuine RPC error (not a typed business result)", async () => {
    const err = new Error("INSUFFICIENT_ROLE");
    const supabase = makeRpcClient(async () => ({ data: null, error: err }));
    await expect(approveBooking(supabase, { bookingId: "b-1" })).rejects.toBe(err);
  });
});

// ---------------------------------------------------------------------------
// rejectBooking — p_booking_id + p_reason
// ---------------------------------------------------------------------------

describe("rejectBooking", () => {
  it("passes p_booking_id + p_reason", async () => {
    const supabase = makeRpcClient(async () => ({
      data: { rejected: true },
      error: null,
    }));
    const result = await rejectBooking(supabase, { bookingId: "b-1", reason: "Maintenance" });
    expect(result).toEqual({ rejected: true });
    expect(supabase.rpc).toHaveBeenCalledWith("reject_booking", {
      p_booking_id: "b-1",
      p_reason: "Maintenance",
    });
  });

  it("defaults reason to null", async () => {
    const supabase = makeRpcClient(async () => ({ data: {}, error: null }));
    await rejectBooking(supabase, { bookingId: "b-1" });
    expect(supabase.rpc.mock.calls[0][1].p_reason).toBeNull();
  });

  it("throws on RPC errors", async () => {
    const err = new Error("INSUFFICIENT_ROLE");
    const supabase = makeRpcClient(async () => ({ data: null, error: err }));
    await expect(rejectBooking(supabase, { bookingId: "b-1" })).rejects.toBe(err);
  });
});

// ---------------------------------------------------------------------------
// subscribeToBookings — INSERT+UPDATE channel scoped by societyId
// ---------------------------------------------------------------------------

describe("subscribeToBookings", () => {
  it("subscribes to INSERT + UPDATE on bookings filtered by society_id", () => {
    const { client, channel, onFn, removeChannel } = makeChannelClient();
    const handlers = { onInsert: vi.fn(), onUpdate: vi.fn(), onConnected: vi.fn() };

    const cleanup = subscribeToBookings(client, "soc-1", handlers);

    expect(client.channel).toHaveBeenCalledWith("bookings-soc-1");
    expect(onFn).toHaveBeenCalledTimes(2);
    expect(onFn.mock.calls[0][1]).toMatchObject({
      event: "INSERT",
      schema: "public",
      table: "bookings",
      filter: "society_id=eq.soc-1",
    });
    expect(onFn.mock.calls[1][1]).toMatchObject({
      event: "UPDATE",
      schema: "public",
      table: "bookings",
      filter: "society_id=eq.soc-1",
    });
    expect(handlers.onConnected).toHaveBeenCalledOnce();

    onFn.mock.calls[1][2]({ new: { id: "b-1", status: "approved" } });
    expect(handlers.onUpdate).toHaveBeenCalledWith({ id: "b-1", status: "approved" });

    cleanup();
    expect(removeChannel).toHaveBeenCalledWith(channel);
  });

  it("does not throw when handlers are omitted", () => {
    const { client } = makeChannelClient();
    expect(() => subscribeToBookings(client, "soc-1", {})).not.toThrow();
  });
});
