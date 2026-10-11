import { describe, expect, it, vi } from "vitest";
import {
  addFamilyMembers,
  approvePendingMembership,
  getMyActiveSociety,
  onboardResident,
  rejectPendingMembership,
  rpcErrorCode,
  secretaryAddBoardMember,
  secretaryAddSetupAmenities,
  setActiveSociety,
  updateMyEmergencyContact,
  upsertMyProfile,
} from "../membership.js";

function makeClient(data, { error = null, refreshError = null } = {}) {
  return {
    rpc: vi.fn(async () => ({ data, error })),
    auth: { refreshSession: vi.fn(async () => ({ error: refreshError })) },
  };
}

const ACTIVE = {
  society_id: "s1",
  role: "secretary",
  society_name: "Shree CHS",
  service_status: "active",
  token_stale: true,
};

describe("active society", () => {
  it("getMyActiveSociety maps my_active_society and does not refresh by default", async () => {
    const supabase = makeClient(ACTIVE);
    const out = await getMyActiveSociety(supabase);
    expect(supabase.rpc).toHaveBeenCalledWith("my_active_society", {});
    expect(out).toEqual({
      societyId: "s1",
      role: "secretary",
      societyName: "Shree CHS",
      serviceStatus: "active",
      tokenStale: true,
    });
    expect(supabase.auth.refreshSession).not.toHaveBeenCalled();
  });

  it("getMyActiveSociety refreshes a stale token when asked", async () => {
    const supabase = makeClient(ACTIVE);
    const out = await getMyActiveSociety(supabase, { refreshIfStale: true });
    expect(supabase.auth.refreshSession).toHaveBeenCalledTimes(1);
    expect(out.refreshed).toBe(true);
  });

  it("getMyActiveSociety returns nulls when there is no active membership", async () => {
    const out = await getMyActiveSociety(makeClient({}));
    expect(out).toEqual({
      societyId: null,
      role: null,
      societyName: null,
      serviceStatus: null,
      tokenStale: false,
    });
  });

  it("setActiveSociety calls set_active_society then refreshSession", async () => {
    const supabase = makeClient({ ...ACTIVE, refresh_required: true });
    const out = await setActiveSociety(supabase, "s1");
    expect(supabase.rpc).toHaveBeenCalledWith("set_active_society", { p_society_id: "s1" });
    expect(supabase.auth.refreshSession).toHaveBeenCalledTimes(1);
    expect(out.societyId).toBe("s1");
    expect(out.refreshed).toBe(true);
  });

  it("setActiveSociety reports refreshed:false instead of swallowing a refresh failure", async () => {
    const supabase = makeClient(ACTIVE, { refreshError: { message: "expired" } });
    expect((await setActiveSociety(supabase, "s1")).refreshed).toBe(false);
  });

  it("setActiveSociety throws NOT_A_MEMBER without refreshing", async () => {
    const supabase = makeClient(null, { error: new Error("NOT_A_MEMBER") });
    await expect(setActiveSociety(supabase, "other")).rejects.toThrow("NOT_A_MEMBER");
    expect(supabase.auth.refreshSession).not.toHaveBeenCalled();
  });
});

describe("profile + family", () => {
  it("upsertMyProfile forwards name + signup intent", async () => {
    const supabase = makeClient({ user_id: "u1", full_name: "Rahul" });
    const out = await upsertMyProfile(supabase, { fullName: "Rahul", signupIntent: "member" });
    expect(supabase.rpc).toHaveBeenCalledWith("upsert_my_profile", {
      p_full_name: "Rahul",
      p_signup_intent: "member",
    });
    expect(out).toEqual({ userId: "u1", fullName: "Rahul" });
  });

  it("updateMyEmergencyContact clears with null for an empty string", async () => {
    const supabase = makeClient(null);
    await updateMyEmergencyContact(supabase, { membershipId: "m1", emergencyContact: "" });
    expect(supabase.rpc).toHaveBeenCalledWith("update_my_emergency_contact", {
      p_membership_id: "m1",
      p_emergency_contact: null,
    });
  });

  it("addFamilyMembers maps camelCase members to the RPC payload", async () => {
    const supabase = makeClient({ added: 1, skipped: 0 });
    const out = await addFamilyMembers(supabase, {
      membershipId: "m1",
      members: [{ name: "Asha", phone: "", relation: "Mother", isResident: false }],
    });
    expect(supabase.rpc).toHaveBeenCalledWith("add_family_members", {
      p_membership_id: "m1",
      p_members: [{ name: "Asha", phone: null, relation: "Mother", is_resident: false }],
    });
    expect(out).toEqual({ added: 1, skipped: 0 });
  });
});

