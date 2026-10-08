/**
 * Staff society insights + feature requests (migration …049).
 *
 * Proves, against the real database:
 *   - an authority can request to add / remove a paid feature, with guardrails
 *     (core, already on/off, duplicate pending, non-authority);
 *   - residents cannot read or write requests; staff (not "staff" role) decide;
 *   - approving switches the feature (and is priced/logged like a staff change);
 *   - admin_society_history returns the dated timeline;
 *   - admin_society_monthly reports the current month's paid features and fee.
 *
 * Own society + test phones 9000000025-27 only; cleans up after itself.
 * JavaScript only — no TypeScript.
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { adminClient, refreshSession, signInTestPhone } from "./helpers/phase3.js";

const PHONE = { staffAdmin: "9000000025", authority: "9000000026", resident: "9000000027" };

let staff;
let authority;
let resident;
let societyId;
let code;
const userIds = [];

function errCode(error) {
  return error ? (String(error.message).match(/[A-Z_]{5,}/)?.[0] ?? error.message) : null;
}

beforeAll(async () => {
  staff = await signInTestPhone(PHONE.staffAdmin, "member");
  userIds.push(staff.userId);
  await adminClient()
    .from("platform_admins")
    .upsert({ user_id: staff.userId, role: "admin", note: "insights test" }, { onConflict: "user_id" });

  const { data, error } = await staff.client.rpc("admin_create_society", {
    p_name: "Insights Test Society",
    p_address_line: "2 Insight Road",
    p_city: "Pune",
    p_state: "MH",
    p_pincode: "411002",
    p_landmark: null,
    p_authorities: [{ name: "Ira Authority", phone: PHONE.authority }],
  });
  if (error) throw error;
  societyId = data.society_id;
  code = data.code;

  const sb = adminClient();
  const { data: wing } = await sb
    .from("wings")
    .insert({ society_id: societyId, name: "A" })
    .select("id")
    .single();
  const { data: flats } = await sb
    .from("flats")
    .insert(["1", "2"].map((number) => ({ society_id: societyId, wing_id: wing.id, number })))
    .select("id, number");
  flats.sort((x, y) => x.number.localeCompare(y.number));

  authority = await signInTestPhone(PHONE.authority, "member");
  userIds.push(authority.userId);
  await authority.client.rpc("claim_society_authority");
  await authority.client.rpc("onboard_resident", {
    p_code: code,
    p_flat_id: flats[0].id,
    p_full_name: "Ira Authority",
    p_residency: "owner",
    p_alt_phone: null,
    p_family: [],
  });
  authority = { ...authority, ...(await refreshSession(authority.session.refresh_token)) };

  resident = await signInTestPhone(PHONE.resident, "member");
  userIds.push(resident.userId);
  await resident.client.rpc("onboard_resident", {
    p_code: code,
    p_flat_id: flats[1].id,
    p_full_name: "Rita Resident",
    p_residency: "tenant",
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
  await sb.from("platform_admins").delete().eq("user_id", staff.userId);
  for (const id of userIds) await sb.auth.admin.deleteUser(id).catch(() => {});
});

const req = (client, feature, action, note) =>
  client.rpc("request_feature_change", {
    p_society_id: societyId,
    p_feature_key: feature,
    p_action: action,
    p_note: note ?? null,
  });

describe("requesting a feature change", () => {
  it("an authority can ask to add a paid feature", async () => {
    const { data, error } = await req(authority.client, "polls", "add", "For AGM votes");
    expect(error).toBeNull();
    expect(data.id).toBeTruthy();
  });

  it("guardrails: duplicate pending, core, already off, unknown", async () => {
    expect(errCode((await req(authority.client, "polls", "add")).error)).toBe("ALREADY_REQUESTED");
    expect(errCode((await req(authority.client, "notices", "remove")).error)).toBe("CORE_FEATURE");
    expect(errCode((await req(authority.client, "bookings", "remove")).error)).toBe("NOT_ENABLED");
    expect(errCode((await req(authority.client, "nope", "add")).error)).toBe("UNKNOWN_FEATURE");
  });

  it("a resident cannot request, and cannot read requests", async () => {
    expect(errCode((await req(resident.client, "bookings", "add")).error)).toBe("NOT_AUTHORITY");
    const { data } = await resident.client
      .from("feature_requests")
      .select("id")
      .eq("society_id", societyId);
    expect(data).toEqual([]);
    const direct = await resident.client
      .from("feature_requests")
      .insert({ society_id: societyId, feature_key: "bookings", action: "add" });
    expect(direct.error).toBeTruthy();
  });

  it("the authority sees its own pending request", async () => {
    const { data } = await authority.client
      .from("feature_requests")
      .select("feature_key, action, status")
      .eq("society_id", societyId);
    expect(data).toEqual([{ feature_key: "polls", action: "add", status: "pending" }]);
  });
});

describe("staff decide", () => {
  let requestId;

  it("staff list requests with the feature name and price", async () => {
    const { data, error } = await staff.client.rpc("admin_society_feature_requests", {
      p_society_id: societyId,
    });
    expect(error).toBeNull();
    expect(data[0]).toEqual(
      expect.objectContaining({
        feature_key: "polls",
        action: "add",
        status: "pending",
        note: "For AGM votes",
        requested_by_name: "Ira Authority",
      }),
    );
    requestId = data[0].id;
  });

  it("residents and non-staff cannot decide", async () => {
    const r = await authority.client.rpc("admin_decide_feature_request", {
      p_request_id: requestId,
      p_approve: true,
    });
    expect(errCode(r.error)).toBe("NOT_PLATFORM_STAFF");
  });

  it("approving turns the feature on; deciding twice is refused", async () => {
    const r = await staff.client.rpc("admin_decide_feature_request", {
      p_request_id: requestId,
      p_approve: true,
      p_note: "Enabled from next cycle",
    });
    expect(r.error).toBeNull();
    expect(r.data).toEqual({ status: "approved" });

    const { data: grant } = await adminClient()
      .from("society_features")
      .select("enabled")
      .eq("society_id", societyId)
      .eq("feature_key", "polls")
      .single();
    expect(grant.enabled).toBe(true);

    const again = await staff.client.rpc("admin_decide_feature_request", {
      p_request_id: requestId,
      p_approve: false,
    });
    expect(errCode(again.error)).toBe("ALREADY_DECIDED");
  });

  it("a remove request can be declined (feature stays on)", async () => {
    const { data: made } = await req(authority.client, "polls", "remove", "Too costly");
    const r = await staff.client.rpc("admin_decide_feature_request", {
      p_request_id: made.id,
      p_approve: false,
      p_note: "Discussed on call",
    });
    expect(r.data).toEqual({ status: "declined" });
    const { data: grant } = await adminClient()
      .from("society_features")
      .select("enabled")
      .eq("society_id", societyId)
      .eq("feature_key", "polls")
      .single();
    expect(grant.enabled).toBe(true);
  });
});

describe("history and monthly", () => {
  it("history has the dated story, newest first", async () => {
    const { data, error } = await staff.client.rpc("admin_society_history", {
      p_society_id: societyId,
    });
    expect(error).toBeNull();
    const actions = data.map((e) => e.action);
    for (const a of [
      "society.created_by_admin",
      "authority.claimed",
      "member.joined",
      "feature.requested",
      "feature.changed",
      "feature.request_approved",
      "feature.request_declined",
    ]) {
      expect(actions).toContain(a);
    }
    const times = data.map((e) => Date.parse(e.at));
    expect([...times].sort((x, y) => y - x)).toEqual(times);
    const changed = data.find((e) => e.action === "feature.changed");
    expect(changed.feature_name).toBeTruthy();
    expect(changed.actor_is_staff).toBe(true);
  });

  it("monthly shows this month's paid features and fee", async () => {
    const { data, error } = await staff.client.rpc("admin_society_monthly", {
      p_society_id: societyId,
    });
    expect(error).toBeNull();
    const current = data.find((m) => m.is_current);
    expect(current.features.map((f) => f.key)).toEqual(["polls"]);
    const { data: price } = await adminClient()
      .from("platform_features")
      .select("price_monthly")
      .eq("key", "polls")
      .single();
    expect(current.fee).toBe(price.price_monthly);
    expect(current.changes.map((c) => [c.key, c.enabled])).toEqual([["polls", true]]);
  });

  it("only platform admin/sales can read insights", async () => {
    for (const fn of ["admin_society_history", "admin_society_monthly", "admin_society_feature_requests"]) {
      const r = await resident.client.rpc(fn, { p_society_id: societyId });
      expect(errCode(r.error)).toBe("NOT_PLATFORM_STAFF");
    }
  });
});
