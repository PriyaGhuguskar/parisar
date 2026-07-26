// Phase 7 — Plan 07-03 Task 1: precedence + bootstrap behaviour for the mobile
// i18n runtime helper.
//
// Five behaviours under test (plan §Task 1 <behavior>):
//   1. saved override (`hi`) beats device locale (`en`).
//   2. device locale (`mr`) seeds when nothing saved.
//   3. unsupported device locale (`de`) → DEFAULT_LOCALE fallback.
//   4. changeLanguage("hi") writes AsyncStorage AND flips i18next.language.
//   5. initI18n preloads ALL namespaces (dashboard bundle is resident).

// --- mocks ----------------------------------------------------------------

// Jest cannot resolve dynamic `import("...json")` callbacks (no
// --experimental-vm-modules), so i18next-resources-to-backend silently fails
// to populate bundles. Mock @parisar/i18n's backend so it reads from a static
// map of pre-required JSON shards. The runtime contract (Metro on device does
// resolve dynamic imports) is exercised separately by the package-level
// @parisar/i18n vitest suite (Plan 07-01 Task 1).
jest.mock("@parisar/i18n", () => {
  const enDashboard = require("@parisar/i18n/locales/en/dashboard.json");
  const hiDashboard = require("@parisar/i18n/locales/hi/dashboard.json");
  const mrDashboard = require("@parisar/i18n/locales/mr/dashboard.json");

  const SHARDS = {
    "en/dashboard": enDashboard,
    "hi/dashboard": hiDashboard,
    "mr/dashboard": mrDashboard,
  };

  // Build a minimal i18next-resources-to-backend-compatible plugin.
  const syncBackend = {
    type: "backend",
    init: () => {},
    read: (lng, ns, cb) => {
      const data = SHARDS[`${lng}/${ns}`];
      // Other namespaces (complaints/notifications/...) are not under test —
      // return an empty object so loadNamespaces resolves without errors.
      cb(null, data ?? {});
    },
  };

  return {
    __esModule: true,
    SUPPORTED_LOCALES: ["en", "hi", "mr"],
    DEFAULT_LOCALE: "en",
    NAMESPACES: [
      "dashboard",
      "complaints",
      "notifications",
      "polls",
      "bookings",
      "preferences",
      "flat-actions",
      "community",
      "moderation",
    ],
    AUTH_NAMESPACE: "auth",
    DEFAULT_NS: "dashboard",
    isSupportedLocale: (v) => ["en", "hi", "mr"].includes(v),
    createBackend: () => syncBackend,
    createI18nInstance: async ({ lng, ns = ["dashboard"] } = {}) => {
      const { createInstance } = require("i18next");
      const { initReactI18next } = require("react-i18next");
      const i = createInstance();
      await i
        .use(syncBackend)
        .use(initReactI18next)
        .init({
          lng: lng ?? "en",
          fallbackLng: "en",
          ns,
          defaultNS: "dashboard",
          interpolation: { escapeValue: false },
          react: { useSuspense: false },
          returnNull: false,
        });
      return i;
    },
  };
});

jest.mock("@react-native-async-storage/async-storage", () => {
  let store = {};
  return {
    __esModule: true,
    default: {
      getItem: jest.fn((k) => Promise.resolve(k in store ? store[k] : null)),
      setItem: jest.fn((k, v) => {
        store[k] = v;
        return Promise.resolve();
      }),
      removeItem: jest.fn((k) => {
        delete store[k];
        return Promise.resolve();
      }),
      _reset: () => {
        store = {};
      },
    },
  };
});

const mockGetLocales = jest.fn(() => [{ languageCode: "en" }]);
jest.mock("expo-localization", () => ({
  __esModule: true,
  getLocales: () => mockGetLocales(),
}));

import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  _resetForTests,
  changeLanguage,
  getActiveLanguage,
  initI18n,
  STORAGE_KEY,
} from "../lib/i18n";

describe("apps/mobile/lib/i18n — precedence + bootstrap", () => {
  beforeEach(async () => {
    AsyncStorage._reset();
    _resetForTests();
    mockGetLocales.mockReset();
    mockGetLocales.mockImplementation(() => [{ languageCode: "en" }]);
  });

  it("STORAGE_KEY is 'parisar_lang' (matches UI-SPEC §Screen 4 + plan)", () => {
    expect(STORAGE_KEY).toBe("parisar_lang");
  });

  // Test 1 — saved override beats device locale.
  it("returns the saved override when it is supported (saved=hi > device=en)", async () => {
    await AsyncStorage.setItem(STORAGE_KEY, "hi");
    mockGetLocales.mockImplementation(() => [{ languageCode: "en" }]);

    const lng = await getActiveLanguage();

    expect(lng).toBe("hi");
    expect(AsyncStorage.getItem).toHaveBeenCalledWith(STORAGE_KEY);
  });

  // Test 2 — device locale seeds when no saved override exists.
  it("seeds from device locale when nothing is saved (saved=∅, device=mr → mr)", async () => {
    mockGetLocales.mockImplementation(() => [{ languageCode: "mr" }]);

    const lng = await getActiveLanguage();

    expect(lng).toBe("mr");
  });

  // Test 3 — fallback when saved is absent AND device locale is unsupported.
  it("falls back to DEFAULT_LOCALE when neither override nor device locale is supported", async () => {
    mockGetLocales.mockImplementation(() => [{ languageCode: "de" }]);

    const lng = await getActiveLanguage();

    expect(lng).toBe("en");
  });

  // Test 4 — changeLanguage persists AND applies via i18next.
  it("changeLanguage('hi') writes parisar_lang=hi AND switches i18next.language to hi", async () => {
    // Boot first so the cached i18next instance exists.
    const i18n = await initI18n();
    expect(i18n.language).toBe("en"); // device default mock = en, no saved override

    await changeLanguage("hi");

    const persisted = await AsyncStorage.getItem(STORAGE_KEY);
    expect(persisted).toBe("hi");
    expect(i18n.language).toBe("hi");
  });

  // Test 5 — initI18n preloads namespaces (dashboard.json bundle is resident).
  it("initI18n preloads the dashboard namespace (hasResourceBundle('en','dashboard') === true)", async () => {
    const i18n = await initI18n();

    expect(i18n.hasResourceBundle("en", "dashboard")).toBe(true);
    // sanity: the runtime is the same react-i18next-bound instance
    expect(typeof i18n.t).toBe("function");
    expect(i18n.t("language.title")).toBe("Choose language");
  });

  // Bonus — changeLanguage rejects unsupported locales (T-07-09 mitigation).
  it("changeLanguage rejects values not in SUPPORTED_LOCALES (T-07-09)", async () => {
    await initI18n();
    await expect(changeLanguage("de")).rejects.toThrow(/Unsupported locale/);
    // No write happened.
    const persisted = await AsyncStorage.getItem(STORAGE_KEY);
    expect(persisted).toBeNull();
  });
});