describe("onboardResident", () => {
  it("formats the code, calls onboard_resident and refreshes on success", async () => {
    const supabase = makeClient({ society_id: "s1", status: "pending_review" });
    const out = await onboardResident(supabase, {
      code: "par7xkm2",
      flatId: "f1",
      fullName: "Rahul",
      residency: "owner",
      family: [{ name: "Asha" }],
    });
    expect(supabase.rpc).toHaveBeenCalledWith("onboard_resident", {
      p_code: "PAR7-XKM2",
      p_flat_id: "f1",
      p_full_name: "Rahul",
      p_residency: "owner",
      p_alt_phone: null,
      p_family: [{ name: "Asha", phone: null, relation: null, is_resident: true }],
    });
    expect(out).toEqual({ societyId: "s1", status: "pending_review", refreshed: true });
  });

  it("returns the inline { error } without refreshing", async () => {
    const supabase = makeClient({ error: "MEMBERSHIP_REMOVED" });
    const out = await onboardResident(supabase, {
      code: "PAR7-XKM2",
      flatId: "f1",
      fullName: "Rahul",
      residency: "owner",
    });
    expect(out).toEqual({ error: "MEMBERSHIP_REMOVED" });
    expect(supabase.auth.refreshSession).not.toHaveBeenCalled();
  });
});

describe("review queue", () => {
  it("approvePendingMembership returns approved + auto-rejected ids", async () => {
    const supabase = makeClient({ approved: "m1", rejected: ["m2", "m3"] });
    expect(await approvePendingMembership(supabase, "m1")).toEqual({
      approved: "m1",
      rejected: ["m2", "m3"],
    });
    expect(supabase.rpc).toHaveBeenCalledWith("approve_pending_membership", {
      p_membership_id: "m1",
    });
  });

  it("rejectPendingMembership calls reject_pending_membership", async () => {
    const supabase = makeClient({ rejected: "m2" });
    expect(await rejectPendingMembership(supabase, "m2")).toEqual({ rejected: "m2" });
  });

  it("throws NOT_PENDING and rpcErrorCode extracts it", async () => {
    const supabase = makeClient(null, { error: new Error("NOT_PENDING") });
    const err = await approvePendingMembership(supabase, "m1").catch((e) => e);
    expect(rpcErrorCode(err)).toBe("NOT_PENDING");
  });
});

describe("secretary setup", () => {
  it("secretaryAddBoardMember maps status + membership id", async () => {
    const supabase = makeClient({ status: "not_registered", membership_id: null });
    const out = await secretaryAddBoardMember(supabase, {
      societyId: "s1",
      phone: "9876543210",
      flatId: "f1",
    });
    expect(supabase.rpc).toHaveBeenCalledWith("secretary_add_board_member", {
      p_society_id: "s1",
      p_phone: "9876543210",
      p_flat_id: "f1",
    });
    expect(out).toEqual({ status: "not_registered", membershipId: null });
  });

  it("secretaryAddSetupAmenities maps isCustom → is_custom", async () => {
    const supabase = makeClient({ inserted: 2, skipped: 1 });
    const out = await secretaryAddSetupAmenities(supabase, {
      societyId: "s1",
      amenities: [{ name: "Gym" }, { name: "Terrace", isCustom: true }],
    });
    expect(supabase.rpc).toHaveBeenCalledWith("secretary_add_setup_amenities", {
      p_society_id: "s1",
      p_amenities: [
        { name: "Gym", is_custom: false },
        { name: "Terrace", is_custom: true },
      ],
    });
    expect(out).toEqual({ inserted: 2, skipped: 1 });
  });
});

describe("rpcErrorCode", () => {
  it("returns null for unknown / missing errors", () => {
    expect(rpcErrorCode(new Error("boom"))).toBeNull();
    expect(rpcErrorCode(undefined)).toBeNull();
  });
});
