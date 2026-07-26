// Phase 7 — Plan 07-01: createI18nInstance + createBackend behavior tests.
//
// Verifies the runtime factory wires:
//   - the resourcesToBackend loader (static-map fast path),
//   - react-i18next initialization,
//   - language switching against the shared en/hi/mr dashboard shard.

import { describe, expect, it } from "vitest";
import { createBackend, createI18nInstance } from "../src/index.js";

describe("createI18nInstance — dashboard namespace lookup", () => {
  it("returns 'My Complaints' for tiles.myComplaints in en", async () => {
    const i18n = await createI18nInstance({ lng: "en", ns: ["dashboard"] });
    expect(i18n.t("tiles.myComplaints", { ns: "dashboard" })).toBe("My Complaints");
  });

  it("returns 'मेरी शिकायतें' for tiles.myComplaints in hi", async () => {
    const i18n = await createI18nInstance({ lng: "hi", ns: ["dashboard"] });
    expect(i18n.t("tiles.myComplaints", { ns: "dashboard" })).toBe("मेरी शिकायतें");
  });

  it("switching lng via changeLanguage updates returned strings", async () => {
    const i18n = await createI18nInstance({ lng: "en", ns: ["dashboard"] });
    expect(i18n.t("tiles.myComplaints", { ns: "dashboard" })).toBe("My Complaints");
    await i18n.changeLanguage("hi");
    // Note: ns must be preloaded for the new language; i18next-resources-to-backend
    // resolves it lazily on first access via t().
    await i18n.loadNamespaces("dashboard");
    expect(i18n.t("tiles.myComplaints", { ns: "dashboard" })).toBe("मेरी शिकायतें");
  });
});

describe("createBackend — static-map fast path", () => {
  it("exposes a `read` function that loads a shard for an (lng, ns) pair", async () => {
    const backend = createBackend();
    // resourcesToBackend returns a plugin with `read(language, namespace, callback)`.
    expect(typeof backend.read).toBe("function");

    const data = await new Promise((resolve, reject) => {
      backend.read("en", "dashboard", (err, value) => {
        if (err) reject(err);
        else resolve(value);
      });
    });

    expect(data).toBeDefined();
    // Sanity: the dashboard shard has the tiles.myComplaints entry.
    expect(data.tiles.myComplaints).toBe("My Complaints");
  });

  it("rejects with a helpful error when the (lng, ns) pair is missing", async () => {
    const backend = createBackend();
    await expect(
      new Promise((resolve, reject) => {
        backend.read("xx", "nope", (err, value) => {
          if (err) reject(err);
          else resolve(value);
        });
      }),
    ).rejects.toThrow(/missing shard xx\/nope/);
  });
});
