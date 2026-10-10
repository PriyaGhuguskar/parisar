// Unit tests for lib/post-login.js — where a user lands after OTP / app start.
// The facts come from the my_login_state() RPC (migration 053).
// JavaScript only — no TypeScript per CLAUDE.md.

import { pinRoute, ROUTES, resolvePostLoginRoute } from "../lib/post-login";

const BASE = {
  staff: false,
  guard: null,
  authority: false,
  membership: null,
  flats_in_society: null,
  family: false,
  pin_set: false,
  service: null,
};

/** supabase-js stand-in: my_login_state answers from `states` in order. */
function fakeSupabase(states, { claim = {} } = {}) {
  const queue = Array.isArray(states) ? [...states] : [states];
  const rpc = jest.fn((fn) => {
    if (fn === "my_login_state") {
      const s = queue.length > 1 ? queue.shift() : queue[0];
      return Promise.resolve({ data: { ...BASE, ...s }, error: null });
    }
    return Promise.resolve({ data: claim, error: null });
  });
  return { rpc, auth: { refreshSession: jest.fn().mockResolvedValue({}) } };
}

const RESIDENT = {
  membership: { flat_id: "f", role: "member", status: "active" },
  service: "active",
};

describe("resolvePostLoginRoute", () => {
  it("staff → staff screen, never onboarding", async () => {
    const sb = fakeSupabase({ staff: true });
    await expect(resolvePostLoginRoute(sb, { atLogin: true })).resolves.toBe(ROUTES.staff);
  });

  it("paused / blocked society → service screen", async () => {
    const sb = fakeSupabase({ ...RESIDENT, service: "paused" });
    await expect(resolvePostLoginRoute(sb, { atLogin: true })).resolves.toBe(ROUTES.service);
  });

  it("resident at login with a PIN → enter PIN, then the app", async () => {
    const sb = fakeSupabase({ ...RESIDENT, pin_set: true });
    await expect(resolvePostLoginRoute(sb, { atLogin: true })).resolves.toBe(
      pinRoute("enter", ROUTES.app),
    );
  });

  it("resident at login without a PIN → set PIN", async () => {
    const sb = fakeSupabase(RESIDENT);
    await expect(resolvePostLoginRoute(sb, { atLogin: true })).resolves.toBe(
      pinRoute("set", ROUTES.app),
    );
  });

  it("resident reopening the app (not at login) → straight to the app", async () => {
    const sb = fakeSupabase({ ...RESIDENT, pin_set: true });
    await expect(resolvePostLoginRoute(sb)).resolves.toBe(ROUTES.app);
  });

  it("first-time guard is claimed, then PIN, then the guard screen", async () => {
    const sb = fakeSupabase({ guard: "unclaimed" });
    await expect(resolvePostLoginRoute(sb, { atLogin: true })).resolves.toBe(
      pinRoute("set", ROUTES.guard),
    );
    expect(sb.rpc).toHaveBeenCalledWith("claim_guard");
    expect(sb.auth.refreshSession).toHaveBeenCalled();
  });

  it("returning guard reopening the app → guard screen", async () => {
    const sb = fakeSupabase({ guard: "claimed", pin_set: true });
    await expect(resolvePostLoginRoute(sb)).resolves.toBe(ROUTES.guard);
    expect(sb.rpc).not.toHaveBeenCalledWith("claim_guard");
  });

  it("first-time authority is claimed and sent to wings/flats setup", async () => {
    const sb = fakeSupabase({ authority: true }, { claim: { needs_setup: true } });
    await expect(resolvePostLoginRoute(sb, { atLogin: true })).resolves.toBe(ROUTES.structure);
    expect(sb.rpc).toHaveBeenCalledWith("claim_society_authority");
  });

  it("claimed authority without a flat → setup when no flats, else onboarding", async () => {
    const m = {
      membership: { flat_id: null, role: "secretary", status: "active" },
      authority: true,
    };
    await expect(resolvePostLoginRoute(fakeSupabase({ ...m, flats_in_society: 0 }))).resolves.toBe(
      ROUTES.structure,
    );
    await expect(
      resolvePostLoginRoute(fakeSupabase({ ...m, flats_in_society: 12 })),
    ).resolves.toBe(ROUTES.onboarding);
  });

  it("pre-entered family member joins without a code, then sets a PIN", async () => {
    const sb = fakeSupabase([{ family: true }, { ...RESIDENT }]);
    await expect(resolvePostLoginRoute(sb, { atLogin: true })).resolves.toBe(
      pinRoute("set", ROUTES.app),
    );
    expect(sb.rpc).toHaveBeenCalledWith("claim_family_membership");
  });

  it("anyone else → society-code onboarding", async () => {
    await expect(resolvePostLoginRoute(fakeSupabase({}), { atLogin: true })).resolves.toBe(
      ROUTES.onboarding,
    );
  });

  it("throws when the state can't be loaded (screen shows a retry)", async () => {
    const sb = { rpc: jest.fn().mockResolvedValue({ data: null, error: { message: "offline" } }) };
    await expect(resolvePostLoginRoute(sb)).rejects.toEqual({ message: "offline" });
  });
});
