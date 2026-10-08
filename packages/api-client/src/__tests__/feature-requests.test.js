import { describe, expect, it, vi } from "vitest";
import { listSocietyFeatureState, requestFeatureChange } from "../feature-requests.js";

function sb(results) {
  return {
    from: vi.fn((table) => {
      const r = results[table];
      const q = {
        select: () => q,
        eq: () => q,
        order: () => q,
        then: (res, rej) => Promise.resolve(r).then(res, rej),
      };
      return q;
    }),
  };
}

describe("listSocietyFeatureState", () => {
  const catalogue = {
    data: [
      {
        key: "notices",
        name: "Notice Board",
        description: null,
        price_monthly: 0,
        is_core: true,
        sort_order: 1,
      },
      {
        key: "polls",
        name: "Polls",
        description: "Votes",
        price_monthly: 199,
        is_core: false,
        sort_order: 2,
      },
      {
        key: "bookings",
        name: "Bookings",
        description: null,
        price_monthly: 399,
        is_core: false,
        sort_order: 3,
      },
      {
        key: "community",
        name: "Chat",
        description: null,
        price_monthly: 299,
        is_core: false,
        sort_order: 4,
      },
    ],
    error: null,
  };

  it("merges catalogue, grants (with per-society price) and pending requests", async () => {
    const rows = await listSocietyFeatureState(
      sb({
        platform_features: catalogue,
        society_features: {
          data: [{ feature_key: "polls", enabled: true, price_override: 150 }],
          error: null,
        },
        feature_requests: {
          data: [{ id: "r1", feature_key: "bookings", action: "add" }],
          error: null,
        },
      }),
      "s1",
    );
    expect(rows).toEqual([
      {
        key: "notices",
        name: "Notice Board",
        description: null,
        isCore: true,
        enabled: true,
        price: 0,
        pending: null,
      },
      {
        key: "polls",
        name: "Polls",
        description: "Votes",
        isCore: false,
        enabled: true,
        price: 150,
        pending: null,
      },
      {
        key: "bookings",
        name: "Bookings",
        description: null,
        isCore: false,
        enabled: false,
        price: 399,
        pending: { id: "r1", action: "add" },
      },
      {
        key: "community",
        name: "Chat",
        description: null,
        isCore: false,
        enabled: false,
        price: 299,
        pending: null,
      },
    ]);
  });

  it("throws if any read fails", async () => {
    await expect(
      listSocietyFeatureState(
        sb({
          platform_features: catalogue,
          society_features: { data: null, error: new Error("rls") },
          feature_requests: { data: [], error: null },
        }),
        "s1",
      ),
    ).rejects.toThrow("rls");
  });
});

describe("requestFeatureChange", () => {
  it("calls the RPC", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: { id: "r9" }, error: null });
    expect(
      await requestFeatureChange(
        { rpc },
        { societyId: "s1", featureKey: "polls", action: "add", note: " pls " },
      ),
    ).toEqual({
      ok: true,
      id: "r9",
    });
    expect(rpc).toHaveBeenCalledWith("request_feature_change", {
      p_society_id: "s1",
      p_feature_key: "polls",
      p_action: "add",
      p_note: "pls",
    });
  });

  it.each(["NOT_AUTHORITY", "CORE_FEATURE", "ALREADY_ENABLED", "NOT_ENABLED", "ALREADY_REQUESTED"])(
    "maps %s",
    async (code) => {
      const rpc = vi.fn().mockResolvedValue({ data: null, error: { message: `x ${code}` } });
      expect(
        await requestFeatureChange(
          { rpc },
          { societyId: "s1", featureKey: "polls", action: "add" },
        ),
      ).toEqual({ error: code });
    },
  );

  it("throws unknown errors", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: null, error: { message: "offline" } });
    await expect(
      requestFeatureChange({ rpc }, { societyId: "s1", featureKey: "polls", action: "add" }),
    ).rejects.toBeTruthy();
  });
});
