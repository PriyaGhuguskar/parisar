// The web tile set on /dashboard: tiles for switched-off modules are hidden and
// placeholders that now have a web screen go live.
// JavaScript only — no TypeScript per CLAUDE.md.

import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));
vi.mock("@/lib/supabase/client", () => ({ createSupabaseBrowserClient: () => ({}) }));

import { webTiles } from "../../../app/(protected)/dashboard/DashboardClient";

const keys = (tiles) => tiles.map((t) => t.key);

describe("webTiles", () => {
  it("keeps every tile while the feature list is unknown", () => {
    expect(keys(webTiles("member", null))).toEqual(
      expect.arrayContaining(["myComplaints", "notices", "polls", "bookings"]),
    );
  });

  it("hides tiles whose module is switched off", () => {
    const shown = keys(webTiles("member", ["notices", "complaints", "sos"]));
    expect(shown).toContain("notices");
    expect(shown).toContain("myComplaints");
    for (const key of ["polls", "bookings", "community", "visitors", "staff"]) {
      expect(shown).not.toContain(key);
    }
  });

  it("makes visitors and staff live with their web routes", () => {
    // The staff tile is a resident tile; authorities reach staff from the sidebar.
    const tiles = webTiles("member", ["visitors", "staff_directory", "notices"]);
    const visitors = tiles.find((t) => t.key === "visitors");
    const staff = tiles.find((t) => t.key === "staff");
    expect(visitors).toMatchObject({ live: true, route: "/visitors", phase: null });
    expect(staff).toMatchObject({ live: true, route: "/staff", phase: null });
  });
});
