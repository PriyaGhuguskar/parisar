// Unit tests for the non-Supabase logic in src/preferences.js.
// Real DB behavior (RLS, effective VIEW defaults) is exercised by the isolation
// suite (Plan 05-01). Here we mock the supabase client and assert wiring shapes.

import { describe, expect, it, vi } from "vitest";
import {
  ensureNotificationPreferences,
  getNotificationPreferences,
  updateNotificationPreference,
} from "../preferences.js";

// ---------------------------------------------------------------------------
// getNotificationPreferences — reads from the effective VIEW (D-06)
// ---------------------------------------------------------------------------

describe("getNotificationPreferences", () => {
  function makeReadClient(row, error = null) {
    const single = vi.fn(async () => ({ data: row, error }));
    const eq2 = vi.fn(() => ({ single }));
    const eq1 = vi.fn(() => ({ eq: eq2 }));
    const select = vi.fn(() => ({ eq: eq1 }));
    const from = vi.fn(() => ({ select }));
    return { client: { from }, from, select, eq1, eq2, single };
  }

  it("reads the effective row filtered by user_id + society_id", async () => {
    const row = {
      user_id: "user-1",
      society_id: "soc-1",
      mute_polls: false,
      quiet_start: "22:00:00",
      quiet_end: "07:00:00",
      cap_per_day: 20,
    };
    const { client, from, eq1, eq2 } = makeReadClient(row);
    const result = await getNotificationPreferences(client, "soc-1", "user-1");

    expect(from).toHaveBeenCalledWith("notification_preferences_effective");
    expect(eq1).toHaveBeenCalledWith("user_id", "user-1");
    expect(eq2).toHaveBeenCalledWith("society_id", "soc-1");
    expect(result).toEqual(row);
  });

  it("throws on read errors", async () => {
    const err = new Error("rls");
    const { client } = makeReadClient(null, err);
    await expect(getNotificationPreferences(client, "soc-1", "user-1")).rejects.toBe(err);
  });
});

// ---------------------------------------------------------------------------
// ensureNotificationPreferences — idempotent UPSERT (D-05), auth-derived id
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

  it("upserts the D-04 default row with onConflict user_id,society_id (idempotent)", async () => {
    const { client, upsertFn } = makePrefsClient();
    const result = await ensureNotificationPreferences(client, "soc-1");
    expect(result).toBe(true);
    expect(client.from).toHaveBeenCalledWith("notification_preferences");
    const [row, opts] = upsertFn.mock.calls[0];
    expect(row).toMatchObject({
      user_id: "user-1",
      society_id: "soc-1",
      mute_complaints: false,
      mute_polls: false,
      mute_community: false,
      mute_fines: false,
      mute_general: false,
      quiet_start: "22:00",
      quiet_end: "07:00",
      cap_per_day: 20,
    });
    expect(opts).toEqual({ onConflict: "user_id,society_id", ignoreDuplicates: true });
  });

  it("derives user_id from auth.getUser, never a client arg (T-05-13)", async () => {
    const { client, upsertFn } = makePrefsClient(undefined, "auth-99");
    await ensureNotificationPreferences(client, "soc-1");
    expect(client.auth.getUser).toHaveBeenCalledOnce();
    expect(upsertFn.mock.calls[0][0].user_id).toBe("auth-99");
  });

  it("returns false when there is no auth user", async () => {
    const upsertFn = vi.fn();
    const client = {
      auth: { getUser: vi.fn(async () => ({ data: { user: null }, error: null })) },
      from: vi.fn(() => ({ upsert: upsertFn })),
    };
    expect(await ensureNotificationPreferences(client, "soc-1")).toBe(false);
    expect(client.from).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// updateNotificationPreference — partial patch on (auth.uid, society_id)
// ---------------------------------------------------------------------------

describe("updateNotificationPreference", () => {
  function makeUpdateClient(updateImpl, userId = "user-1") {
    const eq2 = vi.fn(updateImpl ?? (async () => ({ data: null, error: null })));
    const eq1 = vi.fn(() => ({ eq: eq2 }));
    const updateFn = vi.fn(() => ({ eq: eq1 }));
    return {
      client: {
        auth: { getUser: vi.fn(async () => ({ data: { user: { id: userId } }, error: null })) },
        from: vi.fn(() => ({ update: updateFn })),
      },
      updateFn,
      eq1,
      eq2,
    };
  }

  it("updates the row for (auth.uid, society_id) with the partial patch", async () => {
    const { client, updateFn, eq1, eq2 } = makeUpdateClient();
    const result = await updateNotificationPreference(client, "soc-1", { mute_polls: true });
    expect(result).toBe(true);
    expect(client.from).toHaveBeenCalledWith("notification_preferences");
    expect(updateFn).toHaveBeenCalledWith({ mute_polls: true });
    expect(eq1).toHaveBeenCalledWith("user_id", "user-1");
    expect(eq2).toHaveBeenCalledWith("society_id", "soc-1");
  });

  it("supports a quiet-hours patch", async () => {
    const { client, updateFn } = makeUpdateClient();
    await updateNotificationPreference(client, "soc-1", {
      quiet_start: "23:00",
      quiet_end: "06:00",
    });
    expect(updateFn).toHaveBeenCalledWith({ quiet_start: "23:00", quiet_end: "06:00" });
  });

  it("returns false when there is no auth user", async () => {
    const updateFn = vi.fn();
    const client = {
      auth: { getUser: vi.fn(async () => ({ data: { user: null }, error: null })) },
      from: vi.fn(() => ({ update: updateFn })),
    };
    expect(await updateNotificationPreference(client, "soc-1", { mute_polls: true })).toBe(false);
    expect(client.from).not.toHaveBeenCalled();
  });

  it("throws on update errors", async () => {
    const err = new Error("rls");
    const { client } = makeUpdateClient(async () => ({ data: null, error: err }));
    await expect(updateNotificationPreference(client, "soc-1", { cap_per_day: 10 })).rejects.toBe(
      err,
    );
  });
});
