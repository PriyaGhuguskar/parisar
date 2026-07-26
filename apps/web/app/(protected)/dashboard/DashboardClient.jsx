// apps/web/app/(protected)/dashboard/DashboardClient.jsx
// Client card grid + heading row (Phase 04.1 Wave 2, Plan 03, Task 2).
//
// REPLACES the Phase 3 layout (the joined-percent gauge, the society-code card,
// the recent-joiners list, and the pending-reviews summary banner) with the
// MyGate-style card grid (UI-SPEC §Screen 2 Web Home). D-01: those widgets are
// removed from the home; their underlying screens/routes are unchanged and
// reached via tiles instead.
//
// The avatar in the heading row is a placeholder trigger that navigates to
// /profile; Wave 3 (Plan 04) replaces it with the real ProfileMenuDropdown.
//
// Avatar helpers now come from @/lib/avatar (Wave 0 extraction) — the inline
// color palette that used to live in this file is gone.
//
// JavaScript only — no TypeScript per CLAUDE.md.

"use client";

import { fetchPendingReviews } from "@parisar/api-client";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { DashboardTile } from "@/components/dashboard/DashboardTile";
import { DashboardTilePreview } from "@/components/dashboard/DashboardTilePreview";
import { ProfileMenuDropdown } from "@/components/dashboard/ProfileMenuDropdown";
import { SocietyHeaderPill } from "@/components/dashboard/SocietyHeaderPill";
import { subscribeDashboardRealtime } from "@/lib/dashboard-realtime";
import { useDashboardSummary } from "@/lib/dashboard-summary-store";
import { computeDaysUntilRotation, daysUntilRotationToBadge, getRoleTiles } from "@/lib/role-tiles";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

// Map a tile's ship-phase to its localized "Ships in Phase N" key.
const PLACEHOLDER_PHASE_KEY = {
  5: "placeholder.phase5",
  6: "placeholder.phase6",
  9: "placeholder.phase9",
  10: "placeholder.phase10",
};

/**
 * @param {object} props
 * @param {string} props.userId
 * @param {string} props.role
 * @param {string|null} props.societyId
 * @param {string} props.societyName
 * @param {string} props.fullName
 *
 * Note: memberships is not consumed here — the heading-row ProfileMenuDropdown
 * (DT-08) does not need it, and the society switcher lives in the sidebar. The
 * page may still pass it; extra props are ignored.
 */
const BOARD_ROLES = new Set(["board_member", "co_secretary", "secretary"]);

// Phase 7 Plan 07-08 — Map a tile.key (from role-tiles.js) to its summary bucket
// key (from dashboard-summary-store.js DASHBOARD_TILE_KEYS).
//
// Tiles WITHOUT a summary bucket (directory, societyCode, codeRotation, reviews,
// polls, visitors, staff, notices) deliberately return null so the
// previewNode slot collapses — they keep showing their badges + label.
//
// Role-aware bookings/complaints mapping mirrors the mobile Plan 07-07
// getSummaryKeyForTile() pattern: members get their own bucket
// (myBookings/myComplaints), board roles get the action-queue bucket
// (bookings/complaints).
function getSummaryKeyForTile(tileKey, role) {
  const isBoard = BOARD_ROLES.has(role);
  switch (tileKey) {
    case "allComplaints":
      // Board view tile key on the web is "allComplaints" (see role-tiles.js).
      return "complaints";
    case "myComplaints":
      return "myComplaints";
    case "bookings":
      return isBoard ? "bookings" : "myBookings";
    case "notices":
      return "notifications";
    case "flatActions":
      return "flatActions";
    case "community":
      return "community";
    default:
      return null;
  }
}

