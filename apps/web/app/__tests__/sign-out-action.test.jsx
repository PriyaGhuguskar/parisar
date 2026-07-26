// Tests for the enhanced web signOutAction (Phase 04.1 Wave 3, Plan 04, Task 1).
//
// T-04.1-02 mitigation: signOutAction must delete this user's web-platform push
// tokens BEFORE clearing the Supabase session, then redirect to /login. The push
// cleanup is defensive — a failure there must not block sign-out.
//
// JavaScript only — no TypeScript per CLAUDE.md.

import { beforeEach, describe, expect, it, vi } from "vitest";

const mockRedirect = vi.fn();
vi.mock("next/navigation", () => ({ redirect: (...a) => mockRedirect(...a) }));

const mockSignOut = vi.fn();
const mockGetUser = vi.fn();
const mockFrom = vi.fn();
vi.mock("../../lib/supabase/server", () => ({
  createSupabaseServerClient: async () => ({
    auth: { signOut: mockSignOut, getUser: mockGetUser },
    from: (...a) => mockFrom(...a),
  }),
}));

import { signOutAction } from "../actions/auth";

describe("signOutAction (T-04.1-02 push-token revocation)", () => {
  beforeEach(() => {
    mockRedirect.mockReset();
    mockSignOut.mockReset();
    mockGetUser.mockReset();
    mockFrom.mockReset();
  });

  it("deletes push_tokens for current user (platform=web) before signOut", async () => {
    const callOrder = [];
    mockGetUser.mockResolvedValue({ data: { user: { id: "u-1" } } });

    // delete().eq("user_id", ...).eq("platform", "web") chain.
    const eqPlatform = vi.fn(async () => {
      callOrder.push("delete");
      return {};
    });
    const eqUser = vi.fn(() => ({ eq: eqPlatform }));
    const del = vi.fn(() => ({ eq: eqUser }));
    mockFrom.mockReturnValue({ delete: del });

    mockSignOut.mockImplementation(async () => {
      callOrder.push("signOut");
      return { error: null };
    });
    mockRedirect.mockImplementation(() => {
      throw new Error("REDIRECT");
    });

    await signOutAction().catch(() => {});

    expect(mockFrom).toHaveBeenCalledWith("push_tokens");
    expect(eqUser).toHaveBeenCalledWith("user_id", "u-1");
    expect(eqPlatform).toHaveBeenCalledWith("platform", "web");
    expect(mockSignOut).toHaveBeenCalled();
    expect(callOrder).toEqual(["delete", "signOut"]);
  });

  it("proceeds with signOut if the push_tokens delete throws (defensive)", async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: "u-1" } } });
    mockFrom.mockImplementation(() => {
      throw new Error("db down");
    });
    mockSignOut.mockResolvedValue({ error: null });
    mockRedirect.mockImplementation(() => {
      throw new Error("REDIRECT");
    });

    await signOutAction().catch(() => {});

    expect(mockSignOut).toHaveBeenCalled();
  });

  it("redirects to /login after signOut", async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: "u-1" } } });
    mockFrom.mockReturnValue({
      delete: () => ({ eq: () => ({ eq: () => Promise.resolve({}) }) }),
    });
    mockSignOut.mockResolvedValue({ error: null });
    mockRedirect.mockImplementation(() => {
      throw new Error("REDIRECT");
    });

    await signOutAction().catch(() => {});

    expect(mockRedirect).toHaveBeenCalledWith("/login");
  });
});
