// Unit tests for the non-Supabase logic in src/complaints.js.
// Real DB behavior is exercised by tests/isolation/complaints.test.js (Plan 04-01).
// Here we mock the supabase client and assert wiring shapes.

import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  addComplaintResponse,
  COMPLAINT_KIND,
  COMPLAINT_STATUS,
  COMPLAINTS_BUCKET,
  claimComplaint,
  fetchUnreadComplaintCount,
  fileComplaint,
  RESPONSE_LABELS,
  registerPushToken,
  subscribeToComplaintResponses,
  subscribeToComplaints,
  unregisterPushToken,
} from "../complaints.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeRpcClient(rpcImpl) {
  return {
    rpc: vi.fn(rpcImpl),
  };
}

function makeChannelClient() {
  const subscribeFn = vi.fn(function subscribeFn(cb) {
    if (cb) cb("SUBSCRIBED");
    return this;
  });
  const onFn = vi.fn(function onFn() {
    return this;
  });
  const channel = { on: onFn, subscribe: subscribeFn };
  const channelFn = vi.fn(() => channel);
  const removeChannel = vi.fn();
  const client = {
    channel: channelFn,
    removeChannel,
    _channel: channel,
  };
  return { client, channel, onFn, subscribeFn, removeChannel };
}

// ---------------------------------------------------------------------------
// Enum re-exports
// ---------------------------------------------------------------------------

describe("enum re-exports", () => {
  it("re-exports COMPLAINT_KIND with society + member", () => {
    expect(COMPLAINT_KIND.SOCIETY).toBe("society");
    expect(COMPLAINT_KIND.MEMBER).toBe("member");
  });

  it("re-exports COMPLAINT_STATUS with the 5 server-side enum values", () => {
    expect(COMPLAINT_STATUS.OPEN).toBe("open");
    expect(COMPLAINT_STATUS.CHECKING).toBe("checking");
    expect(COMPLAINT_STATUS.WILL_RESOLVE).toBe("will_resolve");
    expect(COMPLAINT_STATUS.NEED_INFO).toBe("need_info");
    expect(COMPLAINT_STATUS.RESOLVED).toBe("resolved");
  });

  it("maps RESPONSE_LABELS for every non-open status", () => {
    expect(RESPONSE_LABELS.checking).toBe("Checking");
    expect(RESPONSE_LABELS.will_resolve).toBe("Will resolve soon");
    expect(RESPONSE_LABELS.need_info).toBe("Need more info");
    expect(RESPONSE_LABELS.resolved).toBe("Resolved");
  });

  it("exposes the canonical storage bucket name", () => {
    expect(COMPLAINTS_BUCKET).toBe("parisar-attachments");
  });
});

// ---------------------------------------------------------------------------
// claimComplaint — race lost (null) vs claimed
// ---------------------------------------------------------------------------

describe("claimComplaint", () => {
  it("returns { claimed: false } when the RPC returns null (race lost)", async () => {
    const supabase = makeRpcClient(async () => ({ data: null, error: null }));
    const result = await claimComplaint(supabase, {
      complaintId: "c-1",
      responseKind: COMPLAINT_STATUS.CHECKING,
    });
    expect(result).toEqual({ claimed: false });
    expect(supabase.rpc).toHaveBeenCalledWith("claim_complaint", {
      p_complaint_id: "c-1",
      p_response_kind: "checking",
      p_free_text: null,
    });
  });

  it("returns { claimed: true, complaint } when the RPC returns a row", async () => {
    const row = { id: "c-1", owner_id: "user-A", status: "checking" };
    const supabase = makeRpcClient(async () => ({ data: row, error: null }));
    const result = await claimComplaint(supabase, {
      complaintId: "c-1",
      responseKind: COMPLAINT_STATUS.CHECKING,
      freeText: "looking into it",
    });
    expect(result).toEqual({ claimed: true, complaint: row });
    expect(supabase.rpc).toHaveBeenCalledWith("claim_complaint", {
      p_complaint_id: "c-1",
      p_response_kind: "checking",
      p_free_text: "looking into it",
    });
  });

  it("throws on RPC errors", async () => {
    const err = new Error("INSUFFICIENT_ROLE");
    const supabase = makeRpcClient(async () => ({ data: null, error: err }));
    await expect(
      claimComplaint(supabase, {
        complaintId: "c-1",
        responseKind: COMPLAINT_STATUS.CHECKING,
      }),
    ).rejects.toBe(err);
  });
});

// ---------------------------------------------------------------------------
// addComplaintResponse — passes through new UUID
// ---------------------------------------------------------------------------

