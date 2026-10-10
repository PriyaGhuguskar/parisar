// Unit tests for lib/token-claims.js.
// JavaScript only — no TypeScript per CLAUDE.md.

import { decodeJwtPayload, withTokenClaims } from "../lib/token-claims";

function b64url(obj) {
  return Buffer.from(JSON.stringify(obj))
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}
const jwt = (payload) => `${b64url({ alg: "HS256" })}.${b64url(payload)}.sig`;

describe("decodeJwtPayload", () => {
  it("reads the payload, including non-ASCII text", () => {
    expect(decodeJwtPayload(jwt({ sub: "u1", name: "सोसायटी" }))).toEqual({
      sub: "u1",
      name: "सोसायटी",
    });
  });

  it("returns null for garbage", () => {
    expect(decodeJwtPayload("not-a-jwt")).toBeNull();
    expect(decodeJwtPayload(null)).toBeNull();
  });
});

describe("withTokenClaims", () => {
  const token = jwt({ app_metadata: { society_id: "s1", role: "secretary" } });

  it("merges the token's society and role into user.app_metadata", () => {
    const session = {
      access_token: token,
      user: { id: "u1", app_metadata: { provider: "phone" } },
    };
    const out = withTokenClaims(session);
    expect(out.user.app_metadata).toEqual({
      provider: "phone",
      society_id: "s1",
      role: "secretary",
    });
  });

  it("does not mutate the original session", () => {
    const session = { access_token: token, user: { id: "u1", app_metadata: {} } };
    withTokenClaims(session);
    expect(session.user.app_metadata).toEqual({});
  });

  it("passes through null and token-less sessions", () => {
    expect(withTokenClaims(null)).toBeNull();
    const s = { user: { id: "u1" } };
    expect(withTokenClaims(s)).toBe(s);
  });
});
