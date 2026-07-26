// Unit tests for the non-Supabase logic in src/notifications.js.
// Real DB behavior is exercised by tests/isolation/notifications.test.js (Plan 05-01).
// Here we mock the supabase client and assert wiring shapes.

import { describe, expect, it, vi } from "vitest";
import {
  ensureNotificationPreferences,
  fileNotification,
  markNoticeRead,
  NOTIFICATION_CATEGORY,
  NOTIFICATION_KIND,
  subscribeToNotices,
} from "../notifications.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeRpcClient(rpcImpl) {
  return { rpc: vi.fn(rpcImpl) };
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
  const client = { channel: channelFn, removeChannel };
  return { client, channel, onFn, removeChannel };
}

// ---------------------------------------------------------------------------
// Enum re-exports
// ---------------------------------------------------------------------------

describe("enum re-exports", () => {
  it("re-exports NOTIFICATION_KIND with general + poll", () => {
    expect(NOTIFICATION_KIND.GENERAL).toBe("general");
    expect(NOTIFICATION_KIND.POLL).toBe("poll");
  });

  it("re-exports NOTIFICATION_CATEGORY with the 5 cross-phase categories", () => {
    expect(NOTIFICATION_CATEGORY.COMPLAINTS).toBe("complaints");
    expect(NOTIFICATION_CATEGORY.POLLS).toBe("polls");
    expect(NOTIFICATION_CATEGORY.COMMUNITY).toBe("community");
    expect(NOTIFICATION_CATEGORY.FINES).toBe("fines");
    expect(NOTIFICATION_CATEGORY.GENERAL).toBe("general");
  });
});

// ---------------------------------------------------------------------------
// fileNotification — UUID generation, poll options array, RPC params
// ---------------------------------------------------------------------------

describe("fileNotification", () => {
  it("pre-generates a UUID when none is supplied and passes p_ named params", async () => {
    const supabase = makeRpcClient(async () => ({
      data: { notification_id: "n-1", society_id: "soc-1", poll_id: null },
      error: null,
    }));
    const result = await fileNotification(supabase, {
      title: "Water cut",
      body: "Sunday 9am-12pm",
    });
    expect(result).toEqual({ notificationId: "n-1", societyId: "soc-1", pollId: null });

    const call = supabase.rpc.mock.calls[0];
    expect(call[0]).toBe("file_notification");
    expect(call[1].p_title).toBe("Water cut");
    expect(call[1].p_body).toBe("Sunday 9am-12pm");
    expect(call[1].p_category).toBe("general");
    expect(typeof call[1].p_notification_id).toBe("string");
    expect(call[1].p_notification_id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );
    expect(call[1].p_storage_key).toBeNull();
    expect(call[1].p_mime_type).toBeNull();
    expect(call[1].p_byte_size).toBeNull();
    expect(call[1].p_poll_question).toBeNull();
    expect(call[1].p_poll_options).toBeNull();
  });

  it("passes p_poll_options as an array when a poll is supplied", async () => {
    const supabase = makeRpcClient(async () => ({
      data: { notification_id: "n-2", society_id: "soc-1", poll_id: "p-1" },
      error: null,
    }));
    const result = await fileNotification(supabase, {
      title: "New gym hours?",
      body: "Pick one",
      category: NOTIFICATION_CATEGORY.POLLS,
      pollQuestion: "Preferred hours",
      pollOptions: ["Morning", "Evening"],
    });
    expect(result).toEqual({ notificationId: "n-2", societyId: "soc-1", pollId: "p-1" });

    const call = supabase.rpc.mock.calls[0][1];
    expect(call.p_category).toBe("polls");
    expect(call.p_poll_question).toBe("Preferred hours");
    expect(Array.isArray(call.p_poll_options)).toBe(true);
    expect(call.p_poll_options).toEqual(["Morning", "Evening"]);
  });

  it("respects a caller-supplied noticeId (attachment upload chain)", async () => {
    const supabase = makeRpcClient(async () => ({
      data: { notification_id: "given-id", society_id: "soc-1", poll_id: null },
      error: null,
    }));
    await fileNotification(supabase, {
      title: "Notice",
      body: "Body text here",
      noticeId: "given-id",
      storageKey: "soc-1/notifications/given-id/doc.pdf",
      mimeType: "application/pdf",
      byteSize: 54321,
    });
    const call = supabase.rpc.mock.calls[0][1];
    expect(call.p_notification_id).toBe("given-id");
    expect(call.p_storage_key).toBe("soc-1/notifications/given-id/doc.pdf");
    expect(call.p_mime_type).toBe("application/pdf");
    expect(call.p_byte_size).toBe(54321);
  });

  it("throws on RPC errors (e.g. INSUFFICIENT_ROLE)", async () => {
    const err = new Error("INSUFFICIENT_ROLE");
    const supabase = makeRpcClient(async () => ({ data: null, error: err }));
    await expect(fileNotification(supabase, { title: "x", body: "yyyyyyyyyy" })).rejects.toBe(err);
  });
});

