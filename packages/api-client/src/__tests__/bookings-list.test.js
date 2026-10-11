// listBookings / listBookingsPage — the board queue must never truncate pending
// requests behind a long decided history (CODE-REVIEW HIGH: bookings.js queue).

import { describe, expect, it, vi } from "vitest";
import {
  BOOKING_REQUEST_ERROR_CODES,
  bookingErrorCode,
  listBookings,
  listBookingsPage,
  PENDING_QUEUE_MAX,
} from "../bookings.js";

// Records every builder call per `from()` invocation and resolves each query with
// the next queued result.
function makeBookingsClient(results) {
  const queries = [];
  const from = vi.fn((table) => {
    const calls = [];
    const result = results[queries.length];
    queries.push({ table, calls });
    const builder = {};
    for (const m of ["select", "eq", "neq", "order", "or", "lt"]) {
      builder[m] = vi.fn((...args) => {
        calls.push([m, ...args]);
        return builder;
      });
    }
    builder.limit = vi.fn(async (n) => {
      calls.push(["limit", n]);
      return result;
    });
    return builder;
  });
  return { client: { from }, queries };
}

const pendingRow = { id: "p1", status: "pending", created_at: "2026-10-01T00:00:00Z" };
const decidedRow = (id) => ({ id, status: "approved", created_at: "2026-09-01T00:00:00Z" });

describe("listBookingsPage — queue mode", () => {
  it("fetches pending with a status='pending' filter in its own query, soonest slot first", async () => {
    const { client, queries } = makeBookingsClient([
      { data: [pendingRow], error: null },
      { data: [decidedRow("d1")], error: null },
    ]);
    await listBookingsPage(client, { mode: "queue", limit: 30 });

    const pendingCalls = queries[0].calls;
    expect(pendingCalls).toContainEqual(["eq", "status", "pending"]);
    expect(pendingCalls).toContainEqual(["order", "time_range", { ascending: true }]);
    expect(pendingCalls).toContainEqual(["limit", PENDING_QUEUE_MAX]);

    const decidedCalls = queries[1].calls;
    expect(decidedCalls).toContainEqual(["neq", "status", "pending"]);
    expect(decidedCalls).toContainEqual(["order", "created_at", { ascending: false }]);
    expect(decidedCalls).toContainEqual(["limit", 30]);
  });

  it("returns pending first even when the decided page is full", async () => {
    const decided = [decidedRow("d1"), decidedRow("d2")];
    const { client } = makeBookingsClient([
      { data: [pendingRow], error: null },
      { data: decided, error: null },
    ]);
    const { rows, nextCursor } = await listBookingsPage(client, { mode: "queue", limit: 2 });
    expect(rows.map((r) => r.id)).toEqual(["p1", "d1", "d2"]);
    expect(nextCursor).toEqual({ createdAt: "2026-09-01T00:00:00Z", id: "d2" });
  });

  it("skips the pending query on later pages and applies the composite cursor", async () => {
    const { client, queries } = makeBookingsClient([{ data: [], error: null }]);
    const cursor = {
      createdAt: "2026-09-01T00:00:00Z",
      id: "11111111-1111-4111-8111-111111111111",
    };
    const { rows, nextCursor } = await listBookingsPage(client, { mode: "queue", cursor });
    expect(queries).toHaveLength(1);
    expect(queries[0].calls.some(([m]) => m === "or")).toBe(true);
    expect(rows).toEqual([]);
    expect(nextCursor).toBeNull();
  });

  it("throws when the pending query fails", async () => {
    const err = new Error("rls");
    const { client } = makeBookingsClient([{ data: null, error: err }]);
    await expect(listBookingsPage(client, { mode: "queue" })).rejects.toBe(err);
  });
});

describe("listBookings — mine mode", () => {
  it("returns the requester's rows newest first (single query, no status filter)", async () => {
    const { client, queries } = makeBookingsClient([{ data: [decidedRow("d1")], error: null }]);
    const rows = await listBookings(client, { mode: "mine" });
    expect(rows).toEqual([decidedRow("d1")]);
    expect(queries).toHaveLength(1);
    expect(queries[0].calls.some(([m]) => m === "eq" || m === "neq")).toBe(false);
  });
});

describe("bookingErrorCode", () => {
  it("extracts the contract-055 codes INVALID_TIME and TOO_MANY_PENDING", () => {
    expect(bookingErrorCode(new Error("INVALID_TIME"))).toBe("INVALID_TIME");
    expect(bookingErrorCode({ message: "P0001: TOO_MANY_PENDING" })).toBe("TOO_MANY_PENDING");
    expect(BOOKING_REQUEST_ERROR_CODES).toContain("TIME_ORDER");
  });

  it("returns null for unknown errors", () => {
    expect(bookingErrorCode(new Error("network"))).toBeNull();
    expect(bookingErrorCode(null)).toBeNull();
  });
});
