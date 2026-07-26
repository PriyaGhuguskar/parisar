// /(protected)/(tabs)/community — Community feed (COMM-01/02, all roles).
//
// Per 06-UI-SPEC.md Screen 4:
//   - Header "Community" + (admin) ShieldAlert icon-button → /moderation (NOT a tile) +
//     "New Post" FAB (all roles).
//   - PostCard list, newest first. Realtime subscribe to posts INSERT/UPDATE/DELETE for the
//     society in useFocusEffect. The feed renders the RLS query result AS-IS — there is NO
//     client-side hide logic (auto-hide is server-side, D-03). A hidden post simply
//     disappears via the server event / its absence on refetch.
//   - Empty / error / loading per spec.
//
// CRITICAL (D-03): build NO client-side "hide this post" logic. The moderation queue is
// the only surface that shows hidden content. On a posts UPDATE we re-load (the server may
// have flipped hidden_at) and render whatever the RLS query returns.
//
// JavaScript only — no TypeScript per CLAUDE.md.

import { listPosts, subscribeToFeed } from "@parisar/api-client";
import { useFocusEffect, useRouter } from "expo-router";
import { Plus, ShieldAlert, Users2, WifiOff } from "lucide-react-native";
import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { ActivityIndicator, FlatList, Pressable, Text, View } from "react-native";
import { PostCard } from "../../../../components/community/PostCard";
import { useAuthStore } from "../../../../lib/auth-store";
import { getSupabase } from "../../../../lib/supabase";

const ADMIN_ROLES = new Set(["co_secretary", "secretary"]);

export default function CommunityFeedScreen() {
  const router = useRouter();
  const { t } = useTranslation("community");
  const session = useAuthStore((s) => s.session);

  const jwtMeta = session?.user?.app_metadata ?? session?.user?.user_metadata ?? {};
  const societyId = jwtMeta.society_id ?? null;
  const role = jwtMeta.role ?? "member";
  const userId = session?.user?.id ?? null;
  const isAdmin = ADMIN_ROLES.has(role);

  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const cleanupRef = useRef(null);

  const load = useCallback(async () => {
    if (!societyId) return;
    setError(null);
    try {
      const supabase = getSupabase();
      // RLS scopes to society + removes hidden/deleted rows server-side (D-03).
      const rows = await listPosts(supabase);
      setPosts(rows);
    } catch (err) {
      console.warn("[community/index] load failed:", err?.message ?? err);
      setError(err?.message ?? "load_failed");
    } finally {
      setLoading(false);
    }
  }, [societyId]);

  useEffect(() => {
    load();
  }, [load]);

  // Realtime — INSERT prepends; UPDATE/DELETE re-load (server may have hidden/removed a row).
  // No client hide logic: we trust the server-authoritative auto-hide (D-03).
  useFocusEffect(
    useCallback(() => {
      if (!societyId) return undefined;
      const supabase = getSupabase();
      cleanupRef.current = subscribeToFeed(supabase, societyId, {
        onInsert: (row) => {
          setPosts((prev) => {
            if (prev.some((p) => p.id === row.id)) return prev;
            return [row, ...prev];
          });
        },
        onUpdate: () => load(),
        onDelete: () => load(),
        onConnected: () => load(),
      });
      return () => {
        cleanupRef.current?.();
        cleanupRef.current = null;
      };
    }, [societyId, load]),
  );

  function handleOpen(post) {
    router.push(`/(protected)/(tabs)/community/${post.id}`);
  }

  function handleNewPost() {
    router.push("/(protected)/(tabs)/community/new");
  }

  function handleModeration() {
    router.push("/(protected)/(tabs)/moderation");
  }

  return (
    <View className="flex-1 bg-neutral-50">
      {/* Header */}
      <View className="px-4 pt-12 pb-3 bg-white border-b border-neutral-100 flex-row items-center gap-3">
        <Text className="text-xl font-semibold text-neutral-900 flex-1">
          {t("community.feedTitle")}
        </Text>

        {/* Admin-only moderation entry (ShieldAlert) — NOT a tile, a header action */}
        {isAdmin ? (
          <Pressable
            onPress={handleModeration}
            accessibilityRole="button"
            accessibilityLabel="Moderation queue"
            className="p-2"
          >
            <ShieldAlert size={24} color="#12715A" />
          </Pressable>
        ) : null}
      </View>

      {/* Body */}
      {loading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" color="#12715A" />
        </View>
      ) : error ? (
        <ErrorState t={t} onRetry={load} />
      ) : posts.length === 0 ? (
        <EmptyState t={t} onNewPost={handleNewPost} />
      ) : (
        <FlatList
          data={posts}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: 96 }}
          renderItem={({ item }) => (
            <PostCard post={item} onPress={handleOpen} currentUserId={userId} />
          )}
          showsVerticalScrollIndicator={false}
        />
      )}

      {/* New Post FAB — all roles (COMM-01) */}
      <Pressable
        onPress={handleNewPost}
        accessibilityRole="button"
        accessibilityLabel={t("community.newPostCta")}
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
    </View>
  );
}

function EmptyState({ t, onNewPost }) {
  return (
    <View className="flex-1 items-center justify-center px-8 gap-4">
      <Users2 size={80} color="#8a8a8a" />
      <Text
        className="font-semibold text-neutral-600 text-center"
        style={{ fontSize: 28, lineHeight: 32 }}
      >
        {t("community.emptyHeading")}
      </Text>
      <Text className="text-base text-neutral-400 text-center">{t("community.emptyBody")}</Text>
      <Pressable
        onPress={onNewPost}
        accessibilityRole="button"
        accessibilityLabel={t("community.newPostCta")}
        className="h-12 px-6 rounded-xl bg-brand-500 items-center justify-center mt-2"
      >
        <Text className="text-base font-semibold text-white">{t("community.newPostCta")}</Text>
      </Pressable>
    </View>
  );
}

function ErrorState({ t, onRetry }) {
  return (
    <View className="flex-1 items-center justify-center px-8 gap-3">
      <WifiOff size={48} color="#8a8a8a" />
      <Text className="text-xl font-semibold text-neutral-900 text-center">
        {t("community.loadError")}
      </Text>
      <Pressable
        onPress={onRetry}
        className="h-10 px-4 rounded-lg border border-neutral-200 items-center justify-center mt-2"
        accessibilityRole="button"
      >
        <Text className="text-sm font-semibold text-neutral-900">Try again</Text>
      </Pressable>
    </View>
  );
}