// ---------------------------------------------------------------------------
// ensureNotificationPreferences — idempotent UPSERT (D-05)
// ---------------------------------------------------------------------------

describe("ensureNotificationPreferences", () => {
  function makePrefsClient(upsertImpl, userId = "user-1") {
    const upsertFn = vi.fn(upsertImpl ?? (async () => ({ data: null, error: null })));
    return {
      client: {
        auth: { getUser: vi.fn(async () => ({ data: { user: { id: userId } }, error: null })) },
        from: vi.fn(() => ({ upsert: upsertFn })),
      },
      upsertFn,
    };
  }

  it("upserts the D-04 default row with onConflict user_id,society_id", async () => {
    const { client, upsertFn } = makePrefsClient();
    const result = await ensureNotificationPreferences(client, "soc-1");
    expect(result).toBe(true);
    expect(client.from).toHaveBeenCalledWith("notification_preferences");
    const [row, opts] = upsertFn.mock.calls[0];
    expect(row.user_id).toBe("user-1");
    expect(row.society_id).toBe("soc-1");
    expect(row.mute_complaints).toBe(false);
    expect(row.mute_polls).toBe(false);
    expect(row.mute_community).toBe(false);
    expect(row.mute_fines).toBe(false);
    expect(row.mute_general).toBe(false);
    expect(row.quiet_start).toBe("22:00");
    expect(row.quiet_end).toBe("07:00");
    expect(row.cap_per_day).toBe(20);
    expect(opts).toEqual({ onConflict: "user_id,society_id", ignoreDuplicates: true });
  });

  it("never trusts a client-supplied user id — derives it from auth.getUser (T-05-13)", async () => {
    const { client, upsertFn } = makePrefsClient(undefined, "auth-user-99");
    await ensureNotificationPreferences(client, "soc-1");
    expect(client.auth.getUser).toHaveBeenCalledOnce();
    expect(upsertFn.mock.calls[0][0].user_id).toBe("auth-user-99");
  });

  it("is idempotent — a second call does not throw (ignoreDuplicates)", async () => {
    const { client } = makePrefsClient();
    await ensureNotificationPreferences(client, "soc-1");
    await expect(ensureNotificationPreferences(client, "soc-1")).resolves.toBe(true);
  });

  it("returns false when there is no auth user", async () => {
    const upsertFn = vi.fn();
    const client = {
      auth: { getUser: vi.fn(async () => ({ data: { user: null }, error: null })) },
      from: vi.fn(() => ({ upsert: upsertFn })),
    };
    const result = await ensureNotificationPreferences(client, "soc-1");
    expect(result).toBe(false);
    expect(client.from).not.toHaveBeenCalled();
  });

  it("throws when the upsert fails", async () => {
    const { client } = makePrefsClient(async () => ({ data: null, error: new Error("boom") }));
    await expect(ensureNotificationPreferences(client, "soc-1")).rejects.toThrow("boom");
  });
});

// ---------------------------------------------------------------------------
// markNoticeRead — fast-follow no-op stub (UI-SPEC Read/Unread Tracking)
// ---------------------------------------------------------------------------

describe("markNoticeRead", () => {
  it("is a no-op stub that resolves true without touching the DB", async () => {
    const supabase = { from: vi.fn(), rpc: vi.fn() };
    const result = await markNoticeRead(supabase, "n-1");
    expect(result).toBe(true);
    expect(supabase.from).not.toHaveBeenCalled();
    expect(supabase.rpc).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// subscribeToNotices — INSERT channel scoped by societyId
// ---------------------------------------------------------------------------

describe("subscribeToNotices", () => {
  it("creates a society-scoped INSERT channel and returns cleanup", () => {
    const { client, channel, onFn, removeChannel } = makeChannelClient();
    const handlers = { onInsert: vi.fn(), onConnected: vi.fn() };

    const cleanup = subscribeToNotices(client, "soc-1", handlers);

    expect(client.channel).toHaveBeenCalledWith("notifications-soc-1");
    expect(onFn).toHaveBeenCalledTimes(1);
    expect(onFn.mock.calls[0][0]).toBe("postgres_changes");
    expect(onFn.mock.calls[0][1]).toMatchObject({
      event: "INSERT",
      schema: "public",
      table: "notifications",
      filter: "society_id=eq.soc-1",
    });
    expect(handlers.onConnected).toHaveBeenCalledOnce();

    onFn.mock.calls[0][2]({ new: { id: "n-1" } });
    expect(handlers.onInsert).toHaveBeenCalledWith({ id: "n-1" });

    cleanup();
    expect(removeChannel).toHaveBeenCalledWith(channel);
  });

  it("does not throw when handlers are omitted", () => {
    const { client } = makeChannelClient();
    expect(() => subscribeToNotices(client, "soc-1", {})).not.toThrow();
  });
});
