/**
 * Society onboarding: public connect requests and the staff console. Migrations 060, 074.
 * Runs against the real database with throwaway users.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  adminClient,
  anonClient,
  clearRateBuckets,
  codeOf,
  createFixture,
  randomPhone,
} from "./helpers/onboarding.js";

const fx = createFixture();
let staff;
let resident;

const inAnHour = () => new Date(Date.now() + 3600_000).toISOString();
const later = (h) => new Date(Date.now() + h * 3600_000).toISOString();

async function submit(overrides = {}) {
  const res = await anonClient().rpc("submit_connect_request", {
    p_society_name: "Green Meadows",
    p_contact_name: "Asha Patil",
    p_phone: randomPhone(),
    p_preferred_at: inAnHour(),
    ...overrides,
  });
  return res;
}

async function requestId(code) {
  const { data } = await adminClient()
    .from("society_enrollment_requests")
    .select("id")
    .eq("request_code", code)
    .single();
  fx.requestIds.push(data.id);
  return data.id;
}

beforeAll(async () => {
  await clearRateBuckets([
    "rpc:connect:ip",
    "rpc:connect:phone",
    "rpc:connect_status:ip",
    "rpc:connect_status:code",
  ]);
  staff = await fx.staff();
  resident = await fx.user();
}, 120_000);

// The per-address limit (10/hour) is real and this suite submits more than that from
// one address; the per-phone limit has its own test below.
beforeEach(async () => {
  await clearRateBuckets(["rpc:connect:ip"]);
});

afterAll(async () => {
  await fx.cleanup();
  await clearRateBuckets([
    "rpc:connect:ip",
    "rpc:connect:phone",
    "rpc:connect_status:ip",
    "rpc:connect_status:code",
  ]);
}, 120_000);

describe("public connect request", () => {
  it("returns a request code, slot and status, and nothing else", async () => {
    const phone = randomPhone();
    const { data, error } = await submit({
      p_phone: phone,
      p_email: "Asha@Example.com",
      p_authority_numbers: [{ name: "Bala", phone: randomPhone() }],
      p_alternate_at: later(5),
      p_message: "Please call in the evening",
    });
    expect(error).toBeNull();
    await requestId(data.request_code);
    expect(data.request_code).toMatch(/^PR-[A-Z2-9]{4}-[A-Z2-9]{4}$/);
    expect(data.status).toBe("call_scheduled");
    expect(data.preferred_at).toBeTruthy();
    expect(data.alternate_at).toBeTruthy();
    expect(data).not.toHaveProperty("id");
    expect(data).not.toHaveProperty("society_name");
    expect(data).not.toHaveProperty("authority_numbers");
  });

  it("a second open request for the same number gets no code back", async () => {
    const phone = randomPhone();
    const first = await submit({ p_phone: phone });
    await requestId(first.data.request_code);
    const second = await submit({ p_phone: phone });
    expect(second.error).toBeNull();
    expect(second.data).toEqual({ error: "REQUEST_ALREADY_OPEN" });
  });

  it("validates its input", async () => {
    expect(codeOf(await submit({ p_phone: "12345" }))).toBe("INVALID_PHONE");
    expect(codeOf(await submit({ p_society_name: "x" }))).toBe("INVALID_SOCIETY_NAME");
    expect(codeOf(await submit({ p_email: "nope" }))).toBe("INVALID_EMAIL");
    expect(codeOf(await submit({ p_preferred_at: null }))).toBe("SLOT_REQUIRED");
    expect(codeOf(await submit({ p_preferred_at: later(-5) }))).toBe("SLOT_IN_PAST");
    expect(codeOf(await submit({ p_authority_numbers: [{ phone: "1" }] }))).toBe(
      "INVALID_AUTHORITY_NUMBER",
    );
  });

  it("is rate limited per phone", async () => {
    await clearRateBuckets(["rpc:connect:phone"]);
    const phone = randomPhone();
    const admin = adminClient();
    const made = await submit({ p_phone: phone });
    await requestId(made.data.request_code);
    await admin.from("edge_rate_events").insert([
      { bucket: "rpc:connect:phone", subject: phone },
      { bucket: "rpc:connect:phone", subject: phone },
    ]);
    expect(codeOf(await submit({ p_phone: phone }))).toBe("RATE_LIMITED");
  });

  it("is rate limited per address", async () => {
    const admin = adminClient();
    const probe = await submit();
    await requestId(probe.data.request_code);
    const { data: seen } = await admin
      .from("edge_rate_events")
      .select("subject")
      .eq("bucket", "rpc:connect:ip")
      .limit(1);
    await admin
      .from("edge_rate_events")
      .insert(
        Array.from({ length: 10 }, () => ({ bucket: "rpc:connect:ip", subject: seen[0].subject })),
      );
    expect(codeOf(await submit())).toBe("RATE_LIMITED");
  });

  it("anon can read nothing back from the table", async () => {
    const { data } = await anonClient().from("society_enrollment_requests").select("id, phone");
    expect(data ?? []).toEqual([]);
  });

  it("status lookup needs the code AND the phone", async () => {
    const phone = randomPhone();
    const { data: made } = await submit({ p_phone: phone });
    await requestId(made.request_code);

    const ok = await anonClient().rpc("get_connect_request_status", {
      p_request_code: made.request_code,
      p_phone: phone,
    });
    expect(ok.data.status).toBe("call_scheduled");
    expect(ok.data).not.toHaveProperty("society_name");

    const wrong = await anonClient().rpc("get_connect_request_status", {
      p_request_code: made.request_code,
      p_phone: randomPhone(),
    });
    expect(wrong.data).toEqual({ error: "REQUEST_NOT_FOUND" });
  });

  it("the table takes no direct inserts; submit_connect_request is the only way in (091)", async () => {
    const phone = randomPhone();
    const row = {
      society_name: "Old Form Society",
      contact_name: "Old Form",
      phone: `+91${phone}`,
      preferred_slot: "Right now",
      call_now: true,
    };
    const asAnon = await anonClient().from("society_enrollment_requests").insert(row);
    expect(asAnon.error?.message ?? "").toMatch(/permission denied/i);
    const asUser = await resident.client.from("society_enrollment_requests").insert(row);
    expect(asUser.error?.message ?? "").toMatch(/permission denied/i);
    const { count } = await adminClient()
      .from("society_enrollment_requests")
      .select("id", { count: "exact", head: true })
      .eq("phone", `+91${phone}`);
    expect(count).toBe(0);
  });
});

describe("staff connect request console", () => {
  it.each([
    ["admin_list_connect_requests", {}],
    ["admin_onboarding_metrics", undefined],
    ["admin_feature_catalogue", undefined],
    ["admin_get_connect_request", { p_request_id: "00000000-0000-0000-0000-000000000000" }],
  ])("%s refuses a resident", async (fn, args) => {
    expect(codeOf(await resident.rpc(fn, args))).toBe("NOT_PLATFORM_STAFF");
  });

  it("anon cannot execute staff RPCs", async () => {
    const { error } = await anonClient().rpc("admin_onboarding_metrics");
    expect(error).not.toBeNull();
  });

  it("lists with search, filter and pagination", async () => {
    const name = `Searchable ${Date.now()}`;
    const a = await submit({ p_society_name: name });
    const b = await submit({ p_society_name: name });
    await requestId(a.data.request_code);
    await requestId(b.data.request_code);

    const page1 = await staff.rpc("admin_list_connect_requests", { p_search: name, p_limit: 1 });
    expect(page1.error).toBeNull();
    expect(page1.data.total).toBe(2);
    expect(page1.data.items).toHaveLength(1);
    const page2 = await staff.rpc("admin_list_connect_requests", {
      p_search: name,
      p_limit: 1,
      p_offset: 1,
    });
    expect(page2.data.items[0].id).not.toBe(page1.data.items[0].id);

    const byCode = await staff.rpc("admin_list_connect_requests", {
      p_search: a.data.request_code,
    });
    expect(byCode.data.total).toBe(1);

    const wildcard = await staff.rpc("admin_list_connect_requests", { p_search: "%%%nothing%%%" });
    expect(wildcard.data.total).toBe(0);

    const closed = await staff.rpc("admin_list_connect_requests", {
      p_search: name,
      p_status: "rejected",
    });
    expect(closed.data.total).toBe(0);

    expect(codeOf(await staff.rpc("admin_list_connect_requests", { p_status: "bogus" }))).toBe(
      "INVALID_STATUS",
    );
  });

  it("finds a request by phone number, and only when the text is a phone number", async () => {
    const phone = randomPhone();
    const { data: made } = await submit({ p_phone: phone });
    await requestId(made.request_code);
    const hit = await staff.rpc("admin_list_connect_requests", { p_search: `+91 ${phone}` });
    expect(hit.data.items.map((r) => r.request_code)).toEqual([made.request_code]);
    const notPhone = await staff.rpc("admin_list_connect_requests", { p_search: `x${phone}x` });
    expect(notPhone.data.total).toBe(0);
  });

  it("reschedule, mark called and reject move through the lifecycle", async () => {
    const { data: made } = await submit();
    const id = await requestId(made.request_code);

    const resched = await staff.rpc("admin_reschedule_connect_request", {
      p_request_id: id,
      p_scheduled_at: later(24),
      p_note: "Asked for tomorrow",
    });
    expect(resched.data.status).toBe("rescheduled");
    expect(resched.data.reschedule_count).toBe(1);
    expect(
      codeOf(
        await staff.rpc("admin_reschedule_connect_request", {
          p_request_id: id,
          p_scheduled_at: later(-24),
        }),
      ),
    ).toBe("SLOT_IN_PAST");

    const called = await staff.rpc("admin_mark_connect_called", { p_request_id: id });
    expect(called.data.status).toBe("contacted");
    expect(called.data.called_at).toBeTruthy();

    expect(
      codeOf(await staff.rpc("admin_reject_connect_request", { p_request_id: id, p_reason: "x" })),
    ).toBe("INVALID_REASON");
    const rejected = await staff.rpc("admin_reject_connect_request", {
      p_request_id: id,
      p_reason: "Not a registered society",
    });
    expect(rejected.data.status).toBe("rejected");
    expect(rejected.data.rejected_reason).toBe("Not a registered society");

    expect(codeOf(await staff.rpc("admin_mark_connect_called", { p_request_id: id }))).toBe(
      "REQUEST_CLOSED",
    );

    const view = await staff.rpc("admin_get_connect_request", { p_request_id: id });
    expect(view.data.history.map((h) => h.action)).toEqual(
      expect.arrayContaining(["connect.rescheduled", "connect.called", "connect.rejected"]),
    );
  });

  it("metrics count real rows", async () => {
    const before = await staff.rpc("admin_onboarding_metrics");
    expect(before.error).toBeNull();
    const { data: made } = await submit();
    await requestId(made.request_code);
    const after = await staff.rpc("admin_onboarding_metrics");
    expect(after.data.pending_requests).toBe(before.data.pending_requests + 1);
    expect(after.data.pending_calls).toBe(before.data.pending_calls + 1);
    for (const key of ["total_societies", "active_societies", "total_residents"]) {
      expect(typeof after.data[key]).toBe("number");
    }
  });
});
