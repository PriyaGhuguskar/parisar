/**
 * Six-role expansion — roles.js contract tests.
 *
 * This module is the one place web and mobile agree on what the roles are and
 * where each lands. The tests that matter here are the ones that fail loudly
 * when someone adds a seventh role and updates only half the maps — the exact
 * drift that left apps/web/lib/role-tiles.js and apps/mobile/lib/role-tiles.js
 * needing to be reconciled by hand.
 */

import { describe, expect, it } from "vitest";
import {
  BOARD_ROLES,
  canAccessSurface,
  GUARD_ROLE,
  isPlatformRole,
  MEMBERSHIP_ROLE,
  PLATFORM_ROLE,
  ROUTE_ID,
  resolveHomeRouteId,
  resolveHomeSurface,
  SOCIETY_ADMIN_ROLES,
  SURFACE,
  surfaceFromRouteId,
} from "../roles.js";

// Every role a signed-in user can actually hold. ONBOARDING is not in here
// because it is the absence of a role, not one of them.
const ALL_ROLES = [
  PLATFORM_ROLE.ADMIN,
  PLATFORM_ROLE.SALES,
  PLATFORM_ROLE.STAFF,
  GUARD_ROLE,
  MEMBERSHIP_ROLE.SECRETARY,
  MEMBERSHIP_ROLE.CO_SECRETARY,
  MEMBERSHIP_ROLE.BOARD_MEMBER,
  MEMBERSHIP_ROLE.MEMBER,
];

describe("enum values match the Postgres enums", () => {
  // If these drift, the client sends a role string the database has never heard
  // of and the mismatch surfaces as a silent empty result, not an error.
  it("platform roles match public.platform_role", () => {
    expect(Object.values(PLATFORM_ROLE).sort()).toEqual(["admin", "sales", "staff"]);
  });

  it("membership roles match public.membership_role", () => {
    expect(Object.values(MEMBERSHIP_ROLE).sort()).toEqual([
      "board_member",
      "co_secretary",
      "member",
      "secretary",
    ]);
  });

  it("guard is the literal the Auth Hook writes into app_metadata.role", () => {
    expect(GUARD_ROLE).toBe("guard");
  });
});

describe("role sets", () => {
  it("board roles are the three that act on other people's items", () => {
    expect([...BOARD_ROLES].sort()).toEqual(["board_member", "co_secretary", "secretary"]);
  });

  it("society admin roles exclude board_member", () => {
    // A board member responds; a secretary administers. This split is the
    // existing product rule and is easy to "tidy" into being wrong.
    expect(SOCIETY_ADMIN_ROLES.has(MEMBERSHIP_ROLE.BOARD_MEMBER)).toBe(false);
    expect([...SOCIETY_ADMIN_ROLES].sort()).toEqual(["co_secretary", "secretary"]);
  });

  it("isPlatformRole is true only for the three platform roles", () => {
    expect(isPlatformRole(PLATFORM_ROLE.ADMIN)).toBe(true);
    expect(isPlatformRole(PLATFORM_ROLE.SALES)).toBe(true);
    expect(isPlatformRole(PLATFORM_ROLE.STAFF)).toBe(true);
    expect(isPlatformRole(MEMBERSHIP_ROLE.SECRETARY)).toBe(false);
    expect(isPlatformRole(GUARD_ROLE)).toBe(false);
    expect(isPlatformRole(null)).toBe(false);
    expect(isPlatformRole(undefined)).toBe(false);
  });
});

describe("resolveHomeSurface", () => {
  it("gives every known role a surface", () => {
    for (const role of ALL_ROLES) {
      expect(resolveHomeSurface(role)).not.toBe(SURFACE.ONBOARDING);
    }
  });

  it("routes each platform role to its own console", () => {
    expect(resolveHomeSurface(PLATFORM_ROLE.ADMIN)).toBe(SURFACE.CONSOLE_ADMIN);
    expect(resolveHomeSurface(PLATFORM_ROLE.SALES)).toBe(SURFACE.CONSOLE_SALES);
    expect(resolveHomeSurface(PLATFORM_ROLE.STAFF)).toBe(SURFACE.CONSOLE_STAFF);
  });

  it("routes the two primary roles to their own surfaces", () => {
    // Secretary and Member are the two roles the whole product is built around.
    // Without these two lines the suite passes even if their targets are
    // swapped — every other assertion here is either a negative (cannot reach a
    // console) or the loose "is not ONBOARDING" loop, and a secretary landing
    // on the resident dashboard would satisfy both.
    expect(resolveHomeSurface(MEMBERSHIP_ROLE.SECRETARY)).toBe(SURFACE.SECRETARY);
    expect(resolveHomeSurface(MEMBERSHIP_ROLE.MEMBER)).toBe(SURFACE.RESIDENT);
  });

  it("routes co_secretary alongside secretary, and board_member alongside member", () => {
    expect(resolveHomeSurface(MEMBERSHIP_ROLE.CO_SECRETARY)).toBe(SURFACE.SECRETARY);
    expect(resolveHomeSurface(MEMBERSHIP_ROLE.BOARD_MEMBER)).toBe(SURFACE.RESIDENT);
  });

  it("routes a guard to the security surface", () => {
    expect(resolveHomeSurface(GUARD_ROLE)).toBe(SURFACE.SECURITY);
  });

  it("falls back to onboarding rather than the resident dashboard", () => {
    // Defaulting an unknown role to RESIDENT would render an empty dashboard
    // and read as a broken app. Onboarding means "we don't know yet".
    expect(resolveHomeSurface(null)).toBe(SURFACE.ONBOARDING);
    expect(resolveHomeSurface(undefined)).toBe(SURFACE.ONBOARDING);
    expect(resolveHomeSurface("")).toBe(SURFACE.ONBOARDING);
    expect(resolveHomeSurface("watchman")).toBe(SURFACE.ONBOARDING);
  });

  it("is not fooled by prototype keys", () => {
    // SURFACE_BY_ROLE is a plain object literal, so a role of "constructor" or
    // "toString" would otherwise resolve to an inherited function.
    expect(resolveHomeSurface("constructor")).toBe(SURFACE.ONBOARDING);
    expect(resolveHomeSurface("toString")).toBe(SURFACE.ONBOARDING);
    expect(resolveHomeSurface("__proto__")).toBe(SURFACE.ONBOARDING);
  });
});

