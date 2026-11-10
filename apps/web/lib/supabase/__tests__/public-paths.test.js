// @vitest-environment node
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const getUser = vi.fn();
vi.mock("@supabase/ssr", () => ({
  createServerClient: () => ({ auth: { getUser } }),
}));

const { isPublicPath, publicRedirectFor, updateSession } = await import("../middleware");

describe("onboarding public paths", () => {
  it.each(["/connect", "/connect/", "/connect/success", "/invite/abc123", "/invite/abc123/"])(
    "%s is reachable signed out",
    (path) => {
      expect(isPublicPath(path)).toBe(true);
    },
  );

  it.each(["/invite", "/invite/", "/invite/abc/admin", "/connect/other", "/connected"])(
    "%s stays behind sign-in",
    (path) => {
      expect(isPublicPath(path)).toBe(false);
    },
  );

  it("keeps /enroll public", () => {
    expect(isPublicPath("/enroll")).toBe(true);
  });
});

describe("publicRedirectFor", () => {
  it("sends /enroll to /connect, with or without a trailing slash", () => {
    expect(publicRedirectFor("/enroll")).toBe("/connect");
    expect(publicRedirectFor("/enroll/")).toBe("/connect");
  });

  it.each(["/", "/connect", "/enrollment", "/enroll/x"])("leaves %s alone", (path) => {
    expect(publicRedirectFor(path)).toBeNull();
  });
});

describe("updateSession", () => {
  beforeEach(() => {
    getUser.mockReset();
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "http://localhost:54321");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "test-anon-key");
  });

  const run = (url) => updateSession(new NextRequest(new URL(url, "http://localhost:3000")));

  it.each([null, { id: "user-1" }])("redirects /enroll to /connect for user %j", async (user) => {
    getUser.mockResolvedValue({ data: { user } });
    const response = await run("/enroll?ref=pricing");
    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe("http://localhost:3000/connect?ref=pricing");
  });

  it("serves /connect and an invite link to a signed-out visitor", async () => {
    getUser.mockResolvedValue({ data: { user: null } });
    expect((await run("/connect")).headers.get("location")).toBeNull();
    expect((await run("/invite/abc123")).headers.get("location")).toBeNull();
  });

  it("still sends a signed-out visitor away from a private page", async () => {
    getUser.mockResolvedValue({ data: { user: null } });
    const response = await run("/society-dashboard");
    expect(response.headers.get("location")).toContain("/login?next=%2Fsociety-dashboard");
  });
});
