// /(protected)/(tabs)/polls — Polls list (DD-1: a filtered view of notices that
// carry a poll, kind='poll'). Same NoticeCard component as the notices list; only
// the query filter differs (pollsOnly:true).
//
// Per 05-UI-SPEC.md Screen 1 + §Tile → route → badge mapping:
//   - listNotices(supabase, { pollsOnly:true }) — newest first.
//   - Reuses NoticeCard (the PollPill is always present here).
//   - Empty copy: poll.emptyHeading / poll.emptyBody.
//   - Tapping a card → the SAME notice detail route /(protected)/(tabs)/notices/${id}
//     (the detail renders the embedded PollBlock).
//   - Realtime: subscribeToNotices in useFocusEffect; new poll-carrying rows prepend.
//   - Route lives INSIDE (tabs) declared href:null (registered in _layout).
//
// JavaScript only — no TypeScript per CLAUDE.md.

import { listNotices, subscribeToNotices } from "@parisar/api-client";
import { useFocusEffect, useRouter } from "expo-router";
import { BarChart3, WifiOff } from "lucide-react-native";
import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { FlatList, Pressable, Text, View } from "react-native";
import Animated, { FadeInDown } from "react-native-reanimated";
import { NoticeCard } from "../../../../components/notices/NoticeCard";
import { useAuthStore } from "../../../../lib/auth-store";
import { getSupabase } from "../../../../lib/supabase";

export default function PollsScreen() {
  const router = useRouter();
  const { t } = useTranslation("polls");
  const session = useAuthStore((s) => s.session);

  const jwtMeta = session?.user?.app_metadata ?? session?.user?.user_metadata ?? {};
  const societyId = jwtMeta.society_id ?? null;

  const [notices, setNotices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const cleanupRef = useRef(null);

  const load = useCallback(async () => {
    if (!societyId) return;
    setError(null);
    try {
      const supabase = getSupabase();
      const rows = await listNotices(supabase, { pollsOnly: true });
      setNotices(rows);
    } catch (err) {
      console.warn("[polls/index] load failed:", err?.message ?? err);
      setError(err?.message ?? "load_failed");
    } finally {
      setLoading(false);
    }
  }, [societyId]);

  useEffect(() => {
    load();
  }, [load]);

  useFocusEffect(
    useCallback(() => {
      if (!societyId) return undefined;
      const supabase = getSupabase();
      cleanupRef.current = subscribeToNotices(supabase, societyId, {
        onInsert: (row) => {
          // Only poll notices belong on this filtered list.
          if (row?.kind !== "poll") return;
          setNotices((prev) => {
            if (prev.some((n) => n.id === row.id)) return prev;
            return [row, ...prev];
          });
        },
        onConnected: () => {
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
    // Polls reuse the notice detail screen — the PollBlock renders there.
    router.push(`/(protected)/(tabs)/notices/${notice.id}`);
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
        <Text className="text-xl font-semibold text-neutral-900 flex-1">{t("poll.listTitle")}</Text>
      </View>

      {/* Body */}
      {loading ? (
        <PollListSkeleton />
      ) : error ? (
        <ErrorState onRetry={load} />
      ) : notices.length === 0 ? (
        <EmptyState t={t} />
      ) : (
        <FlatList
          data={notices}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: 32 }}
          renderItem={({ item }) => (
            <Animated.View entering={FadeInDown.duration(250)}>
              <NoticeCard notice={item} onPress={handleOpen} unread={true} />
            </Animated.View>
          )}
          showsVerticalScrollIndicator={false}
        />
      )}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Local sub-components
// ---------------------------------------------------------------------------

function PollListSkeleton() {
  return (
    <View style={{ padding: 16, gap: 12 }}>
      {[0, 1, 2, 3, 4].map((i) => (
        <View key={i} className="bg-white rounded-xl border border-neutral-200 p-4 gap-2">
          <View style={{ height: 20, width: "70%", backgroundColor: "#f5f5f5", borderRadius: 6 }} />
          <View
            style={{ height: 14, width: "100%", backgroundColor: "#f5f5f5", borderRadius: 6 }}
          />
          <View
            style={{ height: 18, width: "45%", backgroundColor: "#f5f7ff", borderRadius: 999 }}
          />
        </View>
      ))}
    </View>
  );
}

function EmptyState({ t }) {
  return (
    <View className="flex-1 items-center justify-center px-8 gap-4">
      <BarChart3 size={80} color="#8a8a8a" />
      <Text
        className="font-semibold text-neutral-600 text-center"
        style={{ fontSize: 28, lineHeight: 32 }}
      >
        {t("poll.emptyHeading")}
      </Text>
      <Text className="text-base text-neutral-400 text-center">{t("poll.emptyBody")}</Text>
    </View>
  );
}

function ErrorState({ onRetry }) {
  return (
    <View className="flex-1 items-center justify-center px-8 gap-3">
      <WifiOff size={48} color="#8a8a8a" />
      <Text className="text-xl font-semibold text-neutral-900 text-center">
        Couldn't load polls
      </Text>
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
