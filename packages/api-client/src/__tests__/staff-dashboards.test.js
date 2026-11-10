import { describe, expect, it, vi } from "vitest";
import * as api from "../index.js";

const ID = "11111111-1111-1111-1111-111111111111";

function client(result = { data: { items: [], total: 0 }, error: null }) {
  return { rpc: vi.fn().mockResolvedValue(result) };
}

describe("managerListSocietyResidents", () => {
  it("sends every param with defaults", async () => {
    const sb = client();
    await api.managerListSocietyResidents(sb, { societyId: ID, residentType: "owner" });
    expect(sb.rpc).toHaveBeenCalledWith("manager_list_society_residents", {
      p_society_id: ID,
      p_resident_type: "owner",
      p_search: null,
      p_status: null,
      p_limit: 25,
      p_offset: 0,
    });
  });

  it("passes search, status and paging through", async () => {
    const sb = client();
    await api.managerListSocietyResidents(sb, {
      societyId: ID,
      residentType: "tenant",
      search: "A-1",
      status: "registered",
      limit: 50,
      offset: 50,
    });
    expect(sb.rpc).toHaveBeenCalledWith("manager_list_society_residents", {
      p_society_id: ID,
      p_resident_type: "tenant",
      p_search: "A-1",
      p_status: "registered",
      p_limit: 50,
      p_offset: 50,
    });
  });

  it("returns the RPC's JSON", async () => {
    const data = { items: [{ id: "x" }], total: 1, limit: 25, offset: 0 };
    const res = await api.managerListSocietyResidents(client({ data, error: null }), {
      societyId: ID,
      residentType: "family_member",
    });
    expect(res).toEqual(data);
  });

  it("folds a raised code into { error }", async () => {
    const sb = client({ data: null, error: { message: "NOT_SOCIETY_MANAGER" } });
    const res = await api.managerListSocietyResidents(sb, { societyId: ID, residentType: "owner" });
    expect(res).toEqual({ error: "NOT_SOCIETY_MANAGER" });
  });

  it("throws on anything that is not a code", async () => {
    const sb = client({ data: null, error: { message: "fetch failed" } });
    await expect(
      api.managerListSocietyResidents(sb, { societyId: ID, residentType: "owner" }),
    ).rejects.toBeTruthy();
  });
});

describe("managerResidentTypeCounts", () => {
  it("calls the counts RPC with the society", async () => {
    const sb = client({ data: { owner: 2, tenant: 1, family_member: 0 }, error: null });
    const res = await api.managerResidentTypeCounts(sb, ID);
    expect(sb.rpc).toHaveBeenCalledWith("manager_resident_type_counts", { p_society_id: ID });
    expect(res).toEqual({ owner: 2, tenant: 1, family_member: 0 });
  });
});
