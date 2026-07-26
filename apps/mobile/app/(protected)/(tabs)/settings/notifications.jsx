// /(protected)/(tabs)/settings/notifications — Notification Settings (D-01..D-06).
//
// Per 05-UI-SPEC.md Screen 7:
//   - On mount: ensureNotificationPreferences(societyId) (D-05 idempotent UPSERT) +
//     getNotificationPreferences (effective VIEW, D-06) so the D-04 defaults render
//     instantly even with no saved row (no blank state).
//   - Section 1 Mute (NOTF-05): 5 PreferenceToggleRow (complaints/polls/community/
//     fines/general → mute_* columns). Inverted (DD-11): switch ON = NOT muted. Each
//     toggle writes a debounced (400ms) updateNotificationPreference; optimistic with
//     revert on error (DD-7). allMuted info banner when all 5 muted.
//   - Section 2 Quiet hours (NOTF-06): QuietHoursRow → debounced { quiet_start, quiet_end }.
//   - Section 3 Daily limit (NOTF-07): a stepper → debounced { cap_per_day }.
//   - Subtle "Saved" inline confirm after a write.
//
// JavaScript only — no TypeScript per CLAUDE.md.

import {
  ensureNotificationPreferences,
  getNotificationPreferences,
  updateNotificationPreference,
} from "@parisar/api-client";
import { useRouter } from "expo-router";
import {
  AlertCircle,
  BarChart3,
  Bell,
  Check,
  Info,
  MessageSquareWarning,
  Minus,
  Plus,
  Users2,
} from "lucide-react-native";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { ActivityIndicator, Pressable, ScrollView, Text, View } from "react-native";
import { PreferenceToggleRow } from "../../../../components/settings/PreferenceToggleRow";
import { QuietHoursRow } from "../../../../components/settings/QuietHoursRow";
import { useAuthStore } from "../../../../lib/auth-store";
import { getSupabase } from "../../../../lib/supabase";

const DEBOUNCE_MS = 400;
const CAP_MIN = 1;
const CAP_MAX = 99;

const MUTE_CATEGORIES = [
  { column: "mute_complaints", labelKey: "complaints", icon: MessageSquareWarning },
  { column: "mute_polls", labelKey: "polls", icon: BarChart3 },
  { column: "mute_community", labelKey: "community", icon: Users2 },
  { column: "mute_fines", labelKey: "fines", icon: AlertCircle },
  { column: "mute_general", labelKey: "general", icon: Bell },
];

