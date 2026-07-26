// apps/mobile/app/(protected)/(tabs)/index.jsx
// Home tab — MyGate-style card grid. Replaces Phase 3 dashboard.jsx (D-01).
//
// Layout (UI-SPEC §Screen 1):
//   - Header (white, bottom-border neutral-100): SocietyHeaderPill on left,
//     profile avatar Pressable on right. paddingTop = insets.top + 8.
//   - ScrollView (bg neutral-50, padding 16): flex-row flex-wrap gap-3 holding
//     DashboardTile entries from getRoleTiles(role).
//   - paddingBottom = 32 + insets.bottom so last tile clears the bottom-nav.
//
// Loading (Pitfall 7): while useAuthStore.loading is true (or no session yet),
// return null — do NOT render tiles for the default member role; that would
// flash the Member set to a Secretary during JWT hydration.
//
// Data:
//   - Reviews badge: fetchPendingReviews on useFocusEffect (D-04 — refresh on
//     focus, NOT realtime).
//   - Code-rotation badge (D-05, Wave 4): the Home screen fetches the active
//     society code's `rotates_at` timestamp and passes a "{N}d" badgeText to the
//     Code Rotation tile when rotation is < 7 days away (computeDaysUntilRotation
//     + daysUntilRotationToBadge). society_codes has NO rotates_at column today
//     (Wave 0 audit §4) and rotation is manual, so the query yields null and the
//     badge is HIDDEN (graceful degradation). The wiring is forward-compatible:
//     once a rotation timestamp exists, the badge lights up with no code change.
//
// JWT shape (04.1-00-JWT-SHAPE.md): app_metadata carries ONLY society_id + role.
// society_name and full_name are NOT in the JWT — we fall back to "Your Society"
// and "Member" here. Wave 3 fetches the real values from societies/profiles.
//
// JavaScript only — no TypeScript per CLAUDE.md.

import { fetchPendingReviews } from "@parisar/api-client";
import { useFocusEffect, useRouter } from "expo-router";
import { ChevronDown } from "lucide-react-native";
import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Pressable, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { DashboardTile } from "../../../components/dashboard/DashboardTile";
import { DashboardTilePreview } from "../../../components/dashboard/DashboardTilePreview";
import { ProfileMenuSheet } from "../../../components/dashboard/ProfileMenuSheet";
import { SocietyHeaderPill } from "../../../components/dashboard/SocietyHeaderPill";
import { SocietySwitcherSheet } from "../../../components/dashboard/SocietySwitcherSheet";
import { useAuthStore } from "../../../lib/auth-store";
import { getAvatarColor, initials } from "../../../lib/avatar";
import { subscribeDashboardRealtime } from "../../../lib/dashboard-realtime";
import { useDashboardSummary } from "../../../lib/dashboard-summary-store";
import {
  computeDaysUntilRotation,
  daysUntilRotationToBadge,
  getRoleTiles,
} from "../../../lib/role-tiles";
import { getSupabase } from "../../../lib/supabase";

const BRAND_500 = "#12715A";

// Board roles see the pending-bookings count on the Bookings tile (DT-02, Phase 5).
const BOARD_ROLES = new Set(["board_member", "co_secretary", "secretary"]);

// Phase tag i18n keys keyed by ship-phase number (UI-SPEC §Placeholder Copy).
const PLACEHOLDER_PHASE_KEY = {
  5: "placeholder.phase5",
  6: "placeholder.phase6",
  9: "placeholder.phase9",
  10: "placeholder.phase10",
};

// Phase 7 Plan 07-07 — map a tile.key to the summary-bucket key whose
// `{count, previews}` should drive the DashboardTilePreview slot.
//
// Tiles without a 1:1 summary bucket (directory, societyCode, codeRotation,
// reviews, polls, visitors, staff) return null — no preview slot on those.
// Polls intentionally has no preview bucket today; counts are reflected on
// the Notices tile via the shared notifications bucket (DASH-03 scope).
function getSummaryKeyForTile(tileKey, role) {
  if (tileKey === "allComplaints") return "complaints";
  if (tileKey === "myComplaints") return "myComplaints";
  if (tileKey === "bookings") {
    return BOARD_ROLES.has(role) ? "bookings" : "myBookings";
  }
  if (tileKey === "notices") return "notifications";
  if (tileKey === "flatActions") return "flatActions";
  if (tileKey === "community") return "community";
  return null;
}

