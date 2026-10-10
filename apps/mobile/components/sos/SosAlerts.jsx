// apps/mobile/components/sos/SosAlerts.jsx
// Live banners for active emergency alerts the caller may see — the mobile port
// of apps/web/components/sos/SosAlerts.jsx. RLS scopes visibility by audience
// and role, so this just selects (last 2 hours, unresolved) and subscribes.
// Shown on the home dashboard and on the guard screen.
//
// JavaScript only — no TypeScript per CLAUDE.md.

import { resolveSos } from "@parisar/api-client";
import { Check, Siren } from "lucide-react-native";
import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Pressable, Text, View } from "react-native";
import { getSupabase } from "../../lib/supabase";

function fmtTime(iso, lng) {
  try {
    return new Date(iso).toLocaleTimeString(lng, { hour: "numeric", minute: "2-digit" });
  } catch {
    return "";
  }
}

export function SosAlerts() {
  const { t, i18n } = useTranslation("auth");
  const [alerts, setAlerts] = useState([]);

  const load = useCallback(async () => {
    const cutoff = new Date(Date.now() - 2 * 3600 * 1000).toISOString();
    const { data } = await getSupabase()
      .from("sos_alerts")
      .select("id, description, audience, raised_by_name, raised_by_flat, created_at")
      .is("resolved_at", null)
      .gte("created_at", cutoff)
      .order("created_at", { ascending: false });
    setAlerts(Array.isArray(data) ? data : []);
  }, []);

  useEffect(() => {
    load();
    const supabase = getSupabase();
    const channel = supabase
      .channel(`sos-alerts-${Math.random().toString(36).slice(2)}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "sos_alerts" }, () => load())
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [load]);

  async function dismiss(id) {
    await resolveSos(getSupabase(), id);
    await load();
  }

  if (alerts.length === 0) return null;

  return (
    <View className="mb-4 gap-2">
      {alerts.map((a) => {
        const who = [a.raised_by_name, a.raised_by_flat].filter(Boolean).join(" · ");
        return (
          <View
            key={a.id}
            accessibilityRole="alert"
            className="flex-row items-start gap-3 rounded-2xl p-4"
            style={{ backgroundColor: "#FCE9E6", borderWidth: 1, borderColor: "#EFB3A8" }}
          >
            <View className="h-9 w-9 items-center justify-center rounded-xl bg-danger-500">
              <Siren size={18} color="#fff" />
            </View>
            <View className="flex-1">
              <Text className="text-xs font-bold uppercase tracking-wide text-danger-500">
                {t("sos.bannerTitle")} · {fmtTime(a.created_at, i18n.language)}
              </Text>
              <Text className="mt-0.5 text-base font-semibold text-neutral-900">
                {a.description}
              </Text>
              {who ? (
                <Text className="mt-0.5 text-sm text-neutral-600">
                  {t("sos.raisedBy", { who })}
                </Text>
              ) : null}
            </View>
            <Pressable
              onPress={() => dismiss(a.id)}
              accessibilityRole="button"
              className="flex-row items-center gap-1 rounded-lg bg-neutral-0 px-2.5 py-1.5"
            >
              <Check size={13} color="#c81e1e" />
              <Text className="text-xs font-bold text-danger-500">{t("sos.resolve")}</Text>
            </Pressable>
          </View>
        );
      })}
    </View>
  );
}