export function DashboardClient({
  userId,
  role,
  societyId,
  societyName,
  fullName,
  initialSummary = null,
}) {
  const router = useRouter();
  const { t } = useTranslation("dashboard");
  const [pendingCount, setPendingCount] = useState(0);
  const [pendingBookings, setPendingBookings] = useState(0);
  const [rotatesAt, setRotatesAt] = useState(null);

  // Phase 7 Plan 07-08 — Live dashboard summary store selectors.
  // Shallow selectors so re-renders fire only when the picked slice changes.
  const summary = useDashboardSummary((s) => s.summary);
  const summaryStatus = useDashboardSummary((s) => s.status);
  const setSummary = useDashboardSummary((s) => s.setSummary);
  const fetchSummary = useDashboardSummary((s) => s.fetchSummary);
  const patchEvent = useDashboardSummary((s) => s.patchEvent);

  // Seed the store from the SSR-fetched initialSummary on first render.
  // Guard with `!summary` so a navigation back to /dashboard (which re-mounts
  // this component) does not clobber patches applied since the last paint.
  useEffect(() => {
    if (initialSummary && !summary) {
      setSummary(initialSummary);
    }
  }, [initialSummary, summary, setSummary]);

  // Phase 7 Plan 07-08 — Realtime subscription + window-focus reconciliation
  // (D-02 + D-03). The window "focus" event is the web analogue of mobile's
  // useFocusEffect. T-07-32: cleanup MUST remove both the channel and the
  // focus listener on unmount to prevent leaks across route changes.
  useEffect(() => {
    if (!societyId) return undefined;
    const supabase = createSupabaseBrowserClient();
    const unsubscribe = subscribeDashboardRealtime(
      supabase,
      societyId,
      (event) => patchEvent(event, userId),
      () => {
        // Reconnect → reconcile against the server (D-03).
        fetchSummary(supabase).catch(() => {
          // Last-known-good preserved by the store on error (UI-SPEC).
        });
      },
    );

    const onFocus = () => {
      fetchSummary(supabase).catch(() => {});
    };
    window.addEventListener("focus", onFocus);

    return () => {
      window.removeEventListener("focus", onFocus);
      unsubscribe();
    };
  }, [societyId, userId, fetchSummary, patchEvent]);

  // Hydrate the volatile Reviews badge count + code-rotation date client-side
  // (D-04 / D-05 / Pitfall 5). force-dynamic on the page re-runs SSR on
  // navigation; this effect refreshes on the client whenever societyId resolves.
  useEffect(() => {
    if (!societyId) return;
    let cancelled = false;
    const supabase = createSupabaseBrowserClient();

    fetchPendingReviews(supabase, societyId)
      .then((rows) => {
        if (!cancelled) setPendingCount(Array.isArray(rows) ? rows.length : 0);
      })
      .catch(() => {
        if (!cancelled) setPendingCount(0);
      });

    // DT-02 — board pending-bookings badge (the Bookings tile action-queue glance
    // count). Society-scoped; RLS authoritative. Members never query this. In the
    // current test env this resolves to 0 (badge hidden) — graceful degradation
    // matching the reviews-badge cadence.
    if (BOARD_ROLES.has(role)) {
      supabase
        .from("bookings")
        .select("id")
        .eq("society_id", societyId)
        .eq("status", "pending")
        .then(({ data, error }) => {
          if (!cancelled && !error) setPendingBookings(Array.isArray(data) ? data.length : 0);
        })
        .catch(() => {
          // network/permission error -> leave 0 (badge hidden)
        });
    }

    // D-05 — fetch the active society code's rotation timestamp. society_codes
    // has no rotates_at column today (Wave 0 audit §4) and rotation is manual:
    // the query errors, rotatesAt stays null, and the Code Rotation badge is
    // hidden (graceful degradation). Forward-compatible — a future rotation
    // timestamp lights the "{N}d" pill up with no code change.
    supabase
      .from("society_codes")
      .select("rotates_at")
      .eq("society_id", societyId)
      .is("revoked_at", null)
      .maybeSingle()
      .then(({ data, error }) => {
        if (!cancelled && !error) setRotatesAt(data?.rotates_at ?? null);
      })
      .catch(() => {
        // Column-missing / network error -> leave rotatesAt null (badge hidden).
      });

    return () => {
      cancelled = true;
    };
  }, [societyId, role]);

  const tiles = getRoleTiles(role);

  return (
    <main className="bg-neutral-50 min-h-screen px-8 py-6">
      {/* Heading row — society pill (left) + profile avatar trigger (right). */}
      <header className="flex items-center justify-between mb-6">
        <SocietyHeaderPill societyId={societyId} societyName={societyName} />

        {/* DT-08 second profile trigger — the heading-row avatar opens the same
            ProfileMenuDropdown that the sidebar footer avatar does. */}
        <ProfileMenuDropdown
          userId={userId}
          societyId={societyId}
          role={role}
          fullName={fullName}
        />
      </header>

      {/* Tile grid (UI-SPEC §Screen 2 — responsive columns). */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
        {tiles.map((tile) => {
          const tileLabel = t(`tiles.${tile.key}`, { defaultValue: tile.key });
          const announceUnavailable = tile.live
            ? null
            : t("placeholder.announce", { phase: String(tile.phase) });
          const placeholderPhase = tile.live
            ? null
            : PLACEHOLDER_PHASE_KEY[tile.phase]
              ? t(PLACEHOLDER_PHASE_KEY[tile.phase])
              : null;
          const badgeCount =
            tile.badge === "pending_reviews"
              ? pendingCount
              : tile.badge === "pending_bookings"
                ? pendingBookings
                : 0;
          // D-05 — "{N}d" pill on the Code Rotation tile when rotation < 7 days
          // away. rotatesAt is null today (no rotates_at column) -> no badge.
          const days =
            tile.badge === "days_until_rotation" ? computeDaysUntilRotation(rotatesAt) : null;
          const badgeText = daysUntilRotationToBadge(days);

          // Phase 7 Plan 07-08 — Compute the live preview slot for this tile.
          // Placeholder tiles get null (the slot belongs to "Ships in Phase N");
          // live tiles without a summary bucket also get null (the slot
          // collapses). Live tiles WITH a bucket get a <DashboardTilePreview>
          // that owns its own loading/empty/ready/error state machine.
          let previewNode = null;
          if (tile.live) {
            const summaryKey = getSummaryKeyForTile(tile.key, role);
            if (summaryKey) {
              previewNode = (
                <DashboardTilePreview
                  status={summaryStatus}
                  tileKey={summaryKey}
                  tile={summary?.[summaryKey]}
                />
              );
            }
          }

          return (
            <DashboardTile
              key={tile.key}
              icon={tile.icon}
              label={tileLabel}
              badgeCount={badgeCount}
              badgeText={badgeText}
              placeholder={!tile.live}
              placeholderPill={t("placeholder.comingSoon")}
              placeholderPhase={placeholderPhase}
              announceUnavailable={announceUnavailable}
              onPress={tile.live ? () => router.push(tile.route) : undefined}
              previewNode={previewNode}
            />
          );
        })}
      </div>
    </main>
  );
}
