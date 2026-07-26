// Jest setup for Expo / React Native.
// Runs after the test framework is installed (setupFilesAfterEnv).
// Add global mocks here as the test surface grows.
//
// Phase 7 Plan 07-03 [Rule 1 — Bug]: ProfileMenuSheet now transitively imports
// `apps/mobile/lib/i18n.js`, which imports `@react-native-async-storage/async-storage`
// at module load. Without a global Jest mock, every test file that renders
// ProfileMenuSheet (or any subtree under HomeScreen) throws
// "NativeModule: AsyncStorage is null" at the top-level require.
//
// This mock follows the package's officially-recommended Jest integration
// (https://react-native-async-storage.github.io/async-storage/docs/advanced/jest).
// Individual tests can still override with their own `jest.mock(...)` factory.
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
      clear: jest.fn(() => {
        store = {};
        return Promise.resolve();
      }),
      getAllKeys: jest.fn(() => Promise.resolve(Object.keys(store))),
      multiGet: jest.fn((keys) =>
        Promise.resolve(keys.map((k) => [k, k in store ? store[k] : null])),
      ),
      multiSet: jest.fn((pairs) => {
        for (const [k, v] of pairs) store[k] = v;
        return Promise.resolve();
      }),
      multiRemove: jest.fn((keys) => {
        for (const k of keys) delete store[k];
        return Promise.resolve();
      }),
    },
  };
});

// Phase 7 Plan 07-03: expo-localization is imported by `lib/i18n.js`. Provide
// a deterministic default so transitive imports don't hit the native module.
// Individual tests can override (e.g. apps/mobile/__tests__/i18n-precedence.test.js
// uses its own mock factory to drive the precedence behaviours).
jest.mock("expo-localization", () => ({
  __esModule: true,
  getLocales: () => [{ languageCode: "en", regionCode: "US" }],
}));

// Phase 7 Plan 07-05: Global react-i18next mock. The mobile retrofit (Plan 07-05)
// converted every screen + component from `import en from "@parisar/i18n/locales/..."`
// to `useTranslation('<ns>')` + `t('dot.path')`. Without a global mock, rendering
// any retrofitted component shows raw key strings ("roleTransfer.heading") instead
// of the English values, breaking 13 pre-existing test suites that grep for
// English text via getByText / findByText.
//
// The mock resolves keys against the actual @parisar/i18n English JSON shards so
// snapshot/assert behavior matches the real-runtime English locale. Supports:
//   - useTranslation('auth') → flat top-level en.json
//   - useTranslation('dashboard') / 'complaints' / ... → per-domain en/<ns>.json
//   - useTranslation(['moderation','community']) → namespace-prefixed keys
//     (t("moderation:moderation.title") or t("community:community.feedTitle"))
//
// Interpolation: `{{name}}` → params.name; absent params fall back to literal token.
// Missing key → returns the key itself (matches i18next default behavior).
jest.mock("react-i18next", () => {
  const enAuth = require("@parisar/i18n/locales/en.json");
  const SHARDS = {
    auth: enAuth,
    dashboard: require("@parisar/i18n/locales/en/dashboard.json"),
    complaints: require("@parisar/i18n/locales/en/complaints.json"),
    notifications: require("@parisar/i18n/locales/en/notifications.json"),
    polls: require("@parisar/i18n/locales/en/polls.json"),
    bookings: require("@parisar/i18n/locales/en/bookings.json"),
    preferences: require("@parisar/i18n/locales/en/preferences.json"),
    "flat-actions": require("@parisar/i18n/locales/en/flat-actions.json"),
    community: require("@parisar/i18n/locales/en/community.json"),
    moderation: require("@parisar/i18n/locales/en/moderation.json"),
  };

  // Walk a dotted path through a nested JSON object. Returns undefined when
  // any segment is missing, so the caller can fall back to defaultValue / key.
  function resolvePath(obj, path) {
    if (!obj || typeof obj !== "object") return undefined;
    const segs = String(path).split(".");
    let cur = obj;
    for (const seg of segs) {
      if (cur && typeof cur === "object" && seg in cur) cur = cur[seg];
      else return undefined;
    }
    return typeof cur === "string" ? cur : undefined;
  }

  // i18next interpolation — replace `{{var}}` with String(params[var]).
  function interpolate(template, params) {
    if (!params || typeof template !== "string") return template;
    return template.replace(/\{\{(\w+)\}\}/g, (match, name) =>
      params[name] !== undefined && params[name] !== null ? String(params[name]) : match,
    );
  }

  // Build a `t()` for one or more active namespaces.
  function buildT(activeNamespaces) {
    const ns = Array.isArray(activeNamespaces) ? activeNamespaces : [activeNamespaces ?? "auth"];
    return function t(key, options) {
      let resolved;
      const params = options && typeof options === "object" ? options : undefined;

      if (typeof key === "string" && key.includes(":")) {
        // Namespace-prefixed lookup: "moderation:grievance.menuRow"
        const [prefix, rest] = key.split(":", 2);
        resolved = resolvePath(SHARDS[prefix], rest);
      } else {
        // Search active namespaces in order; first hit wins (matches i18next).
        for (const n of ns) {
          const v = resolvePath(SHARDS[n], key);
          if (v !== undefined) {
            resolved = v;
            break;
          }
        }
      }

      if (resolved === undefined) {
        if (params && typeof params.defaultValue === "string") {
          return interpolate(params.defaultValue, params);
        }
        return key;
      }
      return interpolate(resolved, params);
    };
  }

  const fakeI18n = { language: "en", changeLanguage: jest.fn().mockResolvedValue(undefined) };

  return {
    __esModule: true,
    useTranslation: (namespaces) => ({
      t: buildT(namespaces),
      i18n: fakeI18n,
      ready: true,
    }),
    // initReactI18next is referenced by packages/i18n/src/create-instance.js. The
    // mock just needs to be a no-op plugin shape with `init: () => {}`.
    initReactI18next: { type: "3rdParty", init: () => {} },
    // Trans component is not used in the mobile retrofit, but expose a passthrough
    // for forward-compat.
    Trans: ({ children, i18nKey }) => children ?? i18nKey ?? null,
    I18nextProvider: ({ children }) => children,
  };
});
