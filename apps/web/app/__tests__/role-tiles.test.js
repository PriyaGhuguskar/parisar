/**
 * Unit tests for apps/web/lib/role-tiles.js — Phase 04.1 Wave 0.
 *
 * Web mirror of apps/mobile/__tests__/role-tiles.test.js. Locks the same
 * role-aware tile contract — same tile counts, same keys, same placeholder
 * order, same admin-only badges. Web-specific route strings differ from
 * mobile (Next.js href format).
 */

import { describe, expect, it } from "vitest";
import { getRoleTiles } from "@/lib/role-tiles";

describe("getRoleTiles — tile counts per role", () => {
  // Phase 6 DT-02: community (all roles) + flatActions (admin) flipped live on top
  // of the Phase 5 notices/polls/bookings flip. Total tile count per role is
  // unchanged; each flip moves a placeholder to live.
  //   member/board: 7 live + 2 placeholders (visitors, staff)
  //   secretary:    10 live + 1 placeholder (visitors)
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
  it("member first tile is myComplaints, live, web route /complaints", () => {
    const t = getRoleTiles("member")[0];
    expect(t.key).toBe("myComplaints");
    expect(t.live).toBe(true);
    expect(t.route).toBe("/complaints");
  });

  it("board_member first tile is allComplaints, live, web route /complaints", () => {
    const t = getRoleTiles("board_member")[0];
    expect(t.key).toBe("allComplaints");
    expect(t.live).toBe(true);
    expect(t.route).toBe("/complaints");
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

  it("member has staff placeholder (phase 10)", () => {
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

  it("placeholder order in member set (post-Phase-6-DT-02): visitors, staff", () => {
    const placeholders = getRoleTiles("member")
      .filter((t) => !t.live)
      .map((t) => t.key);
    expect(placeholders).toEqual(["visitors", "staff"]);
  });

  it("placeholder order in secretary set (post-Phase-6-DT-02): visitors", () => {
    const placeholders = getRoleTiles("secretary")
      .filter((t) => !t.live)
      .map((t) => t.key);
    expect(placeholders).toEqual(["visitors"]);
  });
});

describe("getRoleTiles — DT-02 (Phase 6) community/flatActions flip", () => {
  it("community is live for all roles with web href /community; key/icon/labelKey preserved", () => {
    for (const role of ["member", "board_member", "secretary", "co_secretary"]) {
      const c = getRoleTiles(role).find((t) => t.key === "community");
      expect(c).toEqual(
        expect.objectContaining({
          key: "community",
          labelKey: "tiles.community",
          route: "/community",
          live: true,
          phase: null,
          badge: null,
        }),
      );
      expect(c.icon).toBeTruthy();
    }
  });

  it("flatActions is live for admins only with web href /flat-actions; not present for member/board", () => {
    for (const role of ["secretary", "co_secretary"]) {
      const f = getRoleTiles(role).find((t) => t.key === "flatActions");
      expect(f).toEqual(
        expect.objectContaining({
          key: "flatActions",
          labelKey: "tiles.flatActions",
          route: "/flat-actions",
          live: true,
          phase: null,
        }),
      );
    }
    expect(getRoleTiles("member").find((t) => t.key === "flatActions")).toBeUndefined();
    expect(getRoleTiles("board_member").find((t) => t.key === "flatActions")).toBeUndefined();
  });
});

describe("getRoleTiles — DT-02 (Phase 5) notices/polls/bookings flip", () => {
  it("notices/polls/bookings are live with web hrefs; key/icon/labelKey preserved", () => {
    const tiles = getRoleTiles("member");
    const notices = tiles.find((t) => t.key === "notices");
    const polls = tiles.find((t) => t.key === "polls");
    const bookings = tiles.find((t) => t.key === "bookings");

    expect(notices).toEqual(
      expect.objectContaining({
        key: "notices",
        labelKey: "tiles.notices",
        route: "/notices",
        live: true,
      }),
    );
    expect(polls).toEqual(
      expect.objectContaining({
        key: "polls",
        labelKey: "tiles.polls",
        route: "/polls",
        live: true,
      }),
    );
    expect(bookings).toEqual(
      expect.objectContaining({
        key: "bookings",
        labelKey: "tiles.bookings",
        route: "/bookings",
        live: true,
      }),
    );
    // DT-02: icons unchanged — every live Phase 5 tile keeps a defined icon
    // (lucide-react icons are forwardRef objects, so assert truthiness).
    expect(notices.icon).toBeTruthy();
    expect(polls.icon).toBeTruthy();
    expect(bookings.icon).toBeTruthy();
  });

  it("bookings tile carries the pending_bookings badge for board roles only", () => {
    expect(getRoleTiles("board_member").find((t) => t.key === "bookings").badge).toBe(
      "pending_bookings",
    );
    expect(getRoleTiles("secretary").find((t) => t.key === "bookings").badge).toBe(
      "pending_bookings",
    );
    expect(getRoleTiles("member").find((t) => t.key === "bookings").badge).toBeNull();
  });

  it("notices and polls tiles carry no badge (read-tracking deferred fast-follow)", () => {
    const tiles = getRoleTiles("board_member");
    expect(tiles.find((t) => t.key === "notices").badge).toBeNull();
    expect(tiles.find((t) => t.key === "polls").badge).toBeNull();
  });
});
