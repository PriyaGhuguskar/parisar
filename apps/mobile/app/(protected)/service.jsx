// apps/mobile/app/(protected)/service.jsx
// Shown when Parisar has paused service for the user's society or blocked it —
// the mobile port of apps/web/components/society/ServiceStatusScreen.jsx. Shows
// the admin's reason and a way to sign out; nothing else is reachable (the
// database also stops serving the society's data — migration 050).
//
// JavaScript only — no TypeScript per CLAUDE.md.

import { Ban, PauseCircle } from "lucide-react-native";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { ActivityIndicator, ScrollView, Text, View } from "react-native";
import { AuthShell } from "../../components/auth/AuthShell";
import { LogoutButton } from "../../components/LogoutButton";
import { getSupabase } from "../../lib/supabase";

export default function ServiceStatusScreen() {
  const { t, i18n } = useTranslation("auth");
  const [info, setInfo] = useState(null);

  useEffect(() => {
    getSupabase()
      .rpc("my_society_service_status")
      .then(({ data }) => setInfo(data ?? {}));
  }, []);

  if (!info) {
    return (
      <AuthShell>
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator color="#12715A" />
        </View>
      </AuthShell>
    );
  }

  const blocked = info.status === "blocked";
  const Icon = blocked ? Ban : PauseCircle;
  const society = info.society_name ?? "";
  const since = info.changed_at
    ? new Date(info.changed_at).toLocaleDateString(i18n.language, {
        day: "numeric",
        month: "long",
        year: "numeric",
      })
    : null;

  return (
    <AuthShell>
      <ScrollView contentContainerClassName="flex-grow justify-center py-10">
        <View className="items-center gap-3 rounded-2xl border border-neutral-200 bg-neutral-0 p-6">
          <View
            className="h-14 w-14 items-center justify-center rounded-2xl"
            style={{ backgroundColor: blocked ? "#FCE9E6" : "#FDF0DF" }}
          >
            <Icon size={28} color={blocked ? "#94291A" : "#8A4708"} />
          </View>
          <Text className="text-center text-xl font-semibold text-neutral-900">
            {blocked ? t("service.blockedTitle") : t("service.pausedTitle")}
          </Text>
          <Text className="text-center text-base text-neutral-600">
            {blocked ? t("service.blockedBody", { society }) : t("service.pausedBody", { society })}
          </Text>

          {info.reason ? (
            <View className="mt-2 w-full gap-1 rounded-xl bg-neutral-50 px-4 py-3">
              <Text className="text-xs font-semibold uppercase tracking-wide text-neutral-400">
                {t("service.reasonLabel")}
              </Text>
              <Text className="text-base text-neutral-900">{info.reason}</Text>
              {since ? (
                <Text className="text-xs text-neutral-400">
                  {t("service.since", { date: since })}
                </Text>
              ) : null}
            </View>
          ) : null}

          <Text className="mt-2 text-center text-sm text-neutral-600">{t("service.help")}</Text>
          <LogoutButton />
        </View>
      </ScrollView>
    </AuthShell>
  );
}
