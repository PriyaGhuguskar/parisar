// /(protected)/complaints — Complaint list (board view + member self-view).
//
// Per 04-UI-SPEC.md Screen 1:
//   - Header: title + (board only) "Open" / "Resolved" tabs
//   - FlatList of ComplaintCard rows
//   - Floating "+" FAB (bottom-right) → /complaints/new
//   - Realtime: useFocusEffect subscribes to society channel on focus,
//     cleans up on blur. Guard: !societyId → no subscription.
//   - Member mode: only their own complaints (reporter_id = auth.uid()) — filter client-side.
//   - Tabs filter in-memory (UI-SPEC D8).
//   - Empty state (no complaints), error state (load failed) per UI-SPEC.

import { listComplaints, subscribeToComplaints } from "@parisar/api-client";
import { useFocusEffect, useRouter } from "expo-router";
import { MessageSquareWarning, Plus, WifiOff } from "lucide-react-native";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { ActivityIndicator, FlatList, Pressable, Text, View } from "react-native";
import { ComplaintCard } from "../../../../components/complaints/ComplaintCard";
import { useAuthStore } from "../../../../lib/auth-store";
import { getSupabase } from "../../../../lib/supabase";

const BOARD_ROLES = new Set(["board_member", "co_secretary", "secretary"]);

const STATUS_OPEN_SET = new Set(["open", "checking", "will_resolve", "need_info"]);

function isBoardRole(role) {
  return BOARD_ROLES.has(role);
}

