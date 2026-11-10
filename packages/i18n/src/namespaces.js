// Phase 7 — Plan 07-01: shared namespace inventory consumed by createI18nInstance,
// the i18n-coverage CI gate, and every app's useTranslation() call sites.
//
// NAMESPACES maps 1:1 to packages/i18n/locales/{en,hi,mr}/<ns>.json shards.
// AUTH_NAMESPACE is the synthetic name for the flat top-level <lng>.json file
// (which holds auth + setup + dashboard-legacy + removal + roleTransfer + join).

export const NAMESPACES = [
  "dashboard",
  "complaints",
  "notifications",
  "polls",
  "bookings",
  "preferences",
  "flat-actions",
  "community",
  "moderation",
  // Society onboarding (docs/onboarding/PLAN.md). One shard per domain so the
  // builders never edit the same file.
  "connect",
  "platform",
  "setup-wizard",
  "resident-onboarding",
  "staff-nav",
  // Default copy for components/kit (required marker, pagination, status labels).
  "kit",
];

export const AUTH_NAMESPACE = "auth";

export const DEFAULT_NS = "dashboard";
