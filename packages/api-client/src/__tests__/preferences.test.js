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
// getNotificationPreferences — own table row merged with D-04 defaults (D-06)
// ---------------------------------------------------------------------------

describe("getNotificationPreferences", () => {
  function makeReadClient(row, error = null) {
    const maybeSingle = vi.fn(async () => ({ data: row, error }));
    const eq2 = vi.fn(() => ({ maybeSingle }));
    const eq1 = vi.fn(() => ({ eq: eq2 }));
    const select = vi.fn(() => ({ eq: eq1 }));
    const from = vi.fn(() => ({ select }));
    return { client: { from }, from, select, eq1, eq2, maybeSingle };
  }

  it("reads the caller's table row (the effective VIEW is service-only since 054)", async () => {
    const row = {
      user_id: "user-1",
      society_id: "soc-1",
      mute_complaints: false,
      mute_polls: true,
      mute_community: false,
      mute_fines: false,
      mute_general: false,
      quiet_start: "23:00:00",
      quiet_end: "06:00:00",
      cap_per_day: 5,
    };
    const { client, from, eq1, eq2 } = makeReadClient(row);
    const result = await getNotificationPreferences(client, "soc-1", "user-1");

    expect(from).toHaveBeenCalledWith("notification_preferences");
    expect(from).not.toHaveBeenCalledWith("notification_preferences_effective");
    expect(eq1).toHaveBeenCalledWith("user_id", "user-1");
    expect(eq2).toHaveBeenCalledWith("society_id", "soc-1");
    expect(result).toEqual(row);
  });

  it("returns the D-04 defaults when the member has no row yet", async () => {
    const { client } = makeReadClient(null);
    const result = await getNotificationPreferences(client, "soc-1", "user-1");
    expect(result).toEqual({
      user_id: "user-1",
      society_id: "soc-1",
      mute_complaints: false,
      mute_polls: false,
      mute_community: false,
      mute_fines: false,
      mute_general: false,
      quiet_start: "22:00:00",
      quiet_end: "07:00:00",
      cap_per_day: 20,
    });
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
  function makeUpsertClient(result = { data: [{ id: "row-1" }], error: null }, userId = "user-1") {
    const select = vi.fn(async () => result);
    const upsertFn = vi.fn(() => ({ select }));
    return {
      client: {
        auth: { getUser: vi.fn(async () => ({ data: { user: { id: userId } }, error: null })) },
        from: vi.fn(() => ({ upsert: upsertFn })),
      },
      upsertFn,
      select,
    };
  }

  it("upserts the patch on (auth.uid, society_id) and verifies the written row", async () => {
    const { client, upsertFn, select } = makeUpsertClient();
    const result = await updateNotificationPreference(client, "soc-1", { mute_polls: true });
    expect(result).toBe(true);
    expect(client.from).toHaveBeenCalledWith("notification_preferences");
    expect(upsertFn).toHaveBeenCalledWith(
      { mute_polls: true, user_id: "user-1", society_id: "soc-1" },
      { onConflict: "user_id,society_id" },
    );
    expect(select).toHaveBeenCalledWith("id");
  });

  it("supports a quiet-hours patch", async () => {
    const { client, upsertFn } = makeUpsertClient();
    await updateNotificationPreference(client, "soc-1", {
      quiet_start: "23:00",
      quiet_end: "06:00",
    });
    expect(upsertFn.mock.calls[0][0]).toMatchObject({ quiet_start: "23:00", quiet_end: "06:00" });
  });

  it("throws PREFERENCES_NOT_SAVED when no row comes back (e.g. RLS filtered it)", async () => {
    const { client } = makeUpsertClient({ data: [], error: null });
    await expect(
      updateNotificationPreference(client, "soc-1", { mute_polls: true }),
    ).rejects.toThrow("PREFERENCES_NOT_SAVED");
  });

  it("rejects unknown / identity columns before touching the network", async () => {
    const { client } = makeUpsertClient();
    await expect(
      updateNotificationPreference(client, "soc-1", { user_id: "someone-else" }),
    ).rejects.toThrow("INVALID_PREFERENCE_PATCH");
    await expect(updateNotificationPreference(client, "soc-1", {})).rejects.toThrow(
      "INVALID_PREFERENCE_PATCH",
    );
    expect(client.from).not.toHaveBeenCalled();
  });

  it("returns false when there is no auth user", async () => {
    const client = {
      auth: { getUser: vi.fn(async () => ({ data: { user: null }, error: null })) },
      from: vi.fn(),
    };
    expect(await updateNotificationPreference(client, "soc-1", { mute_polls: true })).toBe(false);
    expect(client.from).not.toHaveBeenCalled();
  });

  it("throws on upsert errors", async () => {
    const err = new Error("rls");
    const { client } = makeUpsertClient({ data: null, error: err });
    await expect(updateNotificationPreference(client, "soc-1", { cap_per_day: 10 })).rejects.toBe(
      err,
    );
  });
});
