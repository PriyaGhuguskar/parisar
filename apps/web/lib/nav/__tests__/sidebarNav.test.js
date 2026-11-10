// Sidebar navigation model: role groups, feature gating, active item, no dead links.
// JavaScript only — no TypeScript per CLAUDE.md.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import enNav from "@parisar/i18n/locales/en/staff-nav.json";
import { describe, expect, it } from "vitest";
import {
  allNavHrefs,
  buildSidebarNav,
  CORE_FEATURES,
  enabledFeatureKeys,
  featureChecker,
  HIDDEN_NAV_ITEMS,
  matchesPath,
} from "../sidebarNav";

const APP_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../app");
const ALL_ON = () => true;
const ids = (groups) => groups.flatMap((g) => g.items.map((i) => i.id));
const groupIds = (groups) => groups.map((g) => g.id);

describe("enabledFeatureKeys / featureChecker", () => {
  it("keeps only enabled keys", () => {
    const set = enabledFeatureKeys([
      { key: "polls", enabled: true },
      { key: "community", enabled: false },
    ]);
    expect([...set]).toEqual(["polls"]);
  });

  it("returns null for anything that is not a feature list", () => {
    expect(enabledFeatureKeys({ error: "NOT_A_MEMBER" })).toBeNull();
    expect(enabledFeatureKeys(null)).toBeNull();
  });

  it("falls back to core features while the list is unknown", () => {
    const isEnabled = featureChecker(null);
    for (const key of CORE_FEATURES) expect(isEnabled(key)).toBe(true);
    expect(isEnabled("polls")).toBe(false);
  });
});

describe("matchesPath", () => {
  it("matches the route and pages under it", () => {
    expect(matchesPath("/staff", "/staff")).toBe(true);
    expect(matchesPath("/staff", "/staff/manage")).toBe(true);
    expect(matchesPath("/staff", "/staffing")).toBe(false);
  });

  it("matches only the route itself when exact", () => {
    expect(matchesPath("/dashboard", "/dashboard/directory", true)).toBe(false);
  });
});

describe("buildSidebarNav for a manager (authority)", () => {
  const groups = buildSidebarNav({ role: "secretary", isEnabled: ALL_ON, pathname: "/dashboard" });

  it("uses the brief's Society Admin groups that have real modules", () => {
    expect(groupIds(groups)).toEqual([
      "main",
      "society",
      "residents",
      "security",
      "services",
      "communication",
      "settings",
    ]);
  });

  it("never renders Finance, Documents or Reports, which have no module", () => {
    expect(groupIds(groups)).not.toContain("finance");
    expect(groupIds(groups)).not.toContain("documents");
    expect(groupIds(groups)).not.toContain("reports");
  });

  it("links the onboarding flows other screens own", () => {
    const hrefs = groups.flatMap((g) => g.items.map((i) => i.href));
    for (const href of ["/setup", "/import", "/verification/admin", "/approvals", "/household"]) {
      expect(hrefs).toContain(href);
    }
  });

  it("lists Owners, Tenants and Family members", () => {
    expect(ids(groups)).toEqual(expect.arrayContaining(["owners", "tenants", "family"]));
  });

  it("gives every authority the Society Dashboard", () => {
    for (const role of ["secretary", "co_secretary"]) {
      const g = buildSidebarNav({ role, isEnabled: ALL_ON });
      expect(ids(g)).toContain("societyDashboard");
    }
  });

  it("keeps the secretary hand-over for the secretary only", () => {
    expect(ids(groups)).toContain("roleTransfer");
    const co = buildSidebarNav({ role: "co_secretary", isEnabled: ALL_ON });
    expect(ids(co)).not.toContain("roleTransfer");
  });
});

describe("buildSidebarNav for residents", () => {
  it("shows no management items to a member", () => {
    const g = ids(buildSidebarNav({ role: "member", isEnabled: ALL_ON }));
    for (const id of ["societyDashboard", "owners", "importResidents", "staffManage", "setup"]) {
      expect(g).not.toContain(id);
    }
    expect(g).toEqual(expect.arrayContaining(["home", "myComplaints", "notices", "profile"]));
  });

  it("adds all complaints for a board member", () => {
    expect(ids(buildSidebarNav({ role: "board_member", isEnabled: ALL_ON }))).toContain(
      "complaints",
    );
    expect(ids(buildSidebarNav({ role: "member", isEnabled: ALL_ON }))).not.toContain("complaints");
  });
});

describe("feature gating", () => {
  it("hides items whose module is switched off, and empty groups with them", () => {
    const onlyCore = featureChecker(new Set(["notices", "complaints", "sos"]));
    const groups = buildSidebarNav({ role: "secretary", isEnabled: onlyCore });
    const shown = ids(groups);
    for (const id of ["polls", "community", "visitors", "staffManage", "bookings", "directory"]) {
      expect(shown).not.toContain(id);
    }
    expect(shown).toContain("notices");
    expect(groupIds(groups)).not.toContain("security");
  });
});

describe("active item", () => {
  it("marks only the longest matching route", () => {
    const groups = buildSidebarNav({
      role: "secretary",
      isEnabled: ALL_ON,
      pathname: "/staff/manage/x",
    });
    const active = groups.flatMap((g) => g.items).filter((i) => i.active);
    expect(active.map((i) => i.id)).toEqual(["staffManage"]);
  });

  it("does not light up Home on a dashboard sub-page", () => {
    const groups = buildSidebarNav({
      role: "secretary",
      isEnabled: ALL_ON,
      pathname: "/dashboard/directory",
    });
    const active = groups.flatMap((g) => g.items).filter((i) => i.active);
    expect(active.map((i) => i.id)).toEqual(["directory"]);
  });
});

describe("no dead links", () => {
  it("every sidebar route has a page under app/", () => {
    const pageExists = (href) => {
      const rel = href.replace(/^\//, "");
      const candidates = [
        path.join(APP_DIR, "(protected)", rel, "page.jsx"),
        path.join(APP_DIR, rel, "page.jsx"),
      ];
      return candidates.some((p) => fs.existsSync(p));
    };
    // Resident list pages are one dynamic route.
    const missing = allNavHrefs()
      .filter((href) => !href.startsWith("/residents/"))
      .filter((href) => !pageExists(href));
    expect(missing).toEqual([]);
    expect(
      fs.existsSync(path.join(APP_DIR, "(protected)", "residents", "[type]", "page.jsx")),
    ).toBe(true);
  });

  it("every item and group has a label in the staff-nav shard", () => {
    const groups = buildSidebarNav({ role: "secretary", isEnabled: ALL_ON });
    const resident = buildSidebarNav({ role: "board_member", isEnabled: ALL_ON });
    for (const g of [...groups, ...resident]) {
      expect(enNav.group[g.id], `group.${g.id}`).toBeTruthy();
      for (const item of g.items) expect(enNav.nav[item.id], `nav.${item.id}`).toBeTruthy();
    }
  });

  it("records every brief item it hides, with a reason", () => {
    expect(HIDDEN_NAV_ITEMS.length).toBeGreaterThan(0);
    for (const item of HIDDEN_NAV_ITEMS) {
      expect(item.group).toBeTruthy();
      expect(item.reason).toBeTruthy();
    }
    const hiddenGroups = new Set(HIDDEN_NAV_ITEMS.map((i) => i.group));
    for (const g of ["finance", "documents", "reports"]) expect(hiddenGroups.has(g)).toBe(true);
  });
});
