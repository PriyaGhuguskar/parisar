// /(protected)/(tabs)/settings/grievance-officer — admin Grievance Officer settings (COMM-05, D-06).
//
// Per 06-UI-SPEC.md Screen 9a: admin-only (secretary / co_secretary). Loads the current
// officer via getGrievanceOfficer (COALESCEs to the Secretary; is_default flags unset), then
// renders GrievanceOfficerForm. The set_grievance_officer RPC is admin-gated server-side.
//
// JavaScript only — no TypeScript per CLAUDE.md.

import { getGrievanceOfficer, setGrievanceOfficer } from "@parisar/api-client";
import { useRouter } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { ActivityIndicator, Pressable, ScrollView, Text, View } from "react-native";
import { GrievanceOfficerForm } from "../../../../components/community/GrievanceOfficerForm";
import { useAuthStore } from "../../../../lib/auth-store";
import { getSupabase } from "../../../../lib/supabase";

const ADMIN_ROLES = new Set(["co_secretary", "secretary"]);

export default function GrievanceOfficerSettingsScreen() {
  const router = useRouter();
  const { t } = useTranslation(["moderation", "community"]);
  const session = useAuthStore((s) => s.session);

  const jwtMeta = session?.user?.app_metadata ?? session?.user?.user_metadata ?? {};
  const role = jwtMeta.role ?? "member";
  const isAdmin = ADMIN_ROLES.has(role);

  const [officer, setOfficer] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!isAdmin) {
      setLoading(false);
      return;
    }
    try {
      const data = await getGrievanceOfficer(getSupabase());
      setOfficer(data ?? null);
    } catch (err) {
      console.warn("[settings/grievance-officer] load failed:", err?.message ?? err);
      setOfficer(null);
    } finally {
      setLoading(false);
    }
  }, [isAdmin]);

  useEffect(() => {
    load();
  }, [load]);

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
        <Text className="text-xl font-semibold text-neutral-900 flex-1">
          {t("moderation:grievance.settingsTitle")}
        </Text>
      </View>

      {!isAdmin ? (
        <View className="flex-1 items-center justify-center px-8">
          <Text className="text-base text-neutral-600 text-center">
            {t("community:community.loadError")}
          </Text>
        </View>
      ) : loading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" color="#12715A" />
        </View>
      ) : (
        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 96 }}>
          <GrievanceOfficerForm
            supabase={getSupabase()}
            initialName={officer?.is_default ? "" : (officer?.name ?? "")}
            initialContact={officer?.is_default ? "" : (officer?.contact ?? "")}
            isDefault={!!officer?.is_default}
            onSubmit={setGrievanceOfficer}
            onSaved={() => router.back()}
          />
        </ScrollView>
      )}
    </View>
  );
}