export default function HomeScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { t } = useTranslation("dashboard");
  const session = useAuthStore((s) => s.session);
  const loading = useAuthStore((s) => s.loading);
  const [pendingCount, setPendingCount] = useState(0);
  const [pendingBookings, setPendingBookings] = useState(0);
  const [rotatesAt, setRotatesAt] = useState(null);
  const [switcherOpen, setSwitcherOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [memberships, setMemberships] = useState([]);

  // Phase 7 Plan 07-07 — live dashboard summary (DASH-03).
  // Selector-style subscriptions keep re-renders shallow.
  const summary = useDashboardSummary((s) => s.summary);
  const summaryStatus = useDashboardSummary((s) => s.status);
  const fetchSummary = useDashboardSummary((s) => s.fetchSummary);
  const patchEvent = useDashboardSummary((s) => s.patchEvent);

  const meta = session?.user?.app_metadata ?? {};
  const societyId = meta.society_id;
  const societyName = meta.society_name ?? "Your Society";
  const role = meta.role ?? "member";
  const nameForAvatar = meta.full_name ?? meta.name ?? "Member";

  // Refresh pending-reviews badge + code-rotation date on every focus
  // (Pitfall 5, D-04 / D-05).
  useFocusEffect(
    useCallback(() => {
      if (!societyId) return;
      let cancelled = false;
      const supabase = getSupabase();

      fetchPendingReviews(supabase, societyId)
        .then((rows) => {
          if (!cancelled) setPendingCount(Array.isArray(rows) ? rows.length : 0);
        })
        .catch(() => {
          if (!cancelled) setPendingCount(0);
        });

      // D-05 — fetch the active society code's rotation timestamp. society_codes
      // has no rotates_at column today (Wave 0 audit §4): the query errors, we
      // keep rotatesAt = null, and the Code Rotation badge stays hidden. When a
      // future phase adds the column, this lights the "{N}d" pill up unchanged.
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

      // Phase 5 (DT-02) — board roles get a "pending_bookings" count on the Bookings
      // tile. RLS scopes the bookings table to the society's board queue; members
      // never reach this branch (their tile carries no badge). Refresh on focus
      // (matches the reviews badge cadence, not realtime).
      if (BOARD_ROLES.has(role)) {
        supabase
          .from("bookings")
          .select("id")
          .eq("society_id", societyId)
          .eq("status", "pending")
          .then(({ data, error }) => {
            if (!cancelled && !error) {
              setPendingBookings(Array.isArray(data) ? data.length : 0);
            }
          })
          .catch(() => {
            // Non-fatal — leave the badge at 0 (hidden) on error.
          });
      }

      // Phase 7 Plan 07-07 (D-03) — live dashboard summary fetch on focus.
      // Errors are intentionally silent: the DashboardTilePreview renders nothing
      // on status="error" per UI-SPEC, the tile-level label + (badge from the
      // legacy badges above) still display. The next focus tries again.
      fetchSummary(supabase).catch(() => {
        /* silent — UI-SPEC: fetch failure drops preview block */
      });

      return () => {
        cancelled = true;
      };
    }, [societyId, role, fetchSummary]),
  );

  // Phase 7 Plan 07-07 (D-02 + D-03) — Realtime subscription. Mounted once
  // per society; tears down on society switch or unmount. Reconnect (the
  // second-and-later SUBSCRIBED) triggers a fresh fetchSummary so any gap
  // during the offline window is reconciled.
  useEffect(() => {
    if (!societyId) return undefined;
    const supabase = getSupabase();
    const userId = session?.user?.id ?? null;
    const unsubscribe = subscribeDashboardRealtime(
      supabase,
      societyId,
      (event) => patchEvent(event, userId),
      () => {
        fetchSummary(supabase).catch(() => {
          /* silent */
        });
      },
    );
    return unsubscribe;
  }, [societyId, session?.user?.id, fetchSummary, patchEvent]);

  // Fetch the user's active memberships (RLS-scoped) so the society switcher can
  // list them. Single-society users (length === 1) never see the switcher.
  useFocusEffect(
    useCallback(() => {
      const userId = session?.user?.id;
      if (!userId) return;
      let cancelled = false;
      getSupabase()
        .from("society_memberships")
        .select("society_id, societies:society_id(name)")
        .eq("user_id", userId)
        .eq("status", "active")
        .then(({ data }) => {
          if (cancelled) return;
          setMemberships(
            (data ?? []).map((r) => ({
              society_id: r.society_id,
              society_name: r.societies?.name ?? "Society",
            })),
          );
        });
      return () => {
        cancelled = true;
      };
    }, [session?.user?.id]),
  );

  const showSwitcher = memberships.length > 1;

  // Pitfall 7 — wait for auth hydration before rendering any role-aware UI.
  if (loading || !session) return null;

  const tiles = getRoleTiles(role);
  const avatarColor = getAvatarColor(nameForAvatar);

  return (
    <View className="flex-1 bg-neutral-50">
      {/* Header */}
      <View
        className="flex-row items-center justify-between px-4 pb-3 bg-white border-b border-neutral-100"
        style={{ paddingTop: insets.top + 8 }}
      >
        <View className="flex-1 mr-2">
          {/* Society pill — when the user belongs to >1 society, the pill is a
              Pressable that opens the switcher and shows a chevron. With exactly
              one society it is static text (D-05 / DT-05 — no chevron, no tap). */}
          {showSwitcher ? (
            <Pressable
              onPress={() => setSwitcherOpen(true)}
              className="flex-row items-center"
              accessibilityRole="button"
              accessibilityLabel={t("switcher.title")}
            >
              <View className="flex-1">
                <SocietyHeaderPill societyId={societyId} societyName={societyName} />
              </View>
              <ChevronDown size={16} color={BRAND_500} />
            </Pressable>
          ) : (
            <SocietyHeaderPill societyId={societyId} societyName={societyName} />
          )}
        </View>

        {/* Profile avatar — opens the ProfileMenuSheet inline (Wave 3). */}
        <Pressable
          onPress={() => setProfileOpen(true)}
          className="w-9 h-9 rounded-full items-center justify-center"
          style={{ backgroundColor: avatarColor.bg }}
          accessibilityRole="button"
          accessibilityLabel={t("header.openProfile")}
          testID="profile-avatar-button"
        >
          <Text style={{ color: avatarColor.text }} className="font-semibold">
            {initials(nameForAvatar)}
          </Text>
        </Pressable>
      </View>

      {/* Card grid */}
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 32 + insets.bottom }}>
        <View className="flex-row flex-wrap gap-3">
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

            // Phase 7 Plan 07-07 D-04 — preview slot. Live tiles that map to a
            // summary bucket get a DashboardTilePreview; placeholder tiles
            // (Visitors / Staff) pass null so the existing "Ships in Phase N"
            // subtitle keeps that slot. Tiles without a bucket (Directory,
            // Society Code, Code Rotation, Reviews, Polls) also pass null.
            const summaryKey = tile.live ? getSummaryKeyForTile(tile.key, role) : null;
            let previewNode = null;
            if (summaryKey) {
              if (summaryStatus === "loading" && !summary) {
                previewNode = <DashboardTilePreview status="loading" tileKey={summaryKey} />;
              } else if (summary) {
                previewNode = (
                  <DashboardTilePreview
                    status={summaryStatus}
                    tileKey={summaryKey}
                    tile={summary[summaryKey]}
                  />
                );
              }
              // idle / error / no-summary: previewNode stays null (silent omission).
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
        </View>
      </ScrollView>

      <SocietySwitcherSheet
        visible={switcherOpen}
        memberships={memberships}
        activeSocietyId={societyId}
        onSelect={(newSocietyId) => {
          // Visual-only stub per user decision #1. v1 logs intent and returns;
          // Phase 8 wires real multi-society switching (JWT refresh + tile-count
          // re-fetch). This intentionally does NOT invalidate any caches because
          // v1 never actually switches (threat T-04.1-01 — real switch must issue
          // a Supabase Auth Hook refresh so the JWT carries the new society_id).
          console.log(
            "[society-switcher] Switch intent logged:",
            newSocietyId,
            "(Phase 8 will wire)",
          );
        }}
        onClose={() => setSwitcherOpen(false)}
      />
      <ProfileMenuSheet visible={profileOpen} onClose={() => setProfileOpen(false)} />
    </View>
  );
}
