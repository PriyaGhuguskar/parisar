// /(protected)/(tabs)/moderation — Secretary moderation queue + audit log (COMM-04/06/07).
//
// Per 06-UI-SPEC.md Screen 8: the ONLY surface where hidden content appears (D-03).
//   - Admin-only guard (secretary / co_secretary). A non-admin sees notAuthorized, no queue.
//   - Tabs: "To review" (ModerationCard list via listModerationQueue, oldest-first FIFO —
//     respects the 24h obligation) | "Audit log" (AuditLogRow via listAuditLog, newest-first).
//   - Restore (restoreContent) / Confirm-takedown (confirmTakedown) — both write audit events.
//   - Realtime via subscribeToModerationQueue (a new report flips a row hidden → appears;
//     a co-admin's restore/takedown removes it).
//
// The queue items merge listModerationQueue's { posts, comments } into one FIFO list, each
// tagged with its kind. Report counts/reasons are looked up from the reports table (admin RLS).
//
// JavaScript only — no TypeScript per CLAUDE.md.

import {
  confirmTakedown,
  listAuditLog,
  listModerationQueue,
  restoreContent,
  subscribeToModerationQueue,
} from "@parisar/api-client";
import { useFocusEffect, useRouter } from "expo-router";
import { ShieldCheck } from "lucide-react-native";
import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { ActivityIndicator, FlatList, Pressable, Text, View } from "react-native";
import { AuditLogRow } from "../../../../components/community/AuditLogRow";
import { ModerationCard } from "../../../../components/community/ModerationCard";
import { useAuthStore } from "../../../../lib/auth-store";
import { getSupabase } from "../../../../lib/supabase";

const ADMIN_ROLES = new Set(["co_secretary", "secretary"]);

// Build a { [targetId]: { count, reasons } } map from raw report rows.
function summarizeReports(reports, reasonLabel) {
  const map = {};
  for (const r of reports ?? []) {
    const id = r.target_id;
    if (!id) continue;
    if (!map[id]) map[id] = { count: 0, reasonSet: new Set() };
    map[id].count += 1;
    if (r.reason) map[id].reasonSet.add(reasonLabel(r.reason));
  }
  const out = {};
  for (const id of Object.keys(map)) {
    out[id] = {
      count: map[id].count,
      reasons: Array.from(map[id].reasonSet).join(", "),
    };
  }
  return out;
}

