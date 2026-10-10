// apps/mobile/app/(protected)/(tabs)/visitors.jsx
// Visitors — the resident's gate inbox; mobile port of apps/web/components/
// visitors/VisitorInbox.jsx. The guard asks at the gate; the resident approves
// or denies here. Live via realtime on visitor_requests (RLS: own flat only).
//
// JavaScript only — no TypeScript per CLAUDE.md.

import { residentDecideVisit } from "@parisar/api-client";
import { Check, DoorOpen, X } from "lucide-react-native";
import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Pressable, RefreshControl, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { EmptyState, PageHeader, StatusPill, SurfaceCard } from "../../../components/kit";
import { getSupabase } from "../../../lib/supabase";

const DECIDED_TONE = { approved: "done", denied: "danger", cancelled: "neutral" };

export default function VisitorsScreen() {
  const { t } = useTranslation(["auth", "dashboard"]);
  const [requests, setRequests] = useState([]);
  const [busyId, setBusyId] = useState(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    const { data } = await getSupabase()
      .from("visitor_requests")
      .select("id, visitor_name, visitor_phone, purpose, status, created_at")
      .order("created_at", { ascending: false })
      .limit(40);
    setRequests(Array.isArray(data) ? data : []);
  }, []);

  useEffect(() => {
    load();
    const supabase = getSupabase();
    const channel = supabase
      .channel(`resident-visits-${Math.random().toString(36).slice(2)}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "visitor_requests" }, () =>
        load(),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [load]);

  async function decide(id, approve) {
    setBusyId(id);
    try {
      await residentDecideVisit(getSupabase(), { requestId: id, approve });
      await load();
    } finally {
      setBusyId(null);
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
        {pending.length === 0 ? (
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
                  {r.status === "approved"
                    ? t("visitor.statusApproved")
                    : t("visitor.statusDenied")}
                </StatusPill>
              </SurfaceCard>
            ))}
          </View>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}
