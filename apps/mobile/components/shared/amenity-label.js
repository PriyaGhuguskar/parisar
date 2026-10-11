// Stable amenity names ↔ localized labels.
//
// The setup wizard stores the default amenities under a fixed English name
// (secretary_add_setup_amenities is idempotent on lower(name), so the stored
// value must not depend on the Secretary's UI language). Screens translate
// these well-known names at display time; custom names are shown as typed.
//
// JavaScript only — no TypeScript per CLAUDE.md.

export const DEFAULT_AMENITIES = [
  { key: "swimmingPool", name: "Swimming Pool", labelKey: "auth:amenity.swimmingPool" },
  { key: "temple", name: "Temple", labelKey: "auth:amenity.temple" },
  { key: "kidsArea", name: "Kids Area", labelKey: "auth:amenity.kidsArea" },
  { key: "clubhouse", name: "Clubhouse", labelKey: "auth:amenity.clubhouse" },
];

const LABEL_BY_NAME = new Map(DEFAULT_AMENITIES.map((a) => [a.name.toLowerCase(), a.labelKey]));

/**
 * @param {string | null | undefined} name  amenities.name as stored
 * @param {(key: string) => string} t  a t() whose namespaces include "auth"
 * @returns {string}
 */
export function amenityDisplayName(name, t) {
  if (!name) return "";
  const key = LABEL_BY_NAME.get(String(name).trim().toLowerCase());
  return key ? t(key) : name;
}
