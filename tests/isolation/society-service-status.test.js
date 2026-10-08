/**
 * Society service status (migration …050): platform admins can STOP SERVICE
 * (paused) or BLOCK a society with a reason; both are reversible.
 *
 * Proves, against the real database:
 *   - only platform admins may change it (sales / residents refused);
 *   - a reason is required to pause or block;
 *   - while paused, RLS-scoped reads return nothing for the society's members,
 *     and my_society_service_status tells them why;
 *   - blocked also stops the join code (no new residents);
 *   - resuming restores everything.
 *
 * Own society + test phones 9000000014-17 only; cleans up after itself.
 * JavaScript only — no TypeScript.
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { adminClient, refreshSession, signInTestPhone } from "./helpers/phase3.js";

const PHONE = {
  admin: "9000000014",
  sales: "9000000015",
  resident: "9000000016",
  joiner: "9000000017",
};

let admin;
let sales;
let resident;
let joiner;
let societyId;
let code;
let flats;
const userIds = [];

function errCode(error) {
  return error ? (String(error.message).match(/[A-Z_]{5,}/)?.[0] ?? error.message) : null;
}

const setService = (client, status, reason) =>
  client.rpc("admin_set_society_service", {
    p_society_id: societyId,
    p_status: status,
    p_reason: reason ?? null,
  });

async function residentFlatCount() {
  const { data } = await resident.client.from("flats").select("id").eq("society_id", societyId);
  return (data ?? []).length;
}

beforeAll(async () => {
  admin = await signInTestPhone(PHONE.admin, "member");
  sales = await signInTestPhone(PHONE.sales, "member");
  userIds.push(admin.userId, sales.userId);
  const sb = adminClient();
  await sb.from("platform_admins").upsert(
    [
      { user_id: admin.userId, role: "admin", note: "service test" },
      { user_id: sales.userId, role: "sales", note: "service test" },
    ],
    { onConflict: "user_id" },
  );

  const { data, error } = await admin.client.rpc("admin_create_society", {
    p_name: "Service Test Society",
    p_address_line: "3 Service Road",
    p_city: "Pune",
    p_state: "MH",
    p_pincode: "411003",
    p_landmark: null,
    p_authorities: [{ name: "Some Authority", phone: "9876500001" }],
  });
  if (error) throw error;
  societyId = data.society_id;
  code = data.code;

  const { data: wing } = await sb
    .from("wings")
    .insert({ society_id: societyId, name: "A" })
    .select("id")
    .single();
  const { data: made } = await sb
    .from("flats")
    .insert(["1", "2"].map((number) => ({ society_id: societyId, wing_id: wing.id, number })))
    .select("id, number");
  flats = made.sort((x, y) => x.number.localeCompare(y.number));

  resident = await signInTestPhone(PHONE.resident, "member");
  userIds.push(resident.userId);
  await resident.client.rpc("onboard_resident", {
    p_code: code,
    p_flat_id: flats[0].id,
    p_full_name: "Rohan Resident",
    p_residency: "owner",
    p_alt_phone: null,
    p_family: [],
  });
  resident = { ...resident, ...(await refreshSession(resident.session.refresh_token)) };
}, 180_000);

afterAll(async () => {
  const sb = adminClient();
  if (societyId) {
    await sb.from("audit_log").delete().eq("society_id", societyId);
    await sb.from("societies").delete().eq("id", societyId);
  }
  await sb.from("platform_admins").delete().in("user_id", [admin.userId, sales.userId]);
  for (const id of userIds) await sb.auth.admin.deleteUser(id).catch(() => {});
});

describe("who can change service status", () => {
  it("sales and residents are refused", async () => {
    expect(errCode((await setService(sales.client, "paused", "Unpaid invoice")).error)).toBe(
      "NOT_PLATFORM_ADMIN",
    );
    expect(errCode((await setService(resident.client, "paused", "Unpaid invoice")).error)).toBe(
      "NOT_PLATFORM_ADMIN",
    );
  });

  it("a reason is required to pause or block", async () => {
    expect(errCode((await setService(admin.client, "paused", "")).error)).toBe("REASON_REQUIRED");
    expect(errCode((await setService(admin.client, "blocked", "no")).error)).toBe("REASON_REQUIRED");
  });

  it("sales can read the status but not change it", async () => {
    const { data } = await sales.client.rpc("admin_society_service", { p_society_id: societyId });
    expect(data).toEqual(expect.objectContaining({ status: "active", can_change: false }));
  });
});

describe("stop service (paused)", () => {
  it("before: the resident reads their society's flats", async () => {
    expect(await residentFlatCount()).toBe(2);
  });

  it("pausing hides society data from members and shows them the reason", async () => {
    const { data, error } = await setService(admin.client, "paused", "Monthly fee unpaid since August");
    expect(error).toBeNull();
    expect(data).toEqual({ status: "paused", previous: "active" });

    expect(await residentFlatCount()).toBe(0);
    const { data: status } = await resident.client.rpc("my_society_service_status");
    expect(status).toEqual(
      expect.objectContaining({
        society_id: societyId,
        status: "paused",
        reason: "Monthly fee unpaid since August",
      }),
    );
  });

  it("the join code still works while paused (joiners then see the paused screen)", async () => {
    joiner = await signInTestPhone(PHONE.joiner, "member");
    userIds.push(joiner.userId);
    const { data } = await joiner.client.rpc("onboard_flats_for_code", { p_code: code });
    expect(data.error).toBeUndefined();
  });

  it("admin list shows the status and reason", async () => {
    const { data } = await admin.client.rpc("admin_list_societies");
    expect(data.find((s) => s.id === societyId)).toEqual(
      expect.objectContaining({ service_status: "paused", service_reason: "Monthly fee unpaid since August" }),
    );
  });
});

describe("block", () => {
  it("blocking also stops the join code", async () => {
    expect((await setService(admin.client, "blocked", "Terms of service violation")).error).toBeNull();
    const { data } = await joiner.client.rpc("onboard_flats_for_code", { p_code: code });
    expect(data).toEqual({ error: "SOCIETY_BLOCKED" });
    const { data: joined } = await joiner.client.rpc("onboard_resident", {
      p_code: code,
      p_flat_id: flats[1].id,
      p_full_name: "Jaya Joiner",
      p_residency: "tenant",
      p_alt_phone: null,
      p_family: [],
    });
    expect(joined).toEqual({ error: "SOCIETY_BLOCKED" });
    expect(await residentFlatCount()).toBe(0);
  });

  it("resuming restores access and clears the reason", async () => {
    expect((await setService(admin.client, "active")).error).toBeNull();
    expect(await residentFlatCount()).toBe(2);
    const { data: status } = await resident.client.rpc("my_society_service_status");
    expect(status).toEqual(expect.objectContaining({ status: "active", reason: null }));
  });

  it("every change is in the society history", async () => {
    const { data } = await admin.client.rpc("admin_society_history", { p_society_id: societyId });
    const actions = data.map((e) => e.action);
    expect(actions).toEqual(
      expect.arrayContaining([
        "society.service_paused",
        "society.service_blocked",
        "society.service_resumed",
      ]),
    );
  });
});
