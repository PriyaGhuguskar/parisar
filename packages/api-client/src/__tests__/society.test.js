import { describe, expect, it, vi } from "vitest";
import {
  bootstrapSocietyStructure,
  createSociety,
  fetchAuditLog,
  fetchJoinPercent,
  finalizeSocietySetup,
  formatSocietyCode,
  isValidSocietyCode,
  joinBySocietyCode,
  listSocietyStructure,
  mapSocietyCodeError,
  normalizePhoneForCoSec,
  resumeSocietyCode,
  rotateSocietyCode,
  transferSecretaryRole,
  validateSocietyCode,
} from "../society.js";

// ---------------------------------------------------------------------------
// formatSocietyCode
// ---------------------------------------------------------------------------

describe("formatSocietyCode", () => {
  it("inserts hyphen at position 4 for lowercase input", () => {
    expect(formatSocietyCode("par7xkm2")).toBe("PAR7-XKM2");
  });

  it("keeps an existing hyphen in canonical form", () => {
    expect(formatSocietyCode("PAR7-XKM2")).toBe("PAR7-XKM2");
  });

  it("strips spaces and inserts hyphen", () => {
    expect(formatSocietyCode("par7 xkm2")).toBe("PAR7-XKM2");
  });

  it("returns empty string for empty input", () => {
    expect(formatSocietyCode("")).toBe("");
  });

  it("returns empty string for null", () => {
    expect(formatSocietyCode(null)).toBe("");
  });

  it("uppercases mixed-case input", () => {
    expect(formatSocietyCode("Par7Xkm2")).toBe("PAR7-XKM2");
  });

  it("handles input with multiple spaces", () => {
    expect(formatSocietyCode("P A R 7 X K M 2")).toBe("PAR7-XKM2");
  });
});

// ---------------------------------------------------------------------------
// isValidSocietyCode
// ---------------------------------------------------------------------------

