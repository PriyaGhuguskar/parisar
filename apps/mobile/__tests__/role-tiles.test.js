/**
 * Unit tests for apps/mobile/lib/role-tiles.js.
 *
 * Locks the role-aware tile contract from UI-SPEC §Role-Aware Tile Set with
 * the iteration-2 user override: Member and Board both receive the same
 * placeholders including Staff. Admin roles (secretary, co_secretary) swap
 * Staff for Flat Actions so the total tile count stays at 11.
 *
 * Phase 5 (DT-02): the notices / polls / bookings placeholders flipped LIVE in
 * place — live:true + a (tabs)-nested route, phase:null, key/icon/labelKey
 * untouched.
 *
 * Phase 6 (DT-02): community (all roles) + flatActions (admin-only) flipped LIVE
 * in place the same way — live:true + a (tabs)-nested route, phase:null. The
 * member-facing flat-actions surface is route-only (NO member flatActions tile,
 * NO 4th bottom-nav tab). The live/placeholder split per role is now:
 *   member       -> 7 live  + 2 placeholders (visitors, staff)       = 9
 *   board_member -> 7 live  + 2 placeholders (visitors, staff)       = 9
 *   secretary    -> 10 live + 1 placeholder  (visitors)              = 11
 *   co_secretary -> identical to secretary                           = 11
 */

import { getRoleTiles } from "../lib/role-tiles";

describe("getRoleTiles — tile counts per role", () => {
  it("member returns 9 tiles (7 live + 2 placeholders)", () => {
    const tiles = getRoleTiles("member");
    expect(tiles).toHaveLength(9);
    expect(tiles.filter((t) => t.live)).toHaveLength(7);
    expect(tiles.filter((t) => !t.live)).toHaveLength(2);
  });

  it("board_member returns 9 tiles (7 live + 2 placeholders)", () => {
    const tiles = getRoleTiles("board_member");
    expect(tiles).toHaveLength(9);
    expect(tiles.filter((t) => t.live)).toHaveLength(7);
    expect(tiles.filter((t) => !t.live)).toHaveLength(2);
  });

  it("secretary returns 11 tiles (10 live + 1 placeholder)", () => {
    const tiles = getRoleTiles("secretary");
    expect(tiles).toHaveLength(11);
    expect(tiles.filter((t) => t.live)).toHaveLength(10);
    expect(tiles.filter((t) => !t.live)).toHaveLength(1);
  });

  it("co_secretary returns the same tile set as secretary", () => {
    expect(getRoleTiles("co_secretary")).toEqual(getRoleTiles("secretary"));
  });

  it("undefined role falls back to the member set", () => {
    expect(getRoleTiles(undefined)).toEqual(getRoleTiles("member"));
  });
});

describe("getRoleTiles — first-live-tile per role", () => {
  it("member first tile is myComplaints, live, route to /(protected)/(tabs)/my-complaints", () => {
    const t = getRoleTiles("member")[0];
    expect(t.key).toBe("myComplaints");
    expect(t.live).toBe(true);
    expect(t.route).toBe("/(protected)/(tabs)/my-complaints");
  });

  it("board_member first tile is allComplaints, live, route to /(protected)/(tabs)/complaints", () => {
    const t = getRoleTiles("board_member")[0];
    expect(t.key).toBe("allComplaints");
    expect(t.live).toBe(true);
    expect(t.route).toBe("/(protected)/(tabs)/complaints");
  });
});

describe("getRoleTiles — admin-only live tiles", () => {
  it("secretary has reviews tile with pending_reviews badge", () => {
    const reviews = getRoleTiles("secretary").find((t) => t.key === "reviews");
    expect(reviews).toEqual(expect.objectContaining({ live: true, badge: "pending_reviews" }));
  });

  it("secretary has codeRotation tile with days_until_rotation badge", () => {
    const rot = getRoleTiles("secretary").find((t) => t.key === "codeRotation");
    expect(rot).toEqual(expect.objectContaining({ live: true, badge: "days_until_rotation" }));
  });

  it("member does NOT have reviews or codeRotation tiles", () => {
    const tiles = getRoleTiles("member");
    expect(tiles.find((t) => t.key === "reviews")).toBeUndefined();
    expect(tiles.find((t) => t.key === "codeRotation")).toBeUndefined();
  });
});