describe("addComplaintResponse", () => {
  it("returns the new response UUID from the RPC", async () => {
    const supabase = makeRpcClient(async () => ({
      data: "11111111-1111-1111-1111-111111111111",
      error: null,
    }));
    const id = await addComplaintResponse(supabase, {
      complaintId: "c-1",
      responseKind: COMPLAINT_STATUS.RESOLVED,
      freeText: "fixed",
    });
    expect(id).toBe("11111111-1111-1111-1111-111111111111");
    expect(supabase.rpc).toHaveBeenCalledWith("add_complaint_response", {
      p_complaint_id: "c-1",
      p_response_kind: "resolved",
      p_free_text: "fixed",
    });
  });

  it("throws on NOT_OWNER errors", async () => {
    const err = new Error("NOT_OWNER");
    const supabase = makeRpcClient(async () => ({ data: null, error: err }));
    await expect(
      addComplaintResponse(supabase, {
        complaintId: "c-1",
        responseKind: COMPLAINT_STATUS.RESOLVED,
      }),
    ).rejects.toBe(err);
  });
});

// ---------------------------------------------------------------------------
// fileComplaint — UUID generated when not supplied, RPC params match migration
// ---------------------------------------------------------------------------

describe("fileComplaint", () => {
  it("calls file_complaint with all p_ named params and a client-generated UUID", async () => {
    const supabase = makeRpcClient(async () => ({
      data: { complaint_id: "abc", society_id: "soc-1" },
      error: null,
    }));
    const result = await fileComplaint(supabase, {
      kind: COMPLAINT_KIND.SOCIETY,
      description: "leaky pipe",
      reporterFlatId: "flat-1",
    });
    expect(result).toEqual({ complaintId: "abc", societyId: "soc-1" });

    const call = supabase.rpc.mock.calls[0];
    expect(call[0]).toBe("file_complaint");
    expect(call[1].p_kind).toBe("society");
    expect(call[1].p_description).toBe("leaky pipe");
    expect(call[1].p_reporter_flat_id).toBe("flat-1");
    expect(call[1].p_language_code).toBe("en");
    expect(typeof call[1].p_complaint_id).toBe("string");
    // UUID v4 shape: 8-4-4-4-12
    expect(call[1].p_complaint_id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );
    expect(call[1].p_storage_key).toBeNull();
    expect(call[1].p_mime_type).toBeNull();
    expect(call[1].p_byte_size).toBeNull();
  });

  it("respects a caller-supplied complaintId (photo upload chain)", async () => {
    const supabase = makeRpcClient(async () => ({
      data: { complaint_id: "given-id", society_id: "soc-1" },
      error: null,
    }));
    await fileComplaint(supabase, {
      kind: COMPLAINT_KIND.MEMBER,
      description: "noise",
      reporterFlatId: "flat-1",
      complaintId: "given-id",
      storageKey: "soc-1/complaints/given-id/photo.jpg",
      mimeType: "image/jpeg",
      byteSize: 12345,
    });
    const call = supabase.rpc.mock.calls[0][1];
    expect(call.p_complaint_id).toBe("given-id");
    expect(call.p_storage_key).toBe("soc-1/complaints/given-id/photo.jpg");
    expect(call.p_mime_type).toBe("image/jpeg");
    expect(call.p_byte_size).toBe(12345);
  });
});

// ---------------------------------------------------------------------------
// subscribeToComplaints — channel + cleanup
// ---------------------------------------------------------------------------

