// /(protected)/(tabs)/about — About & Help (COMM-05, all roles).
//
// Per 06-UI-SPEC.md Screen 9b: surfaces the Grievance Officer read-only (IT Rules 2021
// named-officer obligation). getGrievanceOfficer COALESCEs to the Secretary when unset
// (is_default), so a named officer is always shown. Below it, minimal app/version info.
//
// All roles reach this from the ProfileMenu "About & Help" row.
//
// JavaScript only — no TypeScript per CLAUDE.md.

import { getGrievanceOfficer } from "@parisar/api-client";
import Constants from "expo-constants";
import { useRouter } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { ActivityIndicator, Pressable, ScrollView, Text, View } from "react-native";
import { GrievanceOfficerCard } from "../../../../components/community/GrievanceOfficerCard";
import { getSupabase } from "../../../../lib/supabase";

export default function AboutScreen() {
  const router = useRouter();
  const { t } = useTranslation("moderation");

  const [officer, setOfficer] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const data = await getGrievanceOfficer(getSupabase());
      setOfficer(data ?? null);
    } catch (err) {
      console.warn("[about] load failed:", err?.message ?? err);
      setOfficer(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const appVersion = Constants.expoConfig?.version ?? "0.0.0";

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
        <Text className="text-xl font-semibold text-neutral-900 flex-1">{t("about.title")}</Text>
      </View>

      <ScrollView contentContainerStyle={{ padding: 16, gap: 16, paddingBottom: 48 }}>
        {/* Grievance Officer (read-only, defaults to Secretary) */}
        {loading ? (
          <View className="items-center justify-center py-8">
            <ActivityIndicator size="large" color="#12715A" />
          </View>
        ) : (
          <GrievanceOfficerCard officer={officer} />
        )}

        {/* Minimal app / version info */}
        <View className="bg-white rounded-xl p-6 gap-1">
          <Text className="text-xl font-semibold text-neutral-900">Parisar</Text>
          <Text className="text-sm text-neutral-600">{`Version ${appVersion}`}</Text>
        </View>
      </ScrollView>
    </View>
  );
}
