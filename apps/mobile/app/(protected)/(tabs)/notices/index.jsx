// /(protected)/(tabs)/notices — Society notice list (all roles read; board posts).
//
// Per 05-UI-SPEC.md Screen 1:
//   - Header: title + (board roles) "New Notice" FAB (56×56 brand.500, bottom-right).
//   - Scrollable NoticeCard list, gap-3, newest first (listNotices).
//   - Realtime: subscribeToNotices in useFocusEffect with a societyId guard
//     (Phase 4 pattern). New row prepended with Reanimated FadeInDown 250ms.
//   - 5-skeleton loading; Bell empty state (member vs board copy); WifiOff error + retry.
//   - Tapping a card → /(protected)/(tabs)/notices/${id}.
//   - Route lives INSIDE (tabs) declared href:null (registered in _layout — 04.1 Option A).
//
// JavaScript only — no TypeScript per CLAUDE.md.

import { listNotices, subscribeToNotices } from "@parisar/api-client";
import { useFocusEffect, useRouter } from "expo-router";
import { Bell, Plus, WifiOff } from "lucide-react-native";
import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { ActivityIndicator, FlatList, Pressable, Text, View } from "react-native";
import Animated, { FadeInDown } from "react-native-reanimated";
import { NoticeCard } from "../../../../components/notices/NoticeCard";
import { useAuthStore } from "../../../../lib/auth-store";
import { getSupabase } from "../../../../lib/supabase";

const BOARD_ROLES = new Set(["board_member", "co_secretary", "secretary"]);