describe("isValidSocietyCode", () => {
  it("accepts canonical uppercase form", () => {
    expect(isValidSocietyCode("PAR7-XKM2")).toBe(true);
  });

  it("accepts lowercase (format normalizes before check)", () => {
    expect(isValidSocietyCode("par7xkm2")).toBe(true);
  });

  it("rejects ambiguous character 0 (zero)", () => {
    expect(isValidSocietyCode("PAR0-XKM2")).toBe(false);
  });

  it("rejects ambiguous character O (letter oh)", () => {
    expect(isValidSocietyCode("PARO-XKM2")).toBe(false);
  });

  it("rejects ambiguous character I (letter eye)", () => {
    expect(isValidSocietyCode("PARI-XKM2")).toBe(false);
  });

  it("rejects ambiguous character 1 (one)", () => {
    expect(isValidSocietyCode("PAR1-XKM2")).toBe(false);
  });

  it("rejects ambiguous character L (letter ell)", () => {
    expect(isValidSocietyCode("PARL-XKM2")).toBe(false);
  });

  it("rejects too-short input (3 + 4)", () => {
    expect(isValidSocietyCode("PAR-XKM2")).toBe(false);
  });

  it("rejects too-long input (5 + 4)", () => {
    expect(isValidSocietyCode("PARTZ-XKM2")).toBe(false);
  });

  it("rejects empty string", () => {
    expect(isValidSocietyCode("")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// mapSocietyCodeError
// ---------------------------------------------------------------------------

describe("mapSocietyCodeError", () => {
  it("maps INVALID_CODE to join.codeNotFound", () => {
    expect(mapSocietyCodeError({ error: "INVALID_CODE" })).toBe("join.codeNotFound");
  });

  it("maps CODE_PAUSED to join.codePaused", () => {
    expect(mapSocietyCodeError({ error: "CODE_PAUSED" })).toBe("join.codePaused");
  });

  it("maps CODE_PAUSED_RATE_LIMIT to join.rateLimited", () => {
    expect(mapSocietyCodeError({ error: "CODE_PAUSED_RATE_LIMIT" })).toBe("join.rateLimited");
  });

  it("maps FLAT_NOT_IN_SOCIETY to join.codeNotFound", () => {
    expect(mapSocietyCodeError({ error: "FLAT_NOT_IN_SOCIETY" })).toBe("join.codeNotFound");
  });

  it("returns null when result has no error field", () => {
    expect(mapSocietyCodeError({ society_id: "x" })).toBeNull();
  });

  it("returns null for null input", () => {
    expect(mapSocietyCodeError(null)).toBeNull();
  });

  it("falls back to auth.networkError for unknown error codes", () => {
    expect(mapSocietyCodeError({ error: "TOTALLY_UNKNOWN_ERROR" })).toBe("auth.networkError");
  });
});

// ---------------------------------------------------------------------------
// normalizePhoneForCoSec
// ---------------------------------------------------------------------------

describe("normalizePhoneForCoSec", () => {
  it("strips +91 prefix to return 10-digit number", () => {
    expect(normalizePhoneForCoSec("+919876543210")).toBe("9876543210");
  });

  it("strips 91 prefix (12 digits) to return 10-digit number", () => {
    expect(normalizePhoneForCoSec("919876543210")).toBe("9876543210");
  });

  it("keeps a bare 10-digit number unchanged", () => {
    expect(normalizePhoneForCoSec("9876543210")).toBe("9876543210");
  });

  it("strips spaces from the number", () => {
    expect(normalizePhoneForCoSec("98765 43210")).toBe("9876543210");
  });

  it("returns empty string for null", () => {
    expect(normalizePhoneForCoSec(null)).toBe("");
  });
});

// ---------------------------------------------------------------------------
// Retired legacy wrappers (054 revoked their RPCs)
// ---------------------------------------------------------------------------

describe("retired legacy wrappers", () => {
  it("createSociety throws SOCIETY_SETUP_RETIRED without calling the revoked RPC", async () => {
    const supabase = { rpc: vi.fn() };
    await expect(createSociety(supabase, { name: "S" })).rejects.toThrow("SOCIETY_SETUP_RETIRED");
    expect(supabase.rpc).not.toHaveBeenCalled();
  });

  it("finalizeSocietySetup throws SOCIETY_SETUP_RETIRED", async () => {
    const supabase = { rpc: vi.fn() };
    await expect(finalizeSocietySetup(supabase, {})).rejects.toThrow("SOCIETY_SETUP_RETIRED");
    expect(supabase.rpc).not.toHaveBeenCalled();
  });

  it("joinBySocietyCode throws SOCIETY_JOIN_RETIRED (use onboardResident)", async () => {
    const supabase = { rpc: vi.fn() };
    await expect(joinBySocietyCode(supabase, { code: "PAR7-XKM2" })).rejects.toThrow(
      "SOCIETY_JOIN_RETIRED",
    );
    expect(supabase.rpc).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// bootstrapSocietyStructure
// ---------------------------------------------------------------------------

describe("bootstrapSocietyStructure", () => {
  it("passes through wings + flats RPC payload and does NOT call refreshSession", async () => {
    const refreshSpy = vi.fn();
    const supabase = {
      rpc: vi.fn().mockResolvedValue({
        data: {
          wings: [{ name: "A", id: "w1" }],
          flats: [{ id: "f1", wing_name: "A", number: "101" }],
        },
        error: null,
      }),
      auth: { refreshSession: refreshSpy },
    };
    const out = await bootstrapSocietyStructure(supabase, {
      societyId: "sid",
      wings: [{ name: "A" }],
      flats: [{ wing_name: "A", number: "101" }],
    });
    expect(out.wings).toHaveLength(1);
    expect(out.wings[0]).toEqual({ name: "A", id: "w1" });
    expect(out.flats[0].id).toBe("f1");
    expect(refreshSpy).not.toHaveBeenCalled();
    expect(supabase.rpc).toHaveBeenCalledWith(
      "bootstrap_society_structure",
      expect.objectContaining({
        p_society_id: "sid",
        p_wings: [{ name: "A" }],
        p_flats: [{ wing_name: "A", number: "101" }],
      }),
    );
  });

  it("throws on RPC error (e.g., NOT_SOCIETY_CREATOR)", async () => {
    const supabase = {
      rpc: vi.fn().mockResolvedValue({ data: null, error: { message: "NOT_SOCIETY_CREATOR" } }),
      auth: { refreshSession: vi.fn() },
    };
    await expect(
      bootstrapSocietyStructure(supabase, { societyId: "sid", wings: [], flats: [] }),
    ).rejects.toMatchObject({ message: "NOT_SOCIETY_CREATOR" });
  });

  it("throws on RPC error (e.g., WING_NOT_FOUND)", async () => {
    const supabase = {
      rpc: vi.fn().mockResolvedValue({ data: null, error: { message: "WING_NOT_FOUND" } }),
      auth: { refreshSession: vi.fn() },
    };
    await expect(
      bootstrapSocietyStructure(supabase, {
        societyId: "s",
        wings: [],
        flats: [{ wing_name: "X", number: "1" }],
      }),
    ).rejects.toMatchObject({ message: "WING_NOT_FOUND" });
  });
});

// ---------------------------------------------------------------------------
// listSocietyStructure
// ---------------------------------------------------------------------------

describe("listSocietyStructure", () => {
  it("formats the code, calls onboard_flats_for_code and flattens to the legacy shape", async () => {
    const supabase = {
      rpc: vi.fn().mockResolvedValue({
        data: {
          society_id: "sid",
          society_name: "Shree CHS",
          wings: [{ id: "w1", name: "A", flats: [{ id: "f1", number: "101", taken: true }] }],
        },
        error: null,
      }),
      auth: { refreshSession: vi.fn() },
    };
    // Pass unformatted input to verify auto-formatting
    const out = await listSocietyStructure(supabase, "par7xkm2");
    expect(out).toEqual({
      society_id: "sid",
      society_name: "Shree CHS",
      wings: [{ id: "w1", name: "A" }],
      flats: [{ id: "f1", wing_id: "w1", number: "101", taken: true }],
    });
    expect(supabase.rpc).toHaveBeenCalledWith("onboard_flats_for_code", { p_code: "PAR7-XKM2" });
  });

  it("returns the error payload (does NOT throw) for CODE_PAUSED", async () => {
    const supabase = {
      rpc: vi.fn().mockResolvedValue({ data: { error: "CODE_PAUSED" }, error: null }),
      auth: { refreshSession: vi.fn() },
    };
    const out = await listSocietyStructure(supabase, "PAR7-XKM2");
    expect(out).toEqual({ error: "CODE_PAUSED" });
  });

  it("returns the error payload (does NOT throw) for INVALID_CODE", async () => {
    const supabase = {
      rpc: vi.fn().mockResolvedValue({ data: { error: "INVALID_CODE" }, error: null }),
      auth: { refreshSession: vi.fn() },
    };
    const out = await listSocietyStructure(supabase, "PAR7-XKM2");
    expect(out).toEqual({ error: "INVALID_CODE" });
  });

  it("throws on unexpected RPC (network/server) error", async () => {
    const supabase = {
      rpc: vi.fn().mockResolvedValue({ data: null, error: { message: "network error" } }),
      auth: { refreshSession: vi.fn() },
    };
    await expect(listSocietyStructure(supabase, "PAR7-XKM2")).rejects.toMatchObject({
      message: "network error",
    });
  });
});

// ---------------------------------------------------------------------------
// validateSocietyCode
// ---------------------------------------------------------------------------

describe("validateSocietyCode", () => {
  it("returns { error: INVALID_CODE } without calling RPC when code is invalid", async () => {
    const supabase = { rpc: vi.fn(), auth: { refreshSession: vi.fn() } };
    const out = await validateSocietyCode(supabase, "BAD");
    expect(out).toEqual({ error: "INVALID_CODE" });
    expect(supabase.rpc).not.toHaveBeenCalled();
  });

  it("calls onboard_flats_for_code with the formatted code and maps the preview", async () => {
    const supabase = {
      rpc: vi.fn().mockResolvedValue({
        data: { society_id: "s", society_name: "Test Society", wings: [] },
        error: null,
      }),
      auth: { refreshSession: vi.fn() },
    };
    const out = await validateSocietyCode(supabase, "par7xkm2");
    expect(out).toEqual({ society_id: "s", name: "Test Society" });
    expect(supabase.rpc).toHaveBeenCalledWith("onboard_flats_for_code", { p_code: "PAR7-XKM2" });
  });

  it("returns the RPC's inline error (e.g. SOCIETY_BLOCKED)", async () => {
    const supabase = {
      rpc: vi.fn().mockResolvedValue({ data: { error: "SOCIETY_BLOCKED" }, error: null }),
    };
    expect(await validateSocietyCode(supabase, "PAR7-XKM2")).toEqual({ error: "SOCIETY_BLOCKED" });
  });
});

// ---------------------------------------------------------------------------
// rotateSocietyCode
// ---------------------------------------------------------------------------

describe("rotateSocietyCode", () => {
  it("returns { code } from RPC payload", async () => {
    const supabase = {
      rpc: vi.fn().mockResolvedValue({ data: { code: "NEW7-CODE" }, error: null }),
      auth: { refreshSession: vi.fn() },
    };
    const out = await rotateSocietyCode(supabase, { societyId: "sid" });
    expect(out).toEqual({ code: "NEW7-CODE" });
  });
});

// ---------------------------------------------------------------------------
// resumeSocietyCode
// ---------------------------------------------------------------------------

describe("resumeSocietyCode", () => {
  it("returns { resumed } from RPC payload", async () => {
    const supabase = {
      rpc: vi.fn().mockResolvedValue({ data: { resumed: true }, error: null }),
      auth: { refreshSession: vi.fn() },
    };
    const out = await resumeSocietyCode(supabase, { societyId: "sid" });
    expect(out).toEqual({ resumed: true });
  });
});

// ---------------------------------------------------------------------------
// transferSecretaryRole
// ---------------------------------------------------------------------------

describe("transferSecretaryRole", () => {
  it("calls refreshSession after successful role transfer", async () => {
    const refreshSpy = vi.fn().mockResolvedValue({ error: null });
    const supabase = {
      rpc: vi.fn().mockResolvedValue({ error: null }),
      auth: { refreshSession: refreshSpy },
    };
    const out = await transferSecretaryRole(supabase, "u123");
    expect(supabase.rpc).toHaveBeenCalledWith("transfer_secretary_role", {
      p_new_secretary_user_id: "u123",
    });
    expect(refreshSpy).toHaveBeenCalledTimes(1);
    expect(out).toEqual({ refreshed: true });
  });

  it("reports refreshed:false (no console.warn swallow) when refreshSession fails", async () => {
    const supabase = {
      rpc: vi.fn().mockResolvedValue({ error: null }),
      auth: { refreshSession: vi.fn().mockResolvedValue({ error: { message: "expired" } }) },
    };
    expect(await transferSecretaryRole(supabase, "u123")).toEqual({ refreshed: false });
  });

  it("throws when RPC errors", async () => {
    const supabase = {
      rpc: vi.fn().mockResolvedValue({ error: { message: "UNAUTHORIZED" } }),
      auth: { refreshSession: vi.fn() },
    };
    await expect(transferSecretaryRole(supabase, "u456")).rejects.toMatchObject({
      message: "UNAUTHORIZED",
    });
  });
});

// ---------------------------------------------------------------------------
// fetchJoinPercent — distinct flats, errors thrown, clamped
// ---------------------------------------------------------------------------

describe("fetchJoinPercent", () => {
  function makeCountClient(totalRes, joinedRes) {
    const calls = [];
    const from = vi.fn(() => {
      const res = calls.length === 0 ? totalRes : joinedRes;
      const builder = {
        select: vi.fn((cols) => {
          calls.push(cols);
          return builder;
        }),
        eq: vi.fn(() => builder),
        // biome-ignore lint/suspicious/noThenProperty: mimics the supabase-js thenable builder
        then: (resolve) => resolve(res),
      };
      return builder;
    });
    return { client: { from }, calls };
  }

  it("counts DISTINCT flats via an inner-joined active-membership embed", async () => {
    const { client, calls } = makeCountClient(
      { count: 10, error: null },
      { count: 4, error: null },
    );
    expect(await fetchJoinPercent(client, "sid")).toBe(40);
    expect(calls[1]).toBe("id, society_memberships!inner(id)");
  });

  it("clamps to 100", async () => {
    const { client } = makeCountClient({ count: 2, error: null }, { count: 3, error: null });
    expect(await fetchJoinPercent(client, "sid")).toBe(100);
  });

  it("returns 0 for a society with no flats", async () => {
    const { client } = makeCountClient({ count: 0, error: null }, { count: 0, error: null });
    expect(await fetchJoinPercent(client, "sid")).toBe(0);
  });

  it("throws instead of reporting 0% when a count query fails", async () => {
    const err = new Error("rls");
    const { client } = makeCountClient({ count: null, error: err }, { count: 0, error: null });
    await expect(fetchJoinPercent(client, "sid")).rejects.toBe(err);
  });
});

// ---------------------------------------------------------------------------
// fetchAuditLog — bounded page + composite cursor
// ---------------------------------------------------------------------------

describe("fetchAuditLog", () => {
  function makeAuditClient(result = { data: [], error: null }) {
    const builder = {};
    for (const m of ["select", "eq", "gte", "order", "or", "lt"]) {
      builder[m] = vi.fn(() => builder);
    }
    builder.limit = vi.fn(async () => result);
    return { client: { from: vi.fn(() => builder) }, builder };
  }

  it("applies a default limit of 50 ordered by (created_at, id) desc", async () => {
    const { client, builder } = makeAuditClient();
    await fetchAuditLog(client, "sid");
    expect(builder.order).toHaveBeenNthCalledWith(1, "created_at", { ascending: false });
    expect(builder.order).toHaveBeenNthCalledWith(2, "id", { ascending: false });
    expect(builder.limit).toHaveBeenCalledWith(50);
  });

  it("caps the page size and applies a composite cursor", async () => {
    const { client, builder } = makeAuditClient();
    const cursor = {
      createdAt: "2026-10-01T10:00:00.000Z",
      id: "11111111-1111-4111-8111-111111111111",
    };
    await fetchAuditLog(client, "sid", { limit: 10000, cursor });
    expect(builder.limit).toHaveBeenCalledWith(200);
    expect(builder.or).toHaveBeenCalledWith(
      "created_at.lt.2026-10-01T10:00:00.000Z,and(created_at.eq.2026-10-01T10:00:00.000Z,id.lt.11111111-1111-4111-8111-111111111111)",
    );
  });

  it("throws on query errors", async () => {
    const err = new Error("denied");
    const { client } = makeAuditClient({ data: null, error: err });
    await expect(fetchAuditLog(client, "sid")).rejects.toBe(err);
  });
});
