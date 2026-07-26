// /(protected)/(tabs)/flat-actions — role-aware flat-actions surface.
//
// Per 06-UI-SPEC.md Screen 2 (member tab) + Screen 3 (board per-flat view):
//   - MEMBER: ONLY their own flat's actions (D-05). Lock icon + "Actions for your
//     flat · {{flat}}" subtitle, NO flat picker. FlatActionCard list (no flat pill).
//     RLS scopes results to the member's own flat — the client renders as-is.
//   - BOARD/ADMIN: header + (admin) "Issue Action" FAB, flat filter pill (All flats
//     default), All/Fines tabs, FlatActionCard with showFlatPill. listFlatActions
//     returns all flats the board may see (RLS), optionally narrowed by the filter.
//   - Realtime via subscribeFlatActions in useFocusEffect (member: scoped to flatId;
//     board: scoped to societyId). No optimistic UI.
//
// JavaScript only — no TypeScript per CLAUDE.md.

import { listFlatActions, subscribeFlatActions } from "@parisar/api-client";
import { useFocusEffect, useRouter } from "expo-router";
import { Plus, ShieldCheck, WifiOff } from "lucide-react-native";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { ActivityIndicator, FlatList, Pressable, Text, View } from "react-native";
import { FlatActionCard } from "../../../../components/flat-actions/FlatActionCard";
import { FlatPicker, PrivateFlatSubtitle } from "../../../../components/flat-actions/FlatPicker";
import { useAuthStore } from "../../../../lib/auth-store";
import { fetchFlatLabel } from "../../../../lib/flat-label";
import { getSupabase } from "../../../../lib/supabase";

const BOARD_ROLES = new Set(["board_member", "co_secretary", "secretary"]);
const ADMIN_ROLES = new Set(["co_secretary", "secretary"]);

