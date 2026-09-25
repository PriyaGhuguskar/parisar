import { describe, expect, it, vi } from "vitest";
import {
  addSocietyAuthority,
  isValidAuthorityPhone,
  listSocietyAuthorities,
  normalizeAuthorityPhone,
} from "../authorities.js";

describe("normalizeAuthorityPhone / isValidAuthorityPhone", () => {
  it("strips +91, spaces and dashes to the last 10 digits", () => {
    expect(normalizeAuthorityPhone("+91 98765-43210")).toBe("9876543210");
    expect(normalizeAuthorityPhone(null)).toBe("");
  });
  it("accepts Indian mobiles only", () => {
    expect(isValidAuthorityPhone("9876543210")).toBe(true);
    expect(isValidAuthorityPhone("+919876543210")).toBe(true);
    expect(isValidAuthorityPhone("5876543210")).toBe(false);
    expect(isValidAuthorityPhone("98765")).toBe(false);
  });
});

describe("addSocietyAuthority", () => {
  it("calls the RPC with trimmed name and normalized phone", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: { id: "a1", linked: true }, error: null });
    const res = await addSocietyAuthority(
      { rpc },
      { societyId: "s1", name: "  Asha ", phone: "+91 98765 43210" },
    );
    expect(rpc).toHaveBeenCalledWith("add_society_authority", {
      p_society_id: "s1",
      p_name: "Asha",
      p_phone: "9876543210",
    });
    expect(res).toEqual({ ok: true, id: "a1", linked: true });
  });

  it.each(["INVALID_NAME", "INVALID_PHONE", "ALREADY_AUTHORITY", "NOT_AUTHORITY"])(
    "maps %s to an error result",
    async (code) => {
      const rpc = vi.fn().mockResolvedValue({ data: null, error: { message: `boom ${code}` } });
      expect(
        await addSocietyAuthority({ rpc }, { societyId: "s1", name: "A", phone: "1" }),
      ).toEqual({
        error: code,
      });
    },
  );

  it("throws unexpected errors", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: null, error: { message: "network down" } });
    await expect(
      addSocietyAuthority({ rpc }, { societyId: "s1", name: "Asha", phone: "9876543210" }),
    ).rejects.toBeTruthy();
  });
});

describe("listSocietyAuthorities", () => {
  function sb(result) {
    const q = { select: () => q, eq: () => q, order: () => Promise.resolve(result) };
    return { from: vi.fn(() => q) };
  }
  it("returns rows", async () => {
    const s = sb({ data: [{ id: "a1" }], error: null });
    expect(await listSocietyAuthorities(s, "s1")).toEqual([{ id: "a1" }]);
    expect(s.from).toHaveBeenCalledWith("society_authorities");
  });
  it("throws on error", async () => {
    await expect(
      listSocietyAuthorities(sb({ data: null, error: new Error("rls") }), "s1"),
    ).rejects.toThrow("rls");
  });
});