export default function NotificationSettingsScreen() {
  const router = useRouter();
  const { t } = useTranslation("preferences");
  const session = useAuthStore((s) => s.session);
  const jwtMeta = session?.user?.app_metadata ?? session?.user?.user_metadata ?? {};
  const societyId = jwtMeta.society_id ?? null;
  const userId = session?.user?.id ?? null;

  const [prefs, setPrefs] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState(false);

  // Per-key debounce timers.
  const timersRef = useRef({});

  // Mount: ensure row (D-05) then read the effective VIEW (D-06).
  useEffect(() => {
    if (!societyId || !userId) return;
    let cancelled = false;
    (async () => {
      const supabase = getSupabase();
      try {
        await ensureNotificationPreferences(supabase, societyId);
      } catch (err) {
        console.warn("[settings/notifications] ensure failed:", err?.message ?? err);
      }
      try {
        const row = await getNotificationPreferences(supabase, societyId, userId);
        if (!cancelled) setPrefs(row);
      } catch (err) {
        console.warn("[settings/notifications] read failed:", err?.message ?? err);
        // Fall back to local D-04 defaults so the screen never blanks.
        if (!cancelled) {
          setPrefs({
            mute_complaints: false,
            mute_polls: false,
            mute_community: false,
            mute_fines: false,
            mute_general: false,
            quiet_start: "22:00",
            quiet_end: "07:00",
            cap_per_day: 20,
          });
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [societyId, userId]);

  function flashSaved() {
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
  }

  // Optimistic write with per-key debounce + revert on error (DD-7).
  function persist(patch) {
    if (!societyId) return;
    const prev = prefs;
    setPrefs((p) => ({ ...p, ...patch }));
    setSaveError(false);

    const key = Object.keys(patch).join(",");
    if (timersRef.current[key]) clearTimeout(timersRef.current[key]);
    timersRef.current[key] = setTimeout(async () => {
      try {
        await updateNotificationPreference(getSupabase(), societyId, patch);
        flashSaved();
      } catch (err) {
        console.warn("[settings/notifications] save failed:", err?.message ?? err);
        setSaveError(true);
        setPrefs(prev); // revert to the last persisted value
      }
    }, DEBOUNCE_MS);
  }

  function normalizeTime(time) {
    return String(time ?? "").slice(0, 5);
  }

  if (loading || !prefs) {
    return (
      <View className="flex-1 bg-neutral-50 items-center justify-center">
        <ActivityIndicator color="#12715A" />
      </View>
    );
  }

  const allMuted = MUTE_CATEGORIES.every((c) => prefs[c.column]);
  const cap = typeof prefs.cap_per_day === "number" ? prefs.cap_per_day : 20;

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
        <Text className="text-xl font-semibold text-neutral-900 flex-1">{t("prefs.title")}</Text>
        {saved ? (
          <View className="flex-row items-center gap-1">
            <Check size={12} color="#047857" />
            <Text className="text-sm" style={{ color: "#047857" }}>
              {t("prefs.saved")}
            </Text>
          </View>
        ) : null}
      </View>

      <ScrollView contentContainerStyle={{ padding: 16, gap: 16, paddingBottom: 48 }}>
        {/* All-muted info banner */}
        {allMuted ? (
          <View
            className="flex-row items-start gap-2 rounded-xl p-3"
            style={{ backgroundColor: "#f5f7ff" }}
            accessibilityRole="alert"
          >
            <Info size={16} color="#12715A" />
            <Text className="text-sm flex-1" style={{ color: "#12715A" }}>
              {t("prefs.allMutedNote")}
            </Text>
          </View>
        ) : null}

        {saveError ? (
          <Text className="text-sm text-danger-500" accessibilityRole="alert">
            {t("prefs.saveError")}
          </Text>
        ) : null}

        {/* Section 1 — Mute by category (NOTF-05) */}
        <View className="bg-white rounded-xl p-4 gap-1 border border-neutral-200">
          <Text className="text-xl font-semibold text-neutral-900">{t("prefs.muteHeading")}</Text>
          <Text className="text-base text-neutral-600 mb-1">{t("prefs.muteSubhead")}</Text>
          {MUTE_CATEGORIES.map((c, idx) => (
            <PreferenceToggleRow
              key={c.column}
              icon={c.icon}
              label={t(`prefs.cat.${c.labelKey}`)}
              muted={!!prefs[c.column]}
              onChangeMuted={(nextMuted) => persist({ [c.column]: nextMuted })}
              isLast={idx === MUTE_CATEGORIES.length - 1}
            />
          ))}
        </View>

        {/* Section 2 — Quiet hours (NOTF-06) */}
        <View className="bg-white rounded-xl p-4 gap-2 border border-neutral-200">
          <Text className="text-xl font-semibold text-neutral-900">{t("prefs.quietHeading")}</Text>
          <Text className="text-base text-neutral-600">{t("prefs.quietSubhead")}</Text>
          <QuietHoursRow
            start={normalizeTime(prefs.quiet_start)}
            end={normalizeTime(prefs.quiet_end)}
            onChangeStart={(hhmm) => persist({ quiet_start: hhmm })}
            onChangeEnd={(hhmm) => persist({ quiet_end: hhmm })}
          />
        </View>

        {/* Section 3 — Daily limit (NOTF-07) */}
        <View className="bg-white rounded-xl p-4 gap-2 border border-neutral-200">
          <Text className="text-xl font-semibold text-neutral-900">{t("prefs.capHeading")}</Text>
          <Text className="text-base text-neutral-600">{t("prefs.capSubhead")}</Text>
          <View className="flex-row items-center justify-between mt-1">
            <Text className="text-base text-neutral-900">
              {t("prefs.capValue", { n: String(cap) })}
            </Text>
            <View className="flex-row items-center gap-3">
              <Pressable
                onPress={() => persist({ cap_per_day: Math.max(CAP_MIN, cap - 1) })}
                disabled={cap <= CAP_MIN}
                accessibilityRole="button"
                accessibilityLabel="Decrease daily limit"
                accessibilityState={{ disabled: cap <= CAP_MIN }}
                className="w-10 h-10 rounded-full border border-neutral-200 items-center justify-center"
              >
                <Minus size={18} color={cap <= CAP_MIN ? "#6e6e6e" : "#171717"} />
              </Pressable>
              <Text className="text-base font-semibold text-neutral-900 min-w-[24px] text-center">
                {cap}
              </Text>
              <Pressable
                onPress={() => persist({ cap_per_day: Math.min(CAP_MAX, cap + 1) })}
                disabled={cap >= CAP_MAX}
                accessibilityRole="button"
                accessibilityLabel="Increase daily limit"
                accessibilityState={{ disabled: cap >= CAP_MAX }}
                className="w-10 h-10 rounded-full border border-neutral-200 items-center justify-center"
              >
                <Plus size={18} color={cap >= CAP_MAX ? "#6e6e6e" : "#171717"} />
              </Pressable>
            </View>
          </View>
        </View>
      </ScrollView>
    </View>
  );
}