describe("route ids", () => {
  it("covers every surface except onboarding", () => {
    // Onboarding has a fixed path in each app rather than an id.
    const expected = Object.values(SURFACE).filter((s) => s !== SURFACE.ONBOARDING);
    expect(Object.keys(ROUTE_ID).sort()).toEqual(expected.sort());
  });

  it("are unique", () => {
    const ids = Object.values(ROUTE_ID);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("are URL-safe and carry no hint of the role they belong to", () => {
    // The point of an opaque id is that /console/<id> does not announce which
    // one is the admin console. A readable slug would defeat it entirely.
    for (const [surface, id] of Object.entries(ROUTE_ID)) {
      expect(id).toMatch(/^[a-z0-9]{6,12}$/);
      expect(id).not.toContain(surface);
      for (const word of [
        "admin",
        "sales",
        "staff",
        "secretary",
        "resident",
        "security",
        "guard",
      ]) {
        expect(id).not.toContain(word);
      }
    }
  });

  it("round-trips through surfaceFromRouteId", () => {
    for (const [surface, id] of Object.entries(ROUTE_ID)) {
      expect(surfaceFromRouteId(id)).toBe(surface);
    }
  });

  it("returns null for an unknown id rather than guessing", () => {
    // A gate must treat a typo and an unauthorised id identically — neither may
    // confirm whether the id was real.
    expect(surfaceFromRouteId("nope")).toBeNull();
    expect(surfaceFromRouteId("")).toBeNull();
    expect(surfaceFromRouteId(null)).toBeNull();
    expect(surfaceFromRouteId("constructor")).toBeNull();
  });

  it("gives every role a route id", () => {
    for (const role of ALL_ROLES) {
      expect(resolveHomeRouteId(role)).toBeTruthy();
    }
  });

  it("gives an unknown role no route id", () => {
    expect(resolveHomeRouteId(null)).toBeNull();
    expect(resolveHomeRouteId("watchman")).toBeNull();
  });
});

describe("canAccessSurface", () => {
  it("admits a role only to its own surface", () => {
    expect(canAccessSurface(PLATFORM_ROLE.ADMIN, SURFACE.CONSOLE_ADMIN)).toBe(true);
    expect(canAccessSurface(PLATFORM_ROLE.SALES, SURFACE.CONSOLE_ADMIN)).toBe(false);
    expect(canAccessSurface(PLATFORM_ROLE.STAFF, SURFACE.CONSOLE_ADMIN)).toBe(false);
  });

  it("keeps a guard out of the resident and secretary surfaces", () => {
    // The bug this guards: (protected)/layout.jsx currently gates on getUser()
    // alone, so a guard who types the dashboard URL gets the full resident
    // shell with every query returning empty.
    expect(canAccessSurface(GUARD_ROLE, SURFACE.RESIDENT)).toBe(false);
    expect(canAccessSurface(GUARD_ROLE, SURFACE.SECRETARY)).toBe(false);
    expect(canAccessSurface(GUARD_ROLE, SURFACE.SECURITY)).toBe(true);
  });

  it("admits secretary and resident to their own surfaces", () => {
    expect(canAccessSurface(MEMBERSHIP_ROLE.SECRETARY, SURFACE.SECRETARY)).toBe(true);
    expect(canAccessSurface(MEMBERSHIP_ROLE.MEMBER, SURFACE.RESIDENT)).toBe(true);
    // …and not to each other's.
    expect(canAccessSurface(MEMBERSHIP_ROLE.MEMBER, SURFACE.SECRETARY)).toBe(false);
    expect(canAccessSurface(MEMBERSHIP_ROLE.SECRETARY, SURFACE.RESIDENT)).toBe(false);
  });

  it("keeps a resident out of every console", () => {
    for (const surface of [SURFACE.CONSOLE_ADMIN, SURFACE.CONSOLE_SALES, SURFACE.CONSOLE_STAFF]) {
      expect(canAccessSurface(MEMBERSHIP_ROLE.MEMBER, surface)).toBe(false);
      expect(canAccessSurface(MEMBERSHIP_ROLE.SECRETARY, surface)).toBe(false);
    }
  });

  it("admits nobody when the role is unknown", () => {
    for (const surface of Object.values(SURFACE)) {
      if (surface === SURFACE.ONBOARDING) continue;
      expect(canAccessSurface(null, surface)).toBe(false);
    }
  });
});
