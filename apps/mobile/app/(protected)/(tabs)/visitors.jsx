// apps/mobile/app/(protected)/(tabs)/visitors.jsx
// Visitors — the resident's gate inbox; mobile port of apps/web/components/
// visitors/VisitorInbox.jsx. The guard asks at the gate; the resident approves
// or denies here. Live via realtime on visitor_requests (RLS: own flat only).
//
// JavaScript only — no TypeScript per CLAUDE.md.

import { residentDecideVisit } from "@parisar/api-client";
import { Check, DoorOpen, WifiOff, X } from "lucide-react-native";
import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  EmptyState,
  PageHeader,
  SmallButton,
  StatusPill,
  SurfaceCard,
} from "../../../components/kit";
import { Text } from "../../../components/ui/Text";
import { getSupabase } from "../../../lib/supabase";
import { useMyContext } from "../../../lib/use-my-context";
import { useSocietyRealtime } from "../../../lib/use-society-realtime";

const DECIDED_TONE = {
  approved: "done",
  denied: "danger",
  cancelled: "neutral",
  expired: "neutral",
};

function decidedLabel(t, status) {
  if (status === "approved") return t("visitor.statusApproved");
  if (status === "expired") return t("visitor.statusExpired");
  return t("visitor.statusDenied");
}

export default function VisitorsScreen() {
  const { t } = useTranslation(["auth", "dashboard"]);
  const [requests, setRequests] = useState([]);
  const [busyId, setBusyId] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  const me = useMyContext();

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [actionError, setActionError] = useState(null);

  const load = useCallback(async () => {
    const { data, error } = await getSupabase()
      .from("visitor_requests")
      .select("id, visitor_name, visitor_phone, purpose, status, created_at")
      .order("created_at", { ascending: false })
      .limit(40);
    setLoading(false);
    if (error) {
      console.warn("[visitors] load failed:", error.message ?? error);
      setLoadError(true);
      return;
    }
    setLoadError(false);
    setRequests(Array.isArray(data) ? data : []);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // Live while focused: only this flat's requests (RLS shows nothing else).
  useSocietyRealtime("visitor_requests", me.flatId ?? null, load, { column: "flat_id" });

  async function decide(id, approve) {
    setBusyId(id);
    setActionError(null);
    try {
      const res = await residentDecideVisit(getSupabase(), { requestId: id, approve });
      if (res?.error === "VISIT_EXPIRED") setActionError(t("visitor.expiredError"));
      else if (res?.error === "ALREADY_DECIDED") setActionError(t("visitor.alreadyDecided"));
      else if (res?.error) setActionError(t("common.loadError"));
    } catch (err) {
      console.warn("[visitors] decide failed:", err?.message ?? err);
      setActionError(t("auth.obErr"));
    } finally {
      setBusyId(null);
      await load();
    }
  }

  const pending = requests.filter((r) => r.status === "pending");
  const decided = requests.filter((r) => r.status !== "pending");

  return (
    <SafeAreaView className="flex-1 bg-neutral-50" edges={["top"]}>
      <ScrollView
        contentContainerClassName="px-5 pt-4 pb-10"
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={async () => {
              setRefreshing(true);
              await load();
              setRefreshing(false);
            }}
          />
        }
      >
        <PageHeader
          backLabel={t("dashboard:nav.home")}
          backHref="/(protected)/(tabs)"
          title={t("visitor.inboxTitle")}
          description={t("visitor.inboxLead")}
        />

        <Text className="pb-2 text-xs font-bold uppercase tracking-wide text-neutral-400">
          {t("visitor.atGate")}
        </Text>
        {actionError ? (
          <Text className="pb-2 text-sm text-danger-500" accessibilityRole="alert">
            {actionError}
          </Text>
        ) : null}
        {loading ? (
          <ActivityIndicator color="#12715A" style={{ marginTop: 16 }} />
        ) : loadError ? (
          <EmptyState
            icon={WifiOff}
            title={t("common.loadError")}
            action={
              <SmallButton
                label={t("common.retry")}
                onPress={() => {
                  setLoading(true);
                  load();
                }}
              />
            }
          />
        ) : pending.length === 0 ? (
          <EmptyState icon={DoorOpen} title={t("visitor.noPending")} />
        ) : (
          <View className="gap-3">
            {pending.map((r) => (
              <SurfaceCard key={r.id}>
                <Text className="text-lg font-semibold text-neutral-900">{r.visitor_name}</Text>
                <Text className="text-sm text-neutral-600">
                  {[r.purpose, r.visitor_phone].filter(Boolean).join(" · ") ||
                    t("visitor.gateLabel")}
                </Text>
                <View className="mt-3 flex-row gap-2">
                  <Pressable
                    disabled={busyId === r.id}
                    onPress={() => decide(r.id, true)}
                    accessibilityRole="button"
                    className="flex-1 flex-row items-center justify-center gap-1.5 rounded-xl bg-brand-500 py-3"
                    style={{ opacity: busyId === r.id ? 0.6 : 1 }}
                  >
                    <Check size={16} color="#fff" />
                    <Text className="text-base font-semibold text-neutral-0">
                      {t("visitor.approve")}
                    </Text>
                  </Pressable>
                  <Pressable
                    disabled={busyId === r.id}
                    onPress={() => decide(r.id, false)}
                    accessibilityRole="button"
                    className="flex-1 flex-row items-center justify-center gap-1.5 rounded-xl border border-neutral-200 bg-neutral-0 py-3"
                    style={{ opacity: busyId === r.id ? 0.6 : 1 }}
                  >
                    <X size={16} color="#c81e1e" />
                    <Text className="text-base font-semibold text-danger-500">
                      {t("visitor.deny")}
                    </Text>
                  </Pressable>
                </View>
              </SurfaceCard>
            ))}
          </View>
        )}

        {decided.length > 0 ? (
          <View className="mt-6 gap-2">
            <Text className="text-xs font-bold uppercase tracking-wide text-neutral-400">
              {t("visitor.recent")}
            </Text>
            {decided.map((r) => (
              <SurfaceCard key={r.id} className="flex-row items-center justify-between gap-3 py-3">
                <View className="flex-1">
                  <Text className="text-base font-semibold text-neutral-900" numberOfLines={1}>
                    {r.visitor_name}
                  </Text>
                  {r.purpose ? <Text className="text-sm text-neutral-600">{r.purpose}</Text> : null}
                </View>
                <StatusPill tone={DECIDED_TONE[r.status] ?? "neutral"}>
                  {decidedLabel(t, r.status)}
                </StatusPill>
              </SurfaceCard>
            ))}
          </View>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}
