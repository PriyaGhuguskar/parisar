// lib/login-route-gate.js — the splash is the single owner of
// resolvePostLoginRoute; concurrent / re-mounted callers share one run, so the
// claim RPCs inside it run once per login (CODE-REVIEW MEDIUM 11).
// JavaScript only — no TypeScript per CLAUDE.md.

import { isResolvingRoute, resetRouteGate, resolveRouteOnce } from "../lib/login-route-gate";

describe("resolveRouteOnce", () => {
  beforeEach(() => resetRouteGate());

  it("runs the resolver once for concurrent callers of the same user", async () => {
    let release;
    const resolver = jest.fn(
      () =>
        new Promise((r) => {
          release = r;
        }),
    );
    const a = resolveRouteOnce("u1", resolver);
    const b = resolveRouteOnce("u1", resolver);
    expect(isResolvingRoute()).toBe(true);
    await Promise.resolve();
    release("/(protected)/(tabs)");
    await expect(a).resolves.toBe("/(protected)/(tabs)");
    await expect(b).resolves.toBe("/(protected)/(tabs)");
    expect(resolver).toHaveBeenCalledTimes(1);
    expect(isResolvingRoute()).toBe(false);
  });

  it("propagates failures and allows a retry afterwards", async () => {
    await expect(
      resolveRouteOnce("u1", () => Promise.reject(new Error("offline"))),
    ).rejects.toThrow("offline");
    await expect(resolveRouteOnce("u1", async () => "/x")).resolves.toBe("/x");
  });

  it("never shares a resolution across users", async () => {
    const first = resolveRouteOnce("u1", () => new Promise(() => {}));
    const second = resolveRouteOnce("u2", async () => "/y");
    await expect(second).resolves.toBe("/y");
    expect(first).not.toBe(second);
  });
});
