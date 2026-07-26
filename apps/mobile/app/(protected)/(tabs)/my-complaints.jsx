// /(protected)/my-complaints — Member-only view of their own complaints.
//
// Per 04-04-PLAN Task 2:
//   - Same shape as /complaints/index but query filtered to reporter_id = auth.uid().
//   - No Realtime (member doesn't need live board updates).
//   - No tabs (member sees everything).
//   - Title: "My Complaints".
//   - FAB → /complaints/new.

import { listComplaints } from "@parisar/api-client";
import { useFocusEffect, useRouter } from "expo-router";
import { MessageSquareWarning, Plus, WifiOff } from "lucide-react-native";
import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { ActivityIndicator, FlatList, Pressable, Text, View } from "react-native";
import { ComplaintCard } from "../../../components/complaints/ComplaintCard";
import { useAuthStore } from "../../../lib/auth-store";
import { getSupabase } from "../../../lib/supabase";

export default function MyComplaintsScreen() {
  const router = useRouter();
  const { t } = useTranslation("complaints");
  const session = useAuthStore((s) => s.session);
  const userId = session?.user?.id ?? null;
  const societyId =
    session?.user?.app_metadata?.society_id ?? session?.user?.user_metadata?.society_id ?? null;

  const [complaints, setComplaints] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    if (!societyId) return;
    setError(null);
    try {
      const supabase = getSupabase();
      const rows = await listComplaints(supabase);
      // RLS already filters to this society; we additionally restrict to the
      // current user so this screen is never accidentally board-wide.
      const own = rows.filter((c) => c.reporter_id === userId);
      setComplaints(own);
    } catch (err) {
      console.warn("[my-complaints/index] load failed:", err?.message ?? err);
      setError(err?.message ?? "load_failed");
    } finally {
      setLoading(false);
    }
  }, [societyId, userId]);

  useEffect(() => {
    load();
  }, [load]);

  // Refetch on focus (no realtime here per plan).
  useFocusEffect(
    useCallback(() => {
      load();
      return () => {};
    }, [load]),
  );

  function handleOpen(complaint) {
    router.push(`/(protected)/(tabs)/complaints/${complaint.id}`);
  }

  function handleFile() {
    router.push("/(protected)/(tabs)/complaints/new");
  }

  return (
    <View className="flex-1 bg-neutral-50">
      <View className="px-4 pt-12 pb-3 bg-white border-b border-neutral-100 flex-row items-center gap-3">
        <Pressable
          onPress={() => router.back()}
          className="p-2"
          accessibilityRole="button"
          accessibilityLabel="Go back"
        >
          <Text className="text-base text-brand-500">{"←"}</Text>
        </Pressable>
        <Text className="text-xl font-semibold text-neutral-900 flex-1">My Complaints</Text>
      </View>

      {loading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" color="#12715A" />
        </View>
      ) : error ? (
        <View className="flex-1 items-center justify-center px-8 gap-3">
          <WifiOff size={48} color="#8a8a8a" />
          <Text className="text-xl font-semibold text-neutral-900 text-center">
            {t("complaint.loadError")}
          </Text>
          <Text className="text-base text-neutral-600 text-center">
            {t("complaint.loadErrorBody")}
          </Text>
          <Pressable
            onPress={load}
            className="h-10 px-4 rounded-lg border border-neutral-200 items-center justify-center mt-2"
            accessibilityRole="button"
          >
            <Text className="text-sm font-semibold text-neutral-900">Try again</Text>
          </Pressable>
        </View>
      ) : complaints.length === 0 ? (
        <View className="flex-1 items-center justify-center px-8 gap-4">
          <MessageSquareWarning size={80} color="#8a8a8a" />
          <Text
            className="font-semibold text-neutral-600 text-center"
            style={{ fontSize: 28, lineHeight: 32 }}
          >
            {t("complaint.emptyHeading")}
          </Text>
          <Text className="text-base text-neutral-400 text-center">{t("complaint.emptyBody")}</Text>
          <Pressable
            onPress={handleFile}
            className="h-14 px-6 rounded-xl bg-brand-500 active:bg-brand-600 items-center justify-center mt-2"
            accessibilityRole="button"
            accessibilityLabel={t("complaint.fileCta")}
          >
            <Text className="text-base font-semibold text-white">{t("complaint.fileCta")}</Text>
          </Pressable>
        </View>
      ) : (
        <FlatList
          data={complaints}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: 96 }}
          renderItem={({ item }) => (
            <ComplaintCard
              complaint={item}
              onPress={handleOpen}
              supabase={getSupabase()}
              thumbnailStorageKey={null}
            />
          )}
          showsVerticalScrollIndicator={false}
        />
      )}

      {/* FAB */}
      <Pressable
        onPress={handleFile}
        accessibilityRole="button"
        accessibilityLabel={t("complaint.fileCta")}
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