describe("getRoleTiles — placeholder contract", () => {
  it("placeholder tiles always have live=false, route=null, numeric phase, labelKey starting with tiles.", () => {
    for (const role of ["member", "board_member", "secretary", "co_secretary"]) {
      getRoleTiles(role)
        .filter((t) => !t.live)
        .forEach((t) => {
          expect(t.live).toBe(false);
          expect(t.route).toBeNull();
          expect(typeof t.phase).toBe("number");
          expect(t.labelKey).toMatch(/^tiles\./);
        });
    }
  });

  it("member has visitors placeholder (phase 9)", () => {
    const v = getRoleTiles("member").find((t) => t.key === "visitors");
    expect(v).toEqual(expect.objectContaining({ live: false, phase: 9 }));
  });

  it("member has staff placeholder (phase 10) — per user decision Member matches Board", () => {
    const s = getRoleTiles("member").find((t) => t.key === "staff");
    expect(s).toEqual(expect.objectContaining({ live: false, phase: 10 }));
  });

  it("board_member has staff placeholder (phase 10)", () => {
    const s = getRoleTiles("board_member").find((t) => t.key === "staff");
    expect(s).toEqual(expect.objectContaining({ live: false, phase: 10 }));
  });

  it("secretary does NOT have staff placeholder (admin slot replaced by flatActions)", () => {
    const s = getRoleTiles("secretary").find((t) => t.key === "staff");
    expect(s).toBeUndefined();
  });

  it("secretary flatActions tile is now LIVE (Phase 6 DT-02 flip — no longer a placeholder)", () => {
    const f = getRoleTiles("secretary").find((t) => t.key === "flatActions");
    expect(f).toEqual(expect.objectContaining({ live: true, phase: null }));
  });

  it("placeholder order in member set: visitors, staff (post-Phase-6 DT-02 flip)", () => {
    const placeholders = getRoleTiles("member")
      .filter((t) => !t.live)
      .map((t) => t.key);
    expect(placeholders).toEqual(["visitors", "staff"]);
  });

  it("placeholder order in secretary set: visitors only (post-Phase-6 DT-02 flip)", () => {
    const placeholders = getRoleTiles("secretary")
      .filter((t) => !t.live)
      .map((t) => t.key);
    expect(placeholders).toEqual(["visitors"]);
  });
});

describe("getRoleTiles — DT-02 Phase 6 tile activation (community + flatActions)", () => {
  it("community is live for ALL roles with the (tabs)-nested route, phase:null, no badge", () => {
    for (const role of ["member", "board_member", "secretary", "co_secretary"]) {
      const t = getRoleTiles(role).find((x) => x.key === "community");
      expect(t).toEqual(
        expect.objectContaining({
          key: "community",
          labelKey: "tiles.community",
          live: true,
          route: "/(protected)/(tabs)/community",
          phase: null,
          badge: null,
        }),
      );
    }
  });

  it("flatActions is live for ADMIN roles only, with the (tabs)-nested route, phase:null", () => {
    for (const role of ["secretary", "co_secretary"]) {
      const t = getRoleTiles(role).find((x) => x.key === "flatActions");
      expect(t).toEqual(
        expect.objectContaining({
          key: "flatActions",
          labelKey: "tiles.flatActions",
          live: true,
          route: "/(protected)/(tabs)/flat-actions",
          phase: null,
        }),
      );
    }
  });

  it("there is NO member/board flatActions tile (D-05 — admin-only issuer surface)", () => {
    for (const role of ["member", "board_member"]) {
      expect(getRoleTiles(role).find((x) => x.key === "flatActions")).toBeUndefined();
    }
  });
});

describe("getRoleTiles — DT-02 Phase 5 tile activation", () => {
  it("notices is live with the (tabs)-nested route and no badge (read-tracking deferred)", () => {
    const t = getRoleTiles("member").find((x) => x.key === "notices");
    expect(t).toEqual(
      expect.objectContaining({
        key: "notices",
        labelKey: "tiles.notices",
        live: true,
        route: "/(protected)/(tabs)/notices",
        phase: null,
        badge: null,
      }),
    );
  });

  it("polls is live with the (tabs)-nested route and no badge", () => {
    const t = getRoleTiles("member").find((x) => x.key === "polls");
    expect(t).toEqual(
      expect.objectContaining({
        key: "polls",
        labelKey: "tiles.polls",
        live: true,
        route: "/(protected)/(tabs)/polls",
        phase: null,
        badge: null,
      }),
    );
  });

  it("bookings is live; members get no badge, board roles get pending_bookings", () => {
    const member = getRoleTiles("member").find((x) => x.key === "bookings");
    expect(member).toEqual(
      expect.objectContaining({
        key: "bookings",
        labelKey: "tiles.bookings",
        live: true,
        route: "/(protected)/(tabs)/bookings",
        badge: null,
      }),
    );
    for (const role of ["board_member", "co_secretary", "secretary"]) {
      const board = getRoleTiles(role).find((x) => x.key === "bookings");
      expect(board.badge).toBe("pending_bookings");
      expect(board.live).toBe(true);
    }
  });

  it("DT-02 flip preserves key/icon/labelKey on the three now-live tiles", () => {
    const tiles = getRoleTiles("member");
    for (const key of ["notices", "polls", "bookings"]) {
      const t = tiles.find((x) => x.key === key);
      expect(t.icon).toBeTruthy(); // icon component still present
      expect(t.labelKey).toBe(`tiles.${key}`);
    }
  });
});
