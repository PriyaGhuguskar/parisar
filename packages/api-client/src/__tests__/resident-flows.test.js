import { describe, expect, it, vi } from "vitest";
import * as api from "../index.js";
import { onboardResident, onboardStructureForCode, upsertMyProfile } from "../resident-flows.js";

function client(...results) {
  const rpc = vi.fn();
  for (const r of results) rpc.mockResolvedValueOnce(r);
  return { rpc };
}

describe("resident-flows wrappers", () => {
  it("are exported from the package barrel", () => {
    expect(api.onboardStructureForCode).toBe(onboardStructureForCode);
    expect(api.onboardResident).toBe(onboardResident);
    expect(api.upsertMyProfile).toBe(upsertMyProfile);
  });

  it("onboardStructureForCode calls the floor-aware RPC", async () => {
    const sb = client({ data: { society_id: "s", wings: [] }, error: null });
    const res = await onboardStructureForCode(sb, "abcd-1234");
    expect(sb.rpc).toHaveBeenCalledWith("onboard_structure_for_code", { p_code: "ABCD-1234" });
    expect(res).toEqual({ society_id: "s", wings: [] });
  });

  it("onboardStructureForCode returns a returned error code as is", async () => {
    const sb = client({ data: { error: "INVALID_CODE" }, error: null });
    expect(await onboardStructureForCode(sb, "X")).toEqual({ error: "INVALID_CODE" });
  });

  it("onboardStructureForCode falls back to the older RPC when the new one is missing", async () => {
    const sb = client(
      { data: null, error: { code: "PGRST202", message: "Could not find the function" } },
      {
        data: {
          society_id: "s",
          society_name: "S",
          wings: [{ id: "w", name: "A", flats: [{ id: "f", number: "101", taken: false }] }],
        },
        error: null,
      },
    );
    const res = await onboardStructureForCode(sb, "ABCD-1234");
    expect(sb.rpc).toHaveBeenLastCalledWith("onboard_flats_for_code", { p_code: "ABCD-1234" });
    expect(res.wings[0]).toMatchObject({ id: "w", code: null, floors: [] });
    expect(res.wings[0].flats[0]).toMatchObject({ id: "f", floor_id: null });
  });

  it("onboardStructureForCode throws on an outage", async () => {
    const sb = client({ data: null, error: { message: "fetch failed" } });
    await expect(onboardStructureForCode(sb, "ABCD-1234")).rejects.toBeTruthy();
  });

  it("onboardResident maps every argument and folds raised codes", async () => {
    const sb = client({ data: null, error: { message: "INVALID_NAME" } });
    const res = await onboardResident(sb, {
      code: "ABCD-1234",
      flatId: "f",
      fullName: "Asha",
      residency: "owner",
      altPhone: "",
      family: [],
    });
    expect(sb.rpc).toHaveBeenCalledWith("onboard_resident", {
      p_code: "ABCD-1234",
      p_flat_id: "f",
      p_full_name: "Asha",
      p_residency: "owner",
      p_alt_phone: null,
      p_family: [],
    });
    expect(res).toEqual({ error: "INVALID_NAME" });
  });

  it("upsertMyProfile sends the trimmed name", async () => {
    const sb = client({ data: { user_id: "u", full_name: "Asha" }, error: null });
    await upsertMyProfile(sb, "  Asha  ");
    expect(sb.rpc).toHaveBeenCalledWith("upsert_my_profile", {
      p_full_name: "Asha",
      p_signup_intent: null,
    });
  });
});
