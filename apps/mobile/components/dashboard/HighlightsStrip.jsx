// apps/mobile/components/dashboard/HighlightsStrip.jsx
// "Home highlights" — the mobile port of apps/web/components/dashboard/
// HighlightsStrip.jsx. Up to 4 short pinned notes (water timing, gate rules…)
// plus the next upcoming facility event, on soft tinted cards. Authorities can
// add / edit / remove them (secretary_set_highlights). Live via realtime.
//
// JavaScript only — no TypeScript per CLAUDE.md.

import { setHighlights } from "@parisar/api-client";
import { useRouter } from "expo-router";
import { CalendarClock, Pin, Plus, Trash2, X } from "lucide-react-native";
import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import { getSupabase } from "../../lib/supabase";
import { AUTHORITY_ROLES } from "../../lib/use-my-context";

const MAX = 4;

// Same tones as the website — a different soft tint per card.
const TONES = [
  { bg: "#ECFDF5", border: "#A7F3D0", fg: "#047857" },
  { bg: "#EFF6FF", border: "#BFDBFE", fg: "#1D4ED8" },
  { bg: "#FFFBEB", border: "#FDE68A", fg: "#B45309" },
  { bg: "#F5F3FF", border: "#DDD6FE", fg: "#6D28D9" },
];

function fmtEvent(iso, lng) {
  try {
    return new Date(iso).toLocaleString(lng, {
      weekday: "short",
      day: "numeric",
      month: "short",
      hour: "numeric",
      minute: "2-digit",
    });
  } catch {
    return "";
  }
}

const FIELD =
  "h-11 rounded-lg border border-neutral-200 bg-neutral-0 px-3 text-base text-neutral-900";

