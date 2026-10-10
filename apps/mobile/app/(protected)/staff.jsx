// apps/mobile/app/(protected)/staff.jsx
// Home for Parisar staff (platform admins / sales) on the phone.
//
// Staff never onboard into a society — on the website they land on /admin.
// The full admin console (create societies, authorities, features, billing,
// stop/block) lives on the website; here staff get a read-only overview of
// every society with its status, and can sign out.
//
// Internal staff tool: English-only, like the website's admin console.
// JavaScript only — no TypeScript per CLAUDE.md.

import { Building2, Users } from "lucide-react-native";
import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, FlatList, RefreshControl, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { LogoutButton } from "../../components/LogoutButton";
import { getSupabase } from "../../lib/supabase";

const STATUS = {
  active: { label: "Active", bg: "#DCEFE6", fg: "#0A4436" },
  paused: { label: "Service stopped", bg: "#FDF0DF", fg: "#8A4708" },
  blocked: { label: "Blocked", bg: "#FCE9E6", fg: "#94291A" },
};

function SocietyRow({ s }) {
  const st = STATUS[s.service_status] ?? STATUS.active;
  return (
    <View className="gap-2 rounded-xl border border-neutral-200 bg-neutral-0 p-4">
      <View className="flex-row items-start justify-between gap-3">
        <View className="flex-1 gap-0.5">
          <Text className="text-base font-semibold text-neutral-900" numberOfLines={1}>
            {s.name}
          </Text>
          <Text className="text-sm text-neutral-600" numberOfLines={1}>
            {[s.city, s.state].filter(Boolean).join(", ") || "—"}
          </Text>
        </View>
        <View className="rounded-full px-2 py-0.5" style={{ backgroundColor: st.bg }}>
          <Text className="text-xs font-semibold" style={{ color: st.fg }}>
            {st.label}
          </Text>
        </View>
      </View>
      <View className="flex-row items-center gap-4">
        <View className="flex-row items-center gap-1">
          <Users size={14} color="#627368" />
          <Text className="text-sm text-neutral-600">
            {Number(s.member_count ?? 0)} residents
            {Number(s.pending_count ?? 0) > 0 ? ` · ${s.pending_count} pending` : ""}
          </Text>
        </View>
        {s.code ? (
          <Text className="text-sm font-semibold tracking-widest text-neutral-900">{s.code}</Text>
        ) : null}
      </View>
      {s.service_reason && s.service_status !== "active" ? (
        <Text className="text-xs text-neutral-600">“{s.service_reason}”</Text>
      ) : null}
    </View>
  );
}

export default function StaffHome() {
  const [societies, setSocieties] = useState(null);
  const [error, setError] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  const [phone, setPhone] = useState("");

  const load = useCallback(async () => {
    const supabase = getSupabase();
    const { data, error: e } = await supabase.rpc("admin_list_societies");
    if (e) {
      setError("Couldn't load societies. Pull down to retry.");
      return;
    }
    setError(null);
    setSocieties(data ?? []);
  }, []);

  useEffect(() => {
    load();
    getSupabase()
      .auth.getUser()
      .then(({ data }) => {
        const p = data?.user?.phone;
        if (p) setPhone(`+91 ${String(p).slice(-10)}`);
      });
  }, [load]);

  async function onRefresh() {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }

  return (
    <SafeAreaView className="flex-1 bg-neutral-50" edges={["top", "bottom"]}>
      <FlatList
        data={societies ?? []}
        keyExtractor={(s) => s.id}
        contentContainerClassName="gap-3 px-6 pb-10"
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        ListHeaderComponent={
          <View className="gap-4 pt-8 pb-2">
            <View className="flex-row items-center gap-3">
              <View className="h-10 w-10 items-center justify-center rounded-xl bg-brand-50">
                <Building2 size={20} color="#0E5A48" />
              </View>
              <View className="flex-1">
                <Text className="text-xl font-semibold text-brand-700">Parisar admin</Text>
                {phone ? <Text className="text-sm text-neutral-600">{phone}</Text> : null}
              </View>
            </View>
            <View className="rounded-xl border border-neutral-200 bg-neutral-0 p-4">
              <Text className="text-sm text-neutral-600">
                To add a society, its authorities, features or billing, use the admin console on the
                Parisar website. This screen is a read-only overview.
              </Text>
            </View>
            <Text className="text-sm font-semibold uppercase tracking-wide text-neutral-600">
              Societies{societies ? ` (${societies.length})` : ""}
            </Text>
            {error ? <Text className="text-sm text-danger-500">{error}</Text> : null}
            {!societies && !error ? <ActivityIndicator color="#12715A" /> : null}
          </View>
        }
        renderItem={({ item }) => <SocietyRow s={item} />}
        ListEmptyComponent={
          societies ? (
            <Text className="py-6 text-center text-sm text-neutral-600">
              No societies yet. Add the first one from the website's admin console.
            </Text>
          ) : null
        }
        ListFooterComponent={
          <View className="items-center pt-6">
            <LogoutButton />
          </View>
        }
      />
    </SafeAreaView>
  );
}
