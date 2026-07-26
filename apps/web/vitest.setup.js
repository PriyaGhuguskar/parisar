import "@testing-library/jest-dom/vitest";
import { vi } from "vitest";

// Phase 7 Plan 07-06: Global react-i18next mock for the web Vitest suite.
// Mirror of apps/mobile/jest.setup.js (Plan 07-05). The web retrofit converts
// every screen + component from `import en from "@parisar/i18n/locales/..."` to
// `useTranslation('<ns>')` + `t('dot.path')`. Without a global mock, rendering
// any retrofitted component shows raw key strings instead of English values,
// breaking pre-existing test suites that grep for English text via
// getByText / findByText.
//
// The mock resolves keys against the actual @parisar/i18n English JSON shards
// so snapshot/assert behavior matches the real-runtime English locale. Supports:
//   - useTranslation('auth') → flat top-level en.json
//   - useTranslation('dashboard') / 'complaints' / ... → per-domain en/<ns>.json
//   - useTranslation(['moderation','community']) → namespace-prefixed keys
//     (t("moderation:moderation.title") or t("community:community.feedTitle"))
//
// Interpolation: `{{name}}` → params.name; absent params fall back to literal token.
// Missing key → returns the key itself (matches i18next default behavior).
//
// Individual tests can still override with their own vi.mock("react-i18next", ...).
vi.mock("react-i18next", async () => {
  const enAuth = (await import("@parisar/i18n/locales/en.json")).default;
  const enDashboard = (await import("@parisar/i18n/locales/en/dashboard.json")).default;
  const enComplaints = (await import("@parisar/i18n/locales/en/complaints.json")).default;
  const enNotifications = (await import("@parisar/i18n/locales/en/notifications.json")).default;
  const enPolls = (await import("@parisar/i18n/locales/en/polls.json")).default;
  const enBookings = (await import("@parisar/i18n/locales/en/bookings.json")).default;
  const enPreferences = (await import("@parisar/i18n/locales/en/preferences.json")).default;
  const enFlatActions = (await import("@parisar/i18n/locales/en/flat-actions.json")).default;
  const enCommunity = (await import("@parisar/i18n/locales/en/community.json")).default;
  const enModeration = (await import("@parisar/i18n/locales/en/moderation.json")).default;
  const SHARDS = {
    auth: enAuth,
    dashboard: enDashboard,
    complaints: enComplaints,
    notifications: enNotifications,
    polls: enPolls,
    bookings: enBookings,
    preferences: enPreferences,
    "flat-actions": enFlatActions,
    community: enCommunity,
    moderation: enModeration,
  };

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

  function interpolate(template, params) {
    if (!params || typeof template !== "string") return template;
    return template.replace(/\{\{(\w+)\}\}/g, (match, name) =>
      params[name] !== undefined && params[name] !== null ? String(params[name]) : match,
    );
  }

  function buildT(activeNamespaces) {
    const ns = Array.isArray(activeNamespaces) ? activeNamespaces : [activeNamespaces ?? "auth"];
    return function t(key, options) {
      let resolved;
      const params = options && typeof options === "object" ? options : undefined;

      if (typeof key === "string" && key.includes(":")) {
        const [prefix, rest] = key.split(":", 2);
        resolved = resolvePath(SHARDS[prefix], rest);
      } else {
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

  const fakeI18n = {
    language: "en",
    changeLanguage: vi.fn().mockResolvedValue(undefined),
  };

  return {
    useTranslation: (namespaces) => ({
      t: buildT(namespaces),
      i18n: fakeI18n,
      ready: true,
    }),
    initReactI18next: { type: "3rdParty", init: () => {} },
    Trans: ({ children, i18nKey }) => children ?? i18nKey ?? null,
    I18nextProvider: ({ children }) => children,
  };
});