export default function FlatActionsScreen() {
  const router = useRouter();
  const { t } = useTranslation("flat-actions");
  const session = useAuthStore((s) => s.session);

  const jwtMeta = session?.user?.app_metadata ?? session?.user?.user_metadata ?? {};
  const societyId = jwtMeta.society_id ?? null;
  const role = jwtMeta.role ?? "member";
  const userId = session?.user?.id ?? null;
  const memberFlatId = jwtMeta.flat_id ?? null;
  const isBoard = BOARD_ROLES.has(role);
  const isAdmin = ADMIN_ROLES.has(role);

  const [actions, setActions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [activeTab, setActiveTab] = useState("all"); // board: 'all' | 'fines'
  const [flats, setFlats] = useState([]); // board: filter options
  const [filterFlatId, setFilterFlatId] = useState(null);
  const [memberFlatLabel, setMemberFlatLabel] = useState("—");

  const cleanupRef = useRef(null);

  // Member-side flat label for the privacy subtitle (D-05).
  useEffect(() => {
    if (isBoard || !userId || !societyId) return;
    let cancelled = false;
    fetchFlatLabel(getSupabase(), userId, societyId).then((label) => {
      if (!cancelled) setMemberFlatLabel(label);
    });
    return () => {
      cancelled = true;
    };
  }, [isBoard, userId, societyId]);

  // Board-side flat filter options.
  useEffect(() => {
    if (!isBoard || !societyId) return;
    let cancelled = false;
    (async () => {
      try {
        const { data } = await getSupabase()
          .from("flats")
          .select("id, number, wing:wing_id ( name )")
          .eq("society_id", societyId)
          .order("number");
        if (!cancelled) setFlats(data ?? []);
      } catch {
        if (!cancelled) setFlats([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isBoard, societyId]);

  const load = useCallback(async () => {
    if (!societyId) return;
    setError(null);
    try {
      const supabase = getSupabase();
      // RLS scopes per-flat for members (D-05). Board passes the active filter.
      const rows = await listFlatActions(supabase, {
        flatId: isBoard ? filterFlatId : memberFlatId,
      });
      setActions(rows);
    } catch (err) {
      console.warn("[flat-actions/index] load failed:", err?.message ?? err);
      setError(err?.message ?? "load_failed");
    } finally {
      setLoading(false);
    }
  }, [societyId, isBoard, filterFlatId, memberFlatId]);

  useEffect(() => {
    load();
  }, [load]);

  // Realtime — member scoped to their flat; board scoped to society.
  useFocusEffect(
    useCallback(() => {
      if (!societyId) return undefined;
      const supabase = getSupabase();
      cleanupRef.current = subscribeFlatActions(supabase, {
        societyId,
        flatId: isBoard ? null : memberFlatId,
        onInsert: (row) => {
          setActions((prev) => {
            if (prev.some((a) => a.id === row.id)) return prev;
            return [row, ...prev];
          });
        },
        onConnected: () => load(),
      });
      return () => {
        cleanupRef.current?.();
        cleanupRef.current = null;
      };
    }, [societyId, isBoard, memberFlatId, load]),
  );

  const visible = useMemo(() => {
    if (isBoard && activeTab === "fines") {
      return actions.filter((a) => a.kind === "fine");
    }
    return actions;
  }, [actions, isBoard, activeTab]);

  function handleOpen(action) {
    router.push(`/(protected)/(tabs)/flat-actions/${action.id}`);
  }

  function handleIssue() {
    router.push("/(protected)/(tabs)/flat-actions/new");
  }

  return (
    <View className="flex-1 bg-neutral-50">
      {/* Header */}
      <View className="px-4 pt-12 pb-3 bg-white border-b border-neutral-100 gap-2">
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
            {t("flatAction.memberTitle")}
          </Text>
        </View>

        {/* Member privacy subtitle (D-05) — Lock + "Actions for your flat · {{flat}}" */}
        {!isBoard ? <PrivateFlatSubtitle flatLabel={memberFlatLabel} /> : null}

        {/* Board: flat filter + All/Fines tabs */}
        {isBoard ? (
          <>
            <FlatPicker
              flats={flats}
              selectedId={filterFlatId}
              onSelect={(f) => setFilterFlatId(f?.id ?? null)}
              label={t("flatAction.filterFlat")}
              allowAll
            />
            <View className="flex-row gap-6 mt-1">
              <TabButton
                label="All"
                active={activeTab === "all"}
                onPress={() => setActiveTab("all")}
              />
              <TabButton
                label={t("flatAction.kindFine")}
                active={activeTab === "fines"}
                onPress={() => setActiveTab("fines")}
              />
            </View>
          </>
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
        <EmptyState t={t} isBoard={isBoard} />
      ) : (
        <FlatList
          data={visible}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: 96 }}
          renderItem={({ item }) => (
            <FlatActionCard action={item} onPress={handleOpen} showFlatPill={isBoard} />
          )}
          showsVerticalScrollIndicator={false}
        />
      )}

      {/* Issue Action FAB — ADMIN ONLY */}
      {isAdmin ? (
        <Pressable
          onPress={handleIssue}
          accessibilityRole="button"
          accessibilityLabel={t("flatAction.issueCta")}
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

function EmptyState({ t, isBoard }) {
  const heading = isBoard ? t("flatAction.emptyHeadingBoard") : t("flatAction.emptyHeading");
  const body = isBoard ? t("flatAction.emptyBodyBoard") : t("flatAction.emptyBody");
  return (
    <View className="flex-1 items-center justify-center px-8 gap-4">
      <ShieldCheck size={80} color="#8a8a8a" />
      <Text
        className="font-semibold text-neutral-600 text-center"
        style={{ fontSize: 28, lineHeight: 32 }}
      >
        {heading}
      </Text>
      <Text className="text-base text-neutral-400 text-center">{body}</Text>
    </View>
  );
}

function ErrorState({ t, onRetry }) {
  return (
    <View className="flex-1 items-center justify-center px-8 gap-3">
      <WifiOff size={48} color="#8a8a8a" />
      <Text className="text-xl font-semibold text-neutral-900 text-center">
        {t("flatAction.loadError")}
      </Text>
      <Pressable
        onPress={onRetry}
        className="h-10 px-4 rounded-lg border border-neutral-200 items-center justify-center mt-2"
        accessibilityRole="button"
      >
        <Text className="text-sm font-semibold text-neutral-900">{"Try again"}</Text>
      </Pressable>
    </View>
  );
}