export default function ModerationScreen() {
  const router = useRouter();
  const { t } = useTranslation(["moderation", "community"]);
  const session = useAuthStore((s) => s.session);

  const jwtMeta = session?.user?.app_metadata ?? session?.user?.user_metadata ?? {};
  const societyId = jwtMeta.society_id ?? null;
  const role = jwtMeta.role ?? "member";
  const isAdmin = ADMIN_ROLES.has(role);

  // Map a report reason key to its human label (community.reason.*); fall back to the raw key.
  const reasonLabel = useCallback(
    (key) => {
      const value = t(`community:community.reason.${key}`);
      return value === `community:community.reason.${key}` ? key : value;
    },
    [t],
  );

  const [tab, setTab] = useState("review"); // 'review' | 'audit'
  const [queue, setQueue] = useState([]); // merged FIFO items w/ kind
  const [reportInfo, setReportInfo] = useState({}); // { [id]: { count, reasons } }
  const [auditLog, setAuditLog] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [pendingId, setPendingId] = useState(null); // item currently being restored/taken down
  const [pendingAction, setPendingAction] = useState(null); // 'restore' | 'takedown'

  const cleanupRef = useRef(null);

  const load = useCallback(async () => {
    if (!societyId || !isAdmin) return;
    setError(null);
    try {
      const supabase = getSupabase();
      const { posts, comments } = await listModerationQueue(supabase);
      const merged = [
        ...posts.map((p) => ({ ...p, kind: "post" })),
        ...comments.map((c) => ({ ...c, kind: "comment" })),
      ].sort(
        // FIFO — oldest hidden first (the 24h obligation, COMM-06).
        (a, b) => new Date(a.hidden_at ?? a.created_at) - new Date(b.hidden_at ?? b.created_at),
      );
      setQueue(merged);

      // Report counts + reasons (admin-RLS reports read; defensive on failure).
      try {
        const ids = merged.map((m) => m.id);
        if (ids.length > 0) {
          const { data: reports } = await supabase
            .from("reports")
            .select("target_id, reason")
            .in("target_id", ids);
          setReportInfo(summarizeReports(reports, reasonLabel));
        } else {
          setReportInfo({});
        }
      } catch {
        setReportInfo({});
      }

      const events = await listAuditLog(supabase);
      setAuditLog(events);
    } catch (err) {
      console.warn("[moderation/index] load failed:", err?.message ?? err);
      setError(err?.message ?? "load_failed");
    } finally {
      setLoading(false);
    }
  }, [societyId, isAdmin, reasonLabel]);

  useEffect(() => {
    load();
  }, [load]);

  // Realtime — a new report or a co-admin action changes the queue; re-load to resync.
  useFocusEffect(
    useCallback(() => {
      if (!societyId || !isAdmin) return undefined;
      const supabase = getSupabase();
      cleanupRef.current = subscribeToModerationQueue(supabase, societyId, {
        onPostUpdate: () => load(),
        onCommentUpdate: () => load(),
        onConnected: () => load(),
      });
      return () => {
        cleanupRef.current?.();
        cleanupRef.current = null;
      };
    }, [societyId, isAdmin, load]),
  );

  async function handleRestore(item) {
    setPendingId(item.id);
    setPendingAction("restore");
    try {
      await restoreContent(getSupabase(), { targetKind: item.kind, targetId: item.id });
      setQueue((prev) => prev.filter((q) => q.id !== item.id));
      await load();
    } catch (err) {
      console.warn("[moderation/index] restore failed:", err?.message ?? err);
    } finally {
      setPendingId(null);
      setPendingAction(null);
    }
  }

  async function handleTakedown(item) {
    setPendingId(item.id);
    setPendingAction("takedown");
    try {
      await confirmTakedown(getSupabase(), { targetKind: item.kind, targetId: item.id });
      setQueue((prev) => prev.filter((q) => q.id !== item.id));
      await load();
    } catch (err) {
      console.warn("[moderation/index] takedown failed:", err?.message ?? err);
    } finally {
      setPendingId(null);
      setPendingAction(null);
    }
  }

  // Defensive admin-only guard (route is reached only via the feed ShieldAlert, but
  // guard anyway — T-06-23 defence in depth; RLS is the server authority).
  if (!isAdmin) {
    return (
      <View className="flex-1 bg-neutral-50">
        <Header onBack={() => router.back()} title={t("moderation:moderation.title")} />
        <View className="flex-1 items-center justify-center px-8">
          <Text className="text-base text-neutral-600 text-center">
            {t("community:community.loadError")}
          </Text>
        </View>
      </View>
    );
  }

  return (
    <View className="flex-1 bg-neutral-50">
      <Header onBack={() => router.back()} title={t("moderation:moderation.title")} />

      {/* Tabs */}
      <View className="flex-row gap-6 px-4 bg-white border-b border-neutral-100">
        <TabButton
          label={t("moderation:moderation.tabReview")}
          active={tab === "review"}
          onPress={() => setTab("review")}
        />
        <TabButton
          label={t("moderation:moderation.tabAudit")}
          active={tab === "audit"}
          onPress={() => setTab("audit")}
        />
      </View>

      {loading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" color="#12715A" />
        </View>
      ) : error ? (
        <View className="flex-1 items-center justify-center px-8 gap-3">
          <Text className="text-base text-neutral-600 text-center">
            {t("community:community.loadError")}
          </Text>
          <Pressable
            onPress={load}
            className="h-10 px-4 rounded-lg border border-neutral-200 items-center justify-center"
            accessibilityRole="button"
          >
            <Text className="text-sm font-semibold text-neutral-900">Try again</Text>
          </Pressable>
        </View>
      ) : tab === "review" ? (
        queue.length === 0 ? (
          <ReviewEmpty t={t} />
        ) : (
          <FlatList
            data={queue}
            keyExtractor={(item) => `${item.kind}-${item.id}`}
            contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: 48 }}
            renderItem={({ item }) => (
              <ModerationCard
                item={item}
                reportCount={reportInfo[item.id]?.count ?? 1}
                reasons={reportInfo[item.id]?.reasons ?? ""}
                supabase={getSupabase()}
                onRestore={handleRestore}
                onTakedown={handleTakedown}
                restoring={pendingId === item.id && pendingAction === "restore"}
                takingDown={pendingId === item.id && pendingAction === "takedown"}
              />
            )}
            showsVerticalScrollIndicator={false}
          />
        )
      ) : auditLog.length === 0 ? (
        <View className="flex-1 items-center justify-center px-8">
          <Text className="text-sm text-neutral-400 text-center">
            {t("moderation:moderation.auditEmpty")}
          </Text>
        </View>
      ) : (
        <FlatList
          data={auditLog}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ padding: 16, paddingBottom: 48 }}
          renderItem={({ item, index }) => (
            <View className="bg-white rounded-xl p-4 mb-2">
              <AuditLogRow event={item} isLast={index === auditLog.length - 1} />
            </View>
          )}
          showsVerticalScrollIndicator={false}
        />
      )}
    </View>
  );
}

function Header({ onBack, title }) {
  return (
    <View className="px-4 pt-12 pb-3 bg-white border-b border-neutral-100 flex-row items-center gap-3">
      <Pressable
        onPress={onBack}
        className="p-2"
        accessibilityRole="button"
        accessibilityLabel="Go back"
      >
        <Text className="text-base text-brand-500">{"←"}</Text>
      </Pressable>
      <Text className="text-xl font-semibold text-neutral-900 flex-1">{title}</Text>
    </View>
  );
}

function TabButton({ label, active, onPress }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      className="py-3"
    >
      <Text
        className={`text-sm ${active ? "font-semibold text-brand-500" : "text-neutral-400"}`}
        style={{
          borderBottomWidth: active ? 2 : 0,
          borderBottomColor: "#12715A",
          paddingBottom: 4,
        }}
      >
        {label}
      </Text>
    </Pressable>
  );
}

function ReviewEmpty({ t }) {
  return (
    <View className="flex-1 items-center justify-center px-8 gap-4">
      <ShieldCheck size={80} color="#8a8a8a" />
      <Text
        className="font-semibold text-neutral-600 text-center"
        style={{ fontSize: 28, lineHeight: 32 }}
      >
        {t("moderation:moderation.emptyHeading")}
      </Text>
      <Text className="text-base text-neutral-400 text-center">
        {t("moderation:moderation.emptyBody")}
      </Text>
    </View>
  );
}
