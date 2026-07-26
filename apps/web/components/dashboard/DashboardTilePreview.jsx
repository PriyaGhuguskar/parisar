// apps/web/components/dashboard/DashboardTilePreview.jsx
// Phase 7 Plan 07-08 — Web preview block inside DashboardTile (D-04).
// Web port of apps/mobile/components/dashboard/DashboardTilePreview.jsx
// (Plan 07-07). Same 4 states, same i18n keys, same UI-SPEC contracts —
// DOM idioms instead of RN: line-clamp-1 utility instead of numberOfLines,
// aria-hidden instead of accessibilityElementsHidden, <div>/<span>/<p>
// instead of <View>/<Text>.
//
// Renders one of four states inside the bottom of a live dashboard tile:
//   - status="loading" → 2 stacked skeleton bars (data-testid preview-skeleton-1/-2)
//   - status="ready"   → up to 2 preview rows from `tile.previews`,
//     interpolated through the per-tile i18n template, OR the per-tile
//     empty-state string when previews is empty
//   - status="error" / status="idle" → renders null (silently omitted per
//     UI-SPEC: "fetch failure silently drops preview block")
//
// UI-SPEC §Screen 1 contracts enforced here:
//   - Preview rows use `line-clamp-1` so Devanagari conjunct stacks
//     (e.g. "नई शिकायत: रिसता नल") truncate cleanly inside the aspect-square
//     tile rather than wrapping and breaking the grid.
//   - Wrapper sets `aria-hidden="true"` so the screen-reader announces the
//     tile-level aria-label + count only — the per-row preview text is read
//     on the list screen (T-07-31 PII a11y mitigation: same complaint title
//     is not announced twice).
//   - The brand accent #12715A is reserved for tile icons, badge backgrounds,
//     language-selector check icons, and profile-row chevrons — preview text
//     uses neutral-900; empty-state uses neutral-400.
//   - Max 2 preview rows enforced via .slice(0, 2). The RPC already caps at 2;
//     this is a defensive guard (T-07-27).
//
// i18n contracts (Plan 07-02 dashboard.json):
//   - Per-tile preview template (e.g. `previews.newComplaint` → "New complaint:
//     {{title}} · {{flat}}") interpolates row fields. Unused placeholders
//     pass empty string so missing fields render as " · ".
//   - Empty-state strings live under `previews.empty.<tileKey>` (e.g.
//     `previews.empty.myComplaints` → "All clear").
//
// JavaScript only — no TypeScript per CLAUDE.md.

"use client";

import { useTranslation } from "react-i18next";

// Design-system tokens. Previously two off-system hex greys (#6e6e6e /
// #171717); now the Society Green neutrals, so the preview text tracks the rest
// of the product. The accent-reserved rule still holds — neither of these is
// the brand colour, which stays reserved for icons and badges.
const NEUTRAL_400 = "var(--color-neutral-400)";
const NEUTRAL_900 = "var(--color-neutral-900)";

// Per-tile preview row template. The keys map 1:1 to dashboard.json
// `previews.<tileKey>` and to the tile-bucket keys exported from
// dashboard-summary-store.js.
const PREVIEW_TEMPLATE_KEY = {
  complaints: "previews.newComplaint", // {{title}} {{flat}}
  myComplaints: "previews.myComplaintStatus", // {{title}} {{status}}
  bookings: "previews.pendingBooking", // {{amenity}} {{slot}} {{flat}}
  myBookings: "previews.myBookingStatus", // {{amenity}} {{slot}} {{status}}
  notifications: "previews.newNotification", // {{title}}
  flatActions: "previews.newFlatAction", // {{kind}} {{flat}}
  community: "previews.newCommunityPost", // {{author}} {{flat}} {{title}}
};

// Per-tile empty-state string. Mirrors `previews.empty.<key>` in dashboard.json.
// myComplaints uses its own "All clear" key; complaints (board view) uses
// "No new complaints"; bookings + myBookings share "No pending bookings".
const EMPTY_KEY = {
  complaints: "previews.empty.allComplaints",
  myComplaints: "previews.empty.myComplaints",
  bookings: "previews.empty.bookings",
  myBookings: "previews.empty.bookings",
  notifications: "previews.empty.notifications",
  flatActions: "previews.empty.flatActions",
  community: "previews.empty.community",
};

/**
 * @typedef {object} DashboardTilePreviewProps
 * @property {"idle"|"loading"|"ready"|"error"} status
 *   The live-dashboard fetch status (driven by dashboard-summary-store).
 * @property {string} tileKey
 *   One of DASHBOARD_TILE_KEYS — picks the i18n template + empty-state key.
 * @property {{count: number, previews: Array<object>}} [tile]
 *   The tile bucket from the summary. Optional in loading/idle/error states.
 *
 * @param {DashboardTilePreviewProps} props
 */
export function DashboardTilePreview({ status, tileKey, tile }) {
  const { t } = useTranslation("dashboard");

  // Silent omission for non-ready terminal states (UI-SPEC: error/idle hide
  // the preview block — the tile still renders its label + count).
  if (status === "idle" || status === "error") return null;

  // Loading skeleton — two bars stacked. Widths differ slightly to mimic the
  // visual weight of an interpolated preview row.
  if (status === "loading") {
    return (
      <div aria-hidden="true" className="mt-2">
        <div
          data-testid="preview-skeleton-1"
          className="mb-1.5 animate-pulse rounded bg-[var(--color-neutral-100)]"
          style={{ height: 12, width: "60%" }}
        />
        <div
          data-testid="preview-skeleton-2"
          className="animate-pulse rounded bg-[var(--color-neutral-100)]"
          style={{ height: 12, width: "40%" }}
        />
      </div>
    );
  }

  // status === "ready"
  const buckets = tile ?? { count: 0, previews: [] };
  const previews = Array.isArray(buckets.previews) ? buckets.previews : [];

  // Empty state — show the per-tile "All clear" / "No new complaints" text.
  if (previews.length === 0) {
    const emptyKey = EMPTY_KEY[tileKey];
    if (!emptyKey) return null;
    return (
      <div aria-hidden="true" className="mt-2">
        <p className="line-clamp-1 text-[13px] leading-[17px]" style={{ color: NEUTRAL_400 }}>
          {t(emptyKey)}
        </p>
      </div>
    );
  }

  // 1-2 preview rows. The RPC caps at 2; .slice(0, 2) is defensive (T-07-27).
  const templateKey = PREVIEW_TEMPLATE_KEY[tileKey];
  if (!templateKey) return null;
  const rows = previews.slice(0, 2);

  return (
    <div aria-hidden="true" className="mt-2">
      {rows.map((row, i) => (
        <p
          // Prefer row.id for stable React keys; fall back to index for the
          // unlikely "no id" case (malformed CDC payload).
          key={row?.id ?? `preview-${i}`}
          className="line-clamp-1 text-[13px] leading-[17px]"
          style={{
            color: NEUTRAL_900,
            marginBottom: i === rows.length - 1 ? 0 : 2,
          }}
        >
          {t(templateKey, {
            title: row?.title ?? "",
            flat: row?.flat ?? "",
            amenity: row?.amenity ?? "",
            slot: row?.slot ?? "",
            status: row?.status ?? "",
            kind: row?.kind ?? "",
            author: row?.author ?? "",
          })}
        </p>
      ))}
    </div>
  );
}