function Manager({ visible, societyId, initial, onClose, onSaved }) {
  const { t } = useTranslation("auth");
  const [items, setItems] = useState([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (visible) {
      setItems(initial.length ? initial.map((h) => ({ title: h.title, body: h.body })) : []);
      setError(null);
    }
  }, [visible, initial]);

  const setAt = (i, patch) =>
    setItems((xs) => xs.map((x, idx) => (idx === i ? { ...x, ...patch } : x)));

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const clean = items
        .map((x) => ({ title: x.title.trim(), body: x.body.trim() }))
        .filter((x) => x.title && x.body);
      const res = await setHighlights(getSupabase(), { societyId, items: clean });
      if (res?.error) {
        setError(res.error === "TOO_MANY" ? t("highlights.max") : t("highlights.saveError"));
        return;
      }
      onSaved();
      onClose();
    } catch {
      setError(t("highlights.saveError"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        className="flex-1 justify-end bg-black/40"
      >
        <View className="max-h-[90%] rounded-t-3xl bg-neutral-0">
          <View className="flex-row items-start justify-between gap-3 p-5 pb-3">
            <View className="flex-1 gap-1">
              <Text className="text-xl font-semibold text-neutral-900">
                {t("highlights.manageTitle")}
              </Text>
              <Text className="text-sm text-neutral-600">{t("highlights.manageLead")}</Text>
            </View>
            <Pressable onPress={onClose} accessibilityRole="button" className="p-1">
              <X size={20} color="#64748B" />
            </Pressable>
          </View>
          <ScrollView contentContainerClassName="gap-3 px-5" keyboardShouldPersistTaps="handled">
            {items.map((x, i) => (
              <View
                // biome-ignore lint/suspicious/noArrayIndexKey: positional rows
                key={i}
                className="gap-2 rounded-xl border border-neutral-200 bg-neutral-50 p-3"
              >
                <View className="flex-row items-center justify-between">
                  <Text className="text-xs font-bold uppercase tracking-wide text-neutral-400">
                    #{i + 1}
                  </Text>
                  <Pressable
                    onPress={() => setItems((xs) => xs.filter((_, idx) => idx !== i))}
                    accessibilityRole="button"
                    accessibilityLabel={t("highlights.remove")}
                    className="p-1"
                  >
                    <Trash2 size={16} color="#c81e1e" />
                  </Pressable>
                </View>
                <TextInput
                  className={FIELD}
                  value={x.title}
                  maxLength={40}
                  placeholder={t("highlights.cardTitlePh")}
                  placeholderTextColor="#94A3B8"
                  onChangeText={(v) => setAt(i, { title: v })}
                />
                <TextInput
                  className={FIELD}
                  value={x.body}
                  maxLength={80}
                  placeholder={t("highlights.cardBodyPh")}
                  placeholderTextColor="#94A3B8"
                  onChangeText={(v) => setAt(i, { body: v })}
                />
              </View>
            ))}
            {items.length < MAX ? (
              <Pressable
                onPress={() => setItems((xs) => [...xs, { title: "", body: "" }])}
                className="flex-row items-center justify-center gap-1.5 rounded-xl border border-dashed border-brand-500 py-2.5"
              >
                <Plus size={16} color="#0E5A48" />
                <Text className="text-sm font-semibold text-brand-600">{t("highlights.add")}</Text>
              </Pressable>
            ) : (
              <Text className="text-center text-xs text-neutral-400">{t("highlights.max")}</Text>
            )}
          </ScrollView>
          <View className="gap-2 border-t border-neutral-100 p-5 pt-4">
            {error ? <Text className="text-sm font-semibold text-danger-500">{error}</Text> : null}
            <View className="flex-row justify-end gap-2.5">
              <Pressable onPress={onClose} disabled={saving} className="rounded-xl px-4 py-2.5">
                <Text className="text-sm font-semibold text-neutral-600">
                  {t("profile.cancel")}
                </Text>
              </Pressable>
              <Pressable
                onPress={save}
                disabled={saving}
                className="rounded-xl bg-brand-600 px-5 py-2.5"
                style={{ opacity: saving ? 0.6 : 1 }}
              >
                <Text className="text-sm font-bold text-neutral-0">
                  {saving ? t("highlights.saving") : t("highlights.save")}
                </Text>
              </Pressable>
            </View>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

export function HighlightsStrip({ societyId, role }) {
  const { t, i18n } = useTranslation("auth");
  const router = useRouter();
  const [highlights, setList] = useState([]);
  const [nextEvent, setNextEvent] = useState(null);
  const [managing, setManaging] = useState(false);
  const canManage = AUTHORITY_ROLES.has(role);

  const load = useCallback(async () => {
    if (!societyId) return;
    const supabase = getSupabase();
    const [{ data: hs }, { data: ev }] = await Promise.all([
      supabase
        .from("society_highlights")
        .select("id, title, body, position")
        .eq("society_id", societyId)
        .order("position", { ascending: true }),
      supabase
        .from("facility_events")
        .select("id, category, title, starts_at")
        .eq("society_id", societyId)
        .gte("starts_at", new Date().toISOString())
        .order("starts_at", { ascending: true })
        .limit(1),
    ]);
    setList(Array.isArray(hs) ? hs : []);
    setNextEvent(Array.isArray(ev) && ev.length ? ev[0] : null);
  }, [societyId]);

  useEffect(() => {
    if (!societyId) return undefined;
    load();
    const supabase = getSupabase();
    const channel = supabase
      .channel(`highlights-${Math.random().toString(36).slice(2)}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "society_highlights" }, () =>
        load(),
      )
      .on("postgres_changes", { event: "*", schema: "public", table: "facility_events" }, () =>
        load(),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [societyId, load]);

  if (highlights.length === 0 && !nextEvent && !canManage) return null;

  return (
    <View className="mb-5">
      <View className="mb-2 flex-row items-center justify-between">
        <View className="flex-row items-center gap-1.5">
          <Pin size={13} color="#475569" />
          <Text className="text-xs font-semibold uppercase tracking-wide text-neutral-600">
            {t("highlights.manageTitle")}
          </Text>
        </View>
        {canManage && highlights.length > 0 ? (
          <Pressable onPress={() => setManaging(true)} accessibilityRole="button">
            <Text className="text-sm font-semibold text-brand-600">{t("highlights.edit")}</Text>
          </Pressable>
        ) : null}
      </View>

      {highlights.length || nextEvent ? (
        <View className="gap-2.5">
          {nextEvent ? (
            <Pressable
              onPress={() => router.push("/(protected)/(tabs)/facilities")}
              className="rounded-xl border px-4 py-3"
              style={{ backgroundColor: "#FFF7ED", borderColor: "#FED7AA" }}
            >
              <View className="flex-row items-center gap-1">
                <CalendarClock size={12} color="#C2410C" />
                <Text className="text-xs font-semibold uppercase tracking-wide text-[#C2410C]">
                  {t(`facility.${nextEvent.category}`)}
                </Text>
              </View>
              <Text className="mt-0.5 text-base font-semibold text-neutral-900">
                {nextEvent.title}
              </Text>
              <Text className="text-xs text-neutral-600">
                {fmtEvent(nextEvent.starts_at, i18n.language)}
              </Text>
            </Pressable>
          ) : null}
          {highlights.map((h, i) => {
            const tone = TONES[i % TONES.length];
            return (
              <View
                key={h.id}
                className="rounded-xl border px-4 py-3"
                style={{ backgroundColor: tone.bg, borderColor: tone.border }}
              >
                <Text
                  className="text-xs font-semibold uppercase tracking-wide"
                  style={{ color: tone.fg }}
                >
                  {h.title}
                </Text>
                <Text className="mt-0.5 text-base font-semibold text-neutral-900">{h.body}</Text>
              </View>
            );
          })}
        </View>
      ) : (
        <Pressable
          onPress={() => setManaging(true)}
          className="flex-row items-center justify-center gap-1.5 rounded-xl border border-dashed border-neutral-200 py-4"
        >
          <Plus size={16} color="#0E5A48" />
          <Text className="text-sm font-semibold text-brand-600">{t("highlights.addFirst")}</Text>
        </Pressable>
      )}

      {canManage ? (
        <Manager
          visible={managing}
          societyId={societyId}
          initial={highlights}
          onClose={() => setManaging(false)}
          onSaved={load}
        />
      ) : null}
    </View>
  );
}