describe("subscribeToComplaints", () => {
  it("creates a channel scoped by societyId and returns a cleanup fn", () => {
    const { client, channel, onFn, removeChannel } = makeChannelClient();
    const handlers = {
      onInsert: vi.fn(),
      onUpdate: vi.fn(),
      onConnected: vi.fn(),
    };

    const cleanup = subscribeToComplaints(client, "soc-1", handlers);

    expect(client.channel).toHaveBeenCalledWith(expect.stringMatching(/^complaints-soc-1:/));
    // Two .on() calls — one for INSERT, one for UPDATE.
    expect(onFn).toHaveBeenCalledTimes(2);
    expect(onFn.mock.calls[0][0]).toBe("postgres_changes");
    expect(onFn.mock.calls[0][1]).toMatchObject({
      event: "INSERT",
      schema: "public",
      table: "complaints",
      filter: "society_id=eq.soc-1",
    });
    expect(onFn.mock.calls[1][1]).toMatchObject({
      event: "UPDATE",
      schema: "public",
      table: "complaints",
      filter: "society_id=eq.soc-1",
    });

    // The mock subscribe() calls back with SUBSCRIBED — onConnected fires.
    expect(handlers.onConnected).toHaveBeenCalledOnce();

    // Cleanup removes the channel.
    cleanup();
    expect(removeChannel).toHaveBeenCalledWith(channel);
  });

  it("forwards INSERT payloads to onInsert", () => {
    const { client, onFn } = makeChannelClient();
    const onInsert = vi.fn();
    subscribeToComplaints(client, "soc-1", { onInsert });

    // Invoke the INSERT handler registered with .on()
    const insertCallback = onFn.mock.calls[0][2];
    insertCallback({ new: { id: "c-1", description: "x" } });
    expect(onInsert).toHaveBeenCalledWith({ id: "c-1", description: "x" });
  });

  it("does not throw if handlers are omitted", () => {
    const { client } = makeChannelClient();
    expect(() => subscribeToComplaints(client, "soc-1", {})).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// subscribeToComplaintResponses — single channel per complaint
// ---------------------------------------------------------------------------

describe("subscribeToComplaintResponses", () => {
  it("opens a channel per complaint and returns cleanup", () => {
    const { client, channel, onFn, removeChannel } = makeChannelClient();
    const onInsert = vi.fn();

    const cleanup = subscribeToComplaintResponses(client, "comp-7", onInsert);

    expect(client.channel).toHaveBeenCalledWith(
      expect.stringMatching(/^complaint-responses-comp-7:/),
    );
    expect(onFn).toHaveBeenCalledTimes(1);
    expect(onFn.mock.calls[0][1]).toMatchObject({
      event: "INSERT",
      schema: "public",
      table: "complaint_responses",
      filter: "complaint_id=eq.comp-7",
    });

    // Trigger the registered handler.
    onFn.mock.calls[0][2]({ new: { id: "r-1", complaint_id: "comp-7" } });
    expect(onInsert).toHaveBeenCalledWith({ id: "r-1", complaint_id: "comp-7" });

    cleanup();
    expect(removeChannel).toHaveBeenCalledWith(channel);
  });
});

// ---------------------------------------------------------------------------
// registerPushToken / unregisterPushToken — SECURITY DEFINER RPCs (contract-055)
// ---------------------------------------------------------------------------

describe("registerPushToken", () => {
  let supabase;

  beforeEach(() => {
    supabase = {
      auth: {
        getUser: vi.fn(async () => ({
          data: { user: { id: "user-1" } },
          error: null,
        })),
      },
      rpc: vi.fn(async () => ({ data: { expo_token: "tk", user_id: "user-1" }, error: null })),
      from: vi.fn(),
    };
  });

  it("calls register_push_token (no direct push_tokens upsert, which RLS blocks)", async () => {
    const result = await registerPushToken(supabase, {
      expoToken: "ExponentPushToken[abc]",
      platform: "android",
      deviceLabel: "Pixel 6",
    });
    expect(result).toBe("ExponentPushToken[abc]");
    expect(supabase.rpc).toHaveBeenCalledWith("register_push_token", {
      p_token: "ExponentPushToken[abc]",
      p_platform: "android",
      p_device_label: "Pixel 6",
    });
    expect(supabase.from).not.toHaveBeenCalled();
  });

  it("returns null when there is no auth user", async () => {
    supabase.auth.getUser = vi.fn(async () => ({
      data: { user: null },
      error: null,
    }));
    const result = await registerPushToken(supabase, {
      expoToken: "tk",
      platform: "ios",
    });
    expect(result).toBeNull();
    expect(supabase.rpc).not.toHaveBeenCalled();
  });

  it("throws when the RPC fails (e.g. INVALID_PLATFORM)", async () => {
    supabase.rpc.mockImplementationOnce(async () => ({
      data: null,
      error: new Error("INVALID_PLATFORM"),
    }));
    await expect(registerPushToken(supabase, { expoToken: "tk", platform: "ios" })).rejects.toThrow(
      "INVALID_PLATFORM",
    );
  });
});

describe("unregisterPushToken", () => {
  it("calls unregister_push_token and returns the deleted flag", async () => {
    const supabase = { rpc: vi.fn(async () => ({ data: true, error: null })) };
    expect(await unregisterPushToken(supabase, "tk")).toBe(true);
    expect(supabase.rpc).toHaveBeenCalledWith("unregister_push_token", { p_token: "tk" });
  });

  it("returns false without a network call for an empty token", async () => {
    const supabase = { rpc: vi.fn() };
    expect(await unregisterPushToken(supabase, null)).toBe(false);
    expect(supabase.rpc).not.toHaveBeenCalled();
  });

  it("throws on RPC errors", async () => {
    const supabase = {
      rpc: vi.fn(async () => ({ data: null, error: new Error("AUTH_REQUIRED") })),
    };
    await expect(unregisterPushToken(supabase, "tk")).rejects.toThrow("AUTH_REQUIRED");
  });
});

// ---------------------------------------------------------------------------
// fetchUnreadComplaintCount — responses by others on my complaints since lastSeen
// ---------------------------------------------------------------------------

describe("fetchUnreadComplaintCount", () => {
  function makeResponsesClient(result) {
    const builder = {};
    for (const m of ["select", "eq", "neq", "gt"]) {
      builder[m] = vi.fn(() => builder);
    }
    builder.limit = vi.fn(async () => result);
    return { client: { from: vi.fn(() => builder) }, builder };
  }

  it("counts DISTINCT complaints with a newer response from someone else", async () => {
    const { client, builder } = makeResponsesClient({
      data: [{ complaint_id: "c1" }, { complaint_id: "c1" }, { complaint_id: "c2" }],
      error: null,
    });
    const n = await fetchUnreadComplaintCount(client, {
      userId: "u1",
      since: "2026-10-01T00:00:00.000Z",
    });
    expect(n).toBe(2);
    expect(client.from).toHaveBeenCalledWith("complaint_responses");
    expect(builder.eq).toHaveBeenCalledWith("complaint.reporter_id", "u1");
    expect(builder.neq).toHaveBeenCalledWith("responder_id", "u1");
    expect(builder.gt).toHaveBeenCalledWith("created_at", "2026-10-01T00:00:00.000Z");
  });

  it("returns 0 without querying when there is no lastSeen timestamp or user", async () => {
    const { client } = makeResponsesClient({ data: [], error: null });
    expect(await fetchUnreadComplaintCount(client, { userId: "u1", since: null })).toBe(0);
    expect(await fetchUnreadComplaintCount(client, { userId: null, since: "2026-10-01" })).toBe(0);
    expect(client.from).not.toHaveBeenCalled();
  });

  it("rejects an unparseable timestamp", async () => {
    const { client } = makeResponsesClient({ data: [], error: null });
    await expect(
      fetchUnreadComplaintCount(client, { userId: "u1", since: "not-a-date" }),
    ).rejects.toThrow("INVALID_SINCE");
  });

  it("throws on query errors", async () => {
    const err = new Error("rls");
    const { client } = makeResponsesClient({ data: null, error: err });
    await expect(
      fetchUnreadComplaintCount(client, { userId: "u1", since: "2026-10-01T00:00:00Z" }),
    ).rejects.toBe(err);
  });
});

// ---------------------------------------------------------------------------
// Photo-upload base64 chain — verify the byte conversion (no expo deps needed)
// ---------------------------------------------------------------------------

describe("photo upload base64 chain (deterministic byte conversion)", () => {
  // The exact chain used inside pickAndUploadComplaintPhoto:
  //   base64 → atob → Uint8Array of charCodes → .buffer
  // We replicate the chain here against a known string to catch any regression
  // in the conversion logic (the actual function pulls native modules so we
  // can't run it in Node; this guards the algorithm itself).
  it("base64 → Uint8Array yields the expected byte length and contents", () => {
    const plain = "Hello, Parisar"; // 14 ASCII bytes
    const base64 = Buffer.from(plain, "utf8").toString("base64");
    const binaryStr = atob(base64);
    const bytes = new Uint8Array(binaryStr.length);
    for (let i = 0; i < binaryStr.length; i++) {
      bytes[i] = binaryStr.charCodeAt(i);
    }
    expect(bytes.length).toBe(14);
    expect(Buffer.from(bytes).toString("utf8")).toBe(plain);
    expect(bytes.buffer.byteLength).toBe(14);
  });

  it("handles binary (non-ASCII) bytes correctly", () => {
    const original = new Uint8Array([0x00, 0xff, 0x10, 0x80, 0x7f, 0x42]);
    const base64 = Buffer.from(original).toString("base64");
    const binaryStr = atob(base64);
    const bytes = new Uint8Array(binaryStr.length);
    for (let i = 0; i < binaryStr.length; i++) {
      bytes[i] = binaryStr.charCodeAt(i);
    }
    expect(Array.from(bytes)).toEqual(Array.from(original));
  });
});
