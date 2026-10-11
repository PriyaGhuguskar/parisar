import { describe, expect, it, vi } from "vitest";
import { applyNewestFirstCursor, nextCursorFrom } from "../pagination.js";

function makeBuilder() {
  const builder = {};
  for (const m of ["order", "lt", "or"]) {
    builder[m] = vi.fn(() => builder);
  }
  return builder;
}

const ID = "11111111-1111-4111-8111-111111111111";

describe("applyNewestFirstCursor", () => {
  it("orders by (created_at desc, id desc) with no cursor", () => {
    const q = makeBuilder();
    applyNewestFirstCursor(q, null);
    expect(q.order).toHaveBeenNthCalledWith(1, "created_at", { ascending: false });
    expect(q.order).toHaveBeenNthCalledWith(2, "id", { ascending: false });
    expect(q.lt).not.toHaveBeenCalled();
    expect(q.or).not.toHaveBeenCalled();
  });

  it("keeps accepting a legacy ISO-string cursor", () => {
    const q = makeBuilder();
    applyNewestFirstCursor(q, "2026-10-01T00:00:00Z");
    expect(q.lt).toHaveBeenCalledWith("created_at", "2026-10-01T00:00:00Z");
  });

  it("builds a composite (created_at, id) keyset filter", () => {
    const q = makeBuilder();
    applyNewestFirstCursor(q, { createdAt: "2026-10-01T00:00:00Z", id: ID });
    expect(q.or).toHaveBeenCalledWith(
      `created_at.lt.2026-10-01T00:00:00Z,and(created_at.eq.2026-10-01T00:00:00Z,id.lt.${ID})`,
    );
  });

  it("rejects values that could inject PostgREST filter syntax", () => {
    expect(() => applyNewestFirstCursor(makeBuilder(), "2026-10-01,id.gt.0")).toThrow(
      "INVALID_CURSOR",
    );
    expect(() =>
      applyNewestFirstCursor(makeBuilder(), { createdAt: "2026-10-01T00:00:00Z", id: "x),or(" }),
    ).toThrow("INVALID_CURSOR");
    expect(() => applyNewestFirstCursor(makeBuilder(), { createdAt: "yesterday" })).toThrow(
      "INVALID_CURSOR",
    );
  });
});

describe("nextCursorFrom", () => {
  it("returns the last row's (created_at, id) when the page is full", () => {
    const rows = [
      { id: "a", created_at: "2026-10-02T00:00:00Z" },
      { id: "b", created_at: "2026-10-01T00:00:00Z" },
    ];
    expect(nextCursorFrom(rows, 2)).toEqual({ createdAt: "2026-10-01T00:00:00Z", id: "b" });
  });

  it("returns null for a short or empty page", () => {
    expect(nextCursorFrom([{ id: "a", created_at: "x" }], 2)).toBeNull();
    expect(nextCursorFrom([], 0)).toBeNull();
    expect(nextCursorFrom(null, 10)).toBeNull();
  });
});