export default function NoticesScreen() {
  const router = useRouter();
  const { t } = useTranslation("notifications");
  const session = useAuthStore((s) => s.session);

  const jwtMeta = session?.user?.app_metadata ?? session?.user?.user_metadata ?? {};
  const societyId = jwtMeta.society_id ?? null;
  const role = jwtMeta.role ?? "member";
  const isBoard = BOARD_ROLES.has(role);

  const [notices, setNotices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const cleanupRef = useRef(null);

  const load = useCallback(async () => {
    if (!societyId) return;
    setError(null);
    try {
      const supabase = getSupabase();
      const rows = await listNotices(supabase);
      setNotices(rows);
    } catch (err) {
      console.warn("[notices/index] load failed:", err?.message ?? err);
      setError(err?.message ?? "load_failed");
    } finally {
      setLoading(false);
    }
  }, [societyId]);

  useEffect(() => {
    load();
  }, [load]);

  // Realtime — subscribe on focus, clean up on blur. societyId guard before subscribe
  // (Phase 4 Pattern 2 / Threat T-05-01: RLS keeps cross-society rows out).
  useFocusEffect(
    useCallback(() => {
      if (!societyId) return undefined;
      const supabase = getSupabase();
      cleanupRef.current = subscribeToNotices(supabase, societyId, {
        onInsert: (row) => {
          setNotices((prev) => {
            if (prev.some((n) => n.id === row.id)) return prev;
            // INSERT payloads don't include the author/flat/poll embeds; prepend the
            // raw row (the card degrades to "—" for name/flat) and let the next focus
            // refetch hydrate the joins.
            return [row, ...prev];
          });
        },
        onConnected: () => {
          // Reconnect → refetch to fill any gap.
          load();
        },
      });
      return () => {
        cleanupRef.current?.();
        cleanupRef.current = null;
      };
    }, [societyId, load]),
  );

  function handleOpen(notice) {
    router.push(`/(protected)/(tabs)/notices/${notice.id}`);
  }

  function handleCompose() {
    router.push("/(protected)/(tabs)/notices/new");
  }

  return (
    <View className="flex-1 bg-neutral-50">
      {/* Header */}
      <View className="px-4 pt-12 pb-3 bg-white border-b border-neutral-100 flex-row items-center gap-3">
        <Pressable
          onPress={() => router.back()}
          className="p-2"
          accessibilityRole="button"
          accessibilityLabel="Go back"
        >
          <Text className="text-base text-brand-500">{"←"}</Text>
        </Pressable>
        <Text className="text-xl font-semibold text-neutral-900 flex-1">
          {t("notice.listTitle")}
        </Text>
      </View>

      {/* Body */}
      {loading ? (
        <NoticeListSkeleton />
      ) : error ? (
        <ErrorState t={t} onRetry={load} />
      ) : notices.length === 0 ? (
        <EmptyState t={t} isBoard={isBoard} onCompose={handleCompose} />
      ) : (
        <FlatList
          data={notices}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: 80 }}
          renderItem={({ item, index }) => (
            <Animated.View entering={FadeInDown.duration(250)}>
              <NoticeCard notice={item} onPress={handleOpen} unread={true} />
            </Animated.View>
          )}
          showsVerticalScrollIndicator={false}
        />
      )}

      {/* FAB — board roles only (NOTF-01 board-gated) */}
      {isBoard ? (
        <Pressable
          onPress={handleCompose}
          accessibilityRole="button"
          accessibilityLabel={t("notice.composeCta")}
          style={{
            position: "absolute",
            bottom: 24,
            right: 24,
            width: 56,
            height: 56,
            borderRadius: 28,
            backgroundColor: "#12715A",
            alignItems: "center",
            justifyContent: "center",
            shadowColor: "#000",
            shadowOffset: { width: 0, height: 4 },
            shadowOpacity: 0.2,
            shadowRadius: 6,
            elevation: 6,
          }}
        >
          <Plus size={24} color="#ffffff" />
        </Pressable>
      ) : null}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Local sub-components
// ---------------------------------------------------------------------------

function NoticeListSkeleton() {
  return (
    <View style={{ padding: 16, gap: 12 }}>
      {[0, 1, 2, 3, 4].map((i) => (
        <View key={i} className="bg-white rounded-xl border border-neutral-200 p-4 gap-2">
          <View style={{ height: 20, width: "70%", backgroundColor: "#f5f5f5", borderRadius: 6 }} />
          <View
            style={{ height: 14, width: "100%", backgroundColor: "#f5f5f5", borderRadius: 6 }}
          />
          <View style={{ height: 14, width: "85%", backgroundColor: "#f5f5f5", borderRadius: 6 }} />
          <View
            style={{ height: 18, width: "45%", backgroundColor: "#f5f5f5", borderRadius: 999 }}
          />
        </View>
      ))}
    </View>
  );
}

function EmptyState({ t, isBoard, onCompose }) {
  const body = isBoard ? t("notice.emptyBodyBoard") : t("notice.emptyBody");
  return (
    <View className="flex-1 items-center justify-center px-8 gap-4">
      <Bell size={80} color="#8a8a8a" />
      <Text
        className="font-semibold text-neutral-600 text-center"
        style={{ fontSize: 28, lineHeight: 32 }}
      >
        {t("notice.emptyHeading")}
      </Text>
      <Text className="text-base text-neutral-400 text-center">{body}</Text>
      {isBoard ? (
        <Pressable
          onPress={onCompose}
          className="h-14 px-6 rounded-xl bg-brand-500 active:bg-brand-600 items-center justify-center mt-2"
          accessibilityRole="button"
          accessibilityLabel={t("notice.composeCta")}
        >
          <Text className="text-base font-semibold text-white">{t("notice.composeCta")}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

function ErrorState({ t, onRetry }) {
  return (
    <View className="flex-1 items-center justify-center px-8 gap-3">
      <WifiOff size={48} color="#8a8a8a" />
      <Text className="text-xl font-semibold text-neutral-900 text-center">
        {t("notice.loadError")}
      </Text>
      <Text className="text-base text-neutral-600 text-center">{t("notice.loadErrorBody")}</Text>
      <Pressable
        onPress={onRetry}
        className="h-10 px-4 rounded-lg border border-neutral-200 items-center justify-center mt-2"
        accessibilityRole="button"
        accessibilityLabel="Try again"
      >
        <Text className="text-sm font-semibold text-neutral-900">Try again</Text>
      </Pressable>
    </View>
  );
}
