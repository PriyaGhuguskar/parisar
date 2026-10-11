import { describe, expect, it, vi } from "vitest";
import {
  bootstrapSocietyStructure,
  createSociety,
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
// createSociety
// ---------------------------------------------------------------------------

describe("createSociety", () => {
  it("returns mapped camelCase payload and does NOT call refreshSession", async () => {
    const refreshSpy = vi.fn();
    const supabase = {
      rpc: vi.fn().mockResolvedValue({
        data: { society_id: "sid", code: "PAR7-XKM2", co_secretary_found: true },
        error: null,
      }),
      auth: { refreshSession: refreshSpy },
    };
    const out = await createSociety(supabase, {
      name: "Shree Ganesh CHS",
      address: "Building 1, Main Street, Pune, 411001",
      coSecretaryPhone: "9876543210",
    });
    expect(out).toEqual({ societyId: "sid", code: "PAR7-XKM2", coSecretaryFound: true });
    expect(refreshSpy).not.toHaveBeenCalled();
    expect(supabase.rpc).toHaveBeenCalledWith(
      "create_society_with_secretary",
      expect.objectContaining({ p_co_secretary_phone: "9876543210" }),
    );
  });

  it("normalizes +91 prefix on coSecretaryPhone before calling RPC", async () => {
    const supabase = {
      rpc: vi.fn().mockResolvedValue({
        data: { society_id: "s", code: "PAR7-XKM2", co_secretary_found: false },
        error: null,
      }),
      auth: { refreshSession: vi.fn() },
    };
    await createSociety(supabase, { name: "S", address: "A", coSecretaryPhone: "+919876543210" });
    expect(supabase.rpc).toHaveBeenCalledWith(
      "create_society_with_secretary",
      expect.objectContaining({ p_co_secretary_phone: "9876543210" }),
    );
  });

  it("throws when RPC returns an error", async () => {
    const supabase = {
      rpc: vi.fn().mockResolvedValue({ data: null, error: { message: "DB error" } }),
      auth: { refreshSession: vi.fn() },
    };
    await expect(
      createSociety(supabase, { name: "S", address: "A", coSecretaryPhone: "9" }),
    ).rejects.toMatchObject({ message: "DB error" });
  });
});

// ---------------------------------------------------------------------------
// finalizeSocietySetup
// ---------------------------------------------------------------------------

describe("finalizeSocietySetup", () => {
  it("returns membershipId and calls refreshSession exactly once on success", async () => {
    const refreshSpy = vi.fn().mockResolvedValue({ error: null });
    const supabase = {
      rpc: vi.fn().mockResolvedValue({ data: { membership_id: "mid" }, error: null }),
      auth: { refreshSession: refreshSpy },
    };
    const out = await finalizeSocietySetup(supabase, { societyId: "sid", flatId: "fid" });
    expect(out.membershipId).toBe("mid");
    expect(refreshSpy).toHaveBeenCalledTimes(1);
  });

  it("still returns membershipId when refreshSession fails (console.warn, no throw)", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const supabase = {
      rpc: vi.fn().mockResolvedValue({ data: { membership_id: "mid2" }, error: null }),
      auth: { refreshSession: vi.fn().mockResolvedValue({ error: { message: "token error" } }) },
    };
    const out = await finalizeSocietySetup(supabase, { societyId: "sid", flatId: "fid" });
    expect(out.membershipId).toBe("mid2");
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it("throws when RPC returns an error", async () => {
    const supabase = {
      rpc: vi.fn().mockResolvedValue({ data: null, error: { message: "finalize failed" } }),
      auth: { refreshSession: vi.fn() },
    };
    await expect(
      finalizeSocietySetup(supabase, { societyId: "s", flatId: "f" }),
    ).rejects.toMatchObject({ message: "finalize failed" });
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
  it("formats the code and returns wings + flats on success", async () => {
    const supabase = {
      rpc: vi.fn().mockResolvedValue({
        data: {
          society_id: "sid",
          wings: [{ id: "w1", name: "A" }],
          flats: [{ id: "f1", wing_id: "w1", number: "101" }],
        },
        error: null,
      }),
      auth: { refreshSession: vi.fn() },
    };
    // Pass unformatted input to verify auto-formatting
    const out = await listSocietyStructure(supabase, "par7xkm2");
    expect(out.society_id).toBe("sid");
    expect(out.wings).toHaveLength(1);
    // Verify the RPC received the formatted code
    expect(supabase.rpc).toHaveBeenCalledWith("list_society_structure", { p_code: "PAR7-XKM2" });
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

  it("calls RPC with formatted code and returns payload on success", async () => {
    const supabase = {
      rpc: vi.fn().mockResolvedValue({
        data: { society_id: "s", name: "Test Society", address: "Addr", member_count: 3 },
        error: null,
      }),
      auth: { refreshSession: vi.fn() },
    };
    const out = await validateSocietyCode(supabase, "par7xkm2");
    expect(out.society_id).toBe("s");
    expect(supabase.rpc).toHaveBeenCalledWith("validate_society_code", { p_code: "PAR7-XKM2" });
  });
});

// ---------------------------------------------------------------------------
// joinBySocietyCode
// ---------------------------------------------------------------------------

describe("joinBySocietyCode", () => {
  it("returns error payload without calling refreshSession on RPC error case", async () => {
    const refreshSpy = vi.fn();
    const supabase = {
      rpc: vi.fn().mockResolvedValue({ data: { error: "INVALID_CODE" }, error: null }),
      auth: { refreshSession: refreshSpy },
    };
    const out = await joinBySocietyCode(supabase, {
      code: "PAR7-XKM2",
      flatId: "f",
      residency: "owner",
      household: "family",
      emergencyContact: "",
    });
    expect(out).toEqual({ error: "INVALID_CODE" });
    expect(refreshSpy).not.toHaveBeenCalled();
  });

  it("refreshes session on success and propagates auto-elevation flag", async () => {
    const refreshSpy = vi.fn().mockResolvedValue({ error: null });
    const supabase = {
      rpc: vi.fn().mockResolvedValue({
        data: {
          membership_id: "m",
          society_id: "s",
          status: "active",
          duplicate: false,
          role: "co_secretary",
          auto_elevated_to_co_secretary: true,
        },
        error: null,
      }),
      auth: { refreshSession: refreshSpy },
    };
    const out = await joinBySocietyCode(supabase, {
      code: "PAR7-XKM2",
      flatId: "f",
      residency: "owner",
      household: "family",
      emergencyContact: "",
    });
    expect(out.membershipId).toBe("m");
    expect(out.societyId).toBe("s");
    expect(out.status).toBe("active");
    expect(out.role).toBe("co_secretary");
    expect(out.autoElevatedToCoSecretary).toBe(true);
    expect(refreshSpy).toHaveBeenCalledTimes(1);
  });

  it("does not set autoElevatedToCoSecretary to true for regular member join", async () => {
    const supabase = {
      rpc: vi.fn().mockResolvedValue({
        data: {
          membership_id: "m2",
          society_id: "s",
          status: "active",
          duplicate: false,
          role: "member",
          auto_elevated_to_co_secretary: false,
        },
        error: null,
      }),
      auth: { refreshSession: vi.fn().mockResolvedValue({ error: null }) },
    };
    const out = await joinBySocietyCode(supabase, {
      code: "PAR7-XKM2",
      flatId: "f",
      residency: "tenant",
      household: "bachelor",
      emergencyContact: null,
    });
    expect(out.autoElevatedToCoSecretary).toBe(false);
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
    await transferSecretaryRole(supabase, "u123");
    expect(supabase.rpc).toHaveBeenCalledWith("transfer_secretary_role", {
      p_new_secretary_user_id: "u123",
    });
    expect(refreshSpy).toHaveBeenCalledTimes(1);
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