export default function ComplaintsScreen() {
  const router = useRouter();
  const { t } = useTranslation("complaints");
  const session = useAuthStore((s) => s.session);

  const jwtMeta = session?.user?.app_metadata ?? session?.user?.user_metadata ?? {};
  const societyId = jwtMeta.society_id ?? null;
  const role = jwtMeta.role ?? "member";
  const userId = session?.user?.id ?? null;
  const isBoard = isBoardRole(role);

  const [complaints, setComplaints] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [activeTab, setActiveTab] = useState("open"); // 'open' | 'resolved'

  const cleanupRef = useRef(null);

  // Initial + manual refetch
  const load = useCallback(async () => {
    if (!societyId) return;
    setError(null);
    try {
      const supabase = getSupabase();
      const rows = await listComplaints(supabase);
      // Member self-filter: RLS also enforces this, but a defensive client filter
      // keeps the empty state honest if a future role-change flicker lets
      // foreign complaints leak in for a frame.
      const filtered = isBoard ? rows : rows.filter((c) => c.reporter_id === userId);
      setComplaints(filtered);
    } catch (err) {
      console.warn("[complaints/index] load failed:", err?.message ?? err);
      setError(err?.message ?? "load_failed");
    } finally {
      setLoading(false);
    }
  }, [societyId, userId, isBoard]);

  // Initial load
  useEffect(() => {
    load();
  }, [load]);

  // Realtime — subscribe on focus, clean up on blur. Societies guard before subscribing
  // (RESEARCH.md Pattern 2 / Threat T-04-19).
  useFocusEffect(
    useCallback(() => {
      if (!societyId) return undefined;
      const supabase = getSupabase();
      cleanupRef.current = subscribeToComplaints(supabase, societyId, {
        onInsert: (row) => {
          // For members, only show their own complaints in realtime as well.
          if (!isBoard && row?.reporter_id !== userId) return;
          setComplaints((prev) => {
            if (prev.some((c) => c.id === row.id)) return prev;
            // INSERT payloads from postgres_changes don't include joined fields;
            // refetch the row would be ideal, but the next focus/refresh will
            // hydrate joins. For now, prepend the raw row — the card renders
            // sensibly with missing joins (renders "—" for name/flat).
            return [row, ...prev];
          });
        },
        onUpdate: (row) => {
          setComplaints((prev) => prev.map((c) => (c.id === row.id ? { ...c, ...row } : c)));
        },
        onConnected: () => {
          // Realtime reconnect → refetch to fill any gap.
          load();
        },
      });
      return () => {
        cleanupRef.current?.();
        cleanupRef.current = null;
      };
    }, [societyId, isBoard, userId, load]),
  );

  const visible = useMemo(() => {
    if (isBoard) {
      if (activeTab === "open") {
        return complaints.filter((c) => STATUS_OPEN_SET.has(c.status));
      }
      return complaints.filter((c) => c.status === "resolved");
    }
    // Member view — no tabs; show everything.
    return complaints;
  }, [complaints, activeTab, isBoard]);

  function handleOpenComplaint(complaint) {
    router.push(`/(protected)/(tabs)/complaints/${complaint.id}`);
  }

  function handleFile() {
    router.push("/(protected)/(tabs)/complaints/new");
  }

  // -------------------------------------------------------------------------
  // Render — header + (tabs?) + content + FAB
  // -------------------------------------------------------------------------
  return (
    <View className="flex-1 bg-neutral-50">
      {/* Header */}
      <View className="px-4 pt-12 pb-3 bg-white border-b border-neutral-100">
        <View className="flex-row items-center gap-3">
          <Pressable
            onPress={() => router.back()}
            className="p-2"
            accessibilityRole="button"
            accessibilityLabel="Go back"
          >
            <Text className="text-base text-brand-500">{"←"}</Text>
          </Pressable>
          <Text className="text-xl font-semibold text-neutral-900 flex-1">
            {isBoard ? "Complaints" : "My Complaints"}
          </Text>
        </View>

        {/* Tabs (board only) */}
        {isBoard ? (
          <View className="flex-row gap-6 mt-3">
            <TabButton
              label="Open"
              active={activeTab === "open"}
              onPress={() => setActiveTab("open")}
            />
            <TabButton
              label="Resolved"
              active={activeTab === "resolved"}
              onPress={() => setActiveTab("resolved")}
            />
          </View>
        ) : null}
      </View>

      {/* Body */}
      {loading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" color="#12715A" />
        </View>
      ) : error ? (
        <ErrorState t={t} onRetry={load} />
      ) : visible.length === 0 ? (
        <EmptyState t={t} isBoard={isBoard} activeTab={activeTab} onFile={handleFile} />
      ) : (
        <FlatList
          data={visible}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: 96 }}
          renderItem={({ item }) => (
            <ComplaintCard
              complaint={item}
              onPress={handleOpenComplaint}
              supabase={getSupabase()}
              // Thumbnail wiring deferred: the list query doesn't embed attachments
              // (would need a second fetch). Cards render without thumbnails.
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

// ---------------------------------------------------------------------------
// Local sub-components
// ---------------------------------------------------------------------------

function TabButton({ label, active, onPress }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      className="py-2"
    >
      <Text
        className={`text-sm ${active ? "font-semibold text-brand-500" : "text-neutral-400"}`}
        style={{
          borderBottomWidth: active ? 2 : 0,
          borderBottomColor: "#12715A",
          paddingBottom: 2,
        }}
      >
        {label}
      </Text>
    </Pressable>
  );
}

function EmptyState({ t, isBoard, activeTab, onFile }) {
  let heading = t("complaint.emptyHeading");
  let body = isBoard ? t("complaint.emptyBodyBoard") : t("complaint.emptyBody");
  if (isBoard && activeTab === "resolved") {
    heading = t("complaint.emptyResolved");
    body = t("complaint.emptyResolvedBody");
  }

  return (
    <View className="flex-1 items-center justify-center px-8 gap-4">
      <MessageSquareWarning size={80} color="#8a8a8a" />
      <Text
        className="font-semibold text-neutral-600 text-center"
        style={{ fontSize: 28, lineHeight: 32 }}
      >
        {heading}
      </Text>
      <Text className="text-base text-neutral-400 text-center">{body}</Text>
      {!isBoard ? (
        <Pressable
          onPress={onFile}
          className="h-14 px-6 rounded-xl bg-brand-500 active:bg-brand-600 items-center justify-center mt-2"
          accessibilityRole="button"
          accessibilityLabel={t("complaint.fileCta")}
        >
          <Text className="text-base font-semibold text-white">{t("complaint.fileCta")}</Text>
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
        {t("complaint.loadError")}
      </Text>
      <Text className="text-base text-neutral-600 text-center">{t("complaint.loadErrorBody")}</Text>
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
