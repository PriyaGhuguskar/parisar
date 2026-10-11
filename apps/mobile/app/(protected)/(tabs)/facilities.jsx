// apps/mobile/app/(protected)/(tabs)/facilities.jsx
// Facility calendar — water shutdowns, lift maintenance, society events…;
// mobile port of apps/web/components/facilities/FacilityCalendar.jsx.
// Everyone sees Upcoming / Earlier with a category filter; authorities can
// schedule and remove events. Live via realtime on facility_events.
//
// JavaScript only — no TypeScript per CLAUDE.md.

import { addFacilityEvent, deleteFacilityEvent } from "@parisar/api-client";
import DateTimePicker from "@react-native-community/datetimepicker";
import { CalendarClock, Plus, Trash2, X } from "lucide-react-native";
import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { FormError } from "../../../components/auth/FormError";
import { EmptyState, PageHeader, SmallButton, SurfaceCard } from "../../../components/kit";
import { Field, TextField } from "../../../components/onboarding/Form";
import { getSupabase } from "../../../lib/supabase";
import { useMyContext } from "../../../lib/use-my-context";

const FCATS = [
  "water_shutdown",
  "lift_maintenance",
  "society_event",
  "garbage_collection",
  "other",
];

function fmt(iso, lng) {
  try {
    return new Date(iso).toLocaleString(lng, {
      weekday: "short",
      day: "numeric",
      month: "short",
      hour: "numeric",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

function Chip({ label, on, onPress }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: on }}
      className={`rounded-full border px-3 py-1.5 ${
        on ? "border-brand-600 bg-brand-600" : "border-neutral-200 bg-neutral-0"
      }`}
    >
      <Text className={`text-sm font-semibold ${on ? "text-neutral-0" : "text-neutral-600"}`}>
        {label}
      </Text>
    </Pressable>
  );
}

function AddEventSheet({ visible, societyId, onClose, onAdded }) {
  const { t, i18n } = useTranslation("auth");
  const [category, setCategory] = useState("water_shutdown");
  const [title, setTitle] = useState("");
  const [note, setNote] = useState("");
  const [when, setWhen] = useState(null); // Date
  const [picker, setPicker] = useState(null); // "date" | "time" | null
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (visible) {
      setCategory("water_shutdown");
      setTitle("");
      setNote("");
      setWhen(null);
      setError(null);
    }
  }, [visible]);

  // Android can't pick date+time in one dialog: date first, then time.
  function onPicked(event, value) {
    const step = picker;
    setPicker(null);
    if (event?.type === "dismissed" || !value) return;
    if (step === "date") {
      const base = when ?? new Date();
      const d = new Date(value);
      d.setHours(base.getHours(), base.getMinutes(), 0, 0);
      setWhen(d);
      setPicker("time");
    } else {
      const d = new Date(when ?? value);
      d.setHours(value.getHours(), value.getMinutes(), 0, 0);
      setWhen(d);
    }
  }

  async function submit() {
    setError(null);
    if (!title.trim()) return setError(t("facility.titleRequired"));
    if (!when) return setError(t("facility.timeRequired"));
    setSaving(true);
    try {
      const res = await addFacilityEvent(getSupabase(), {
        societyId,
        category,
        title: title.trim(),
        note: note.trim(),
        startsAt: when.toISOString(),
      });
      if (res?.error) {
        setError(t("facility.saveError"));
        return;
      }
      onAdded();
      onClose();
    } catch {
      setError(t("facility.saveError"));
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
        <ScrollView
          className="max-h-[90%] rounded-t-3xl bg-neutral-0"
          contentContainerClassName="gap-4 p-5"
          keyboardShouldPersistTaps="handled"
        >
          <View className="flex-row items-center justify-between">
            <Text className="text-xl font-semibold text-neutral-900">{t("facility.add")}</Text>
            <Pressable onPress={onClose} accessibilityRole="button" className="p-1">
              <X size={20} color="#64748B" />
            </Pressable>
          </View>
          <Field label={t("facility.category")}>
            <View className="flex-row flex-wrap gap-2">
              {FCATS.map((c) => (
                <Chip
                  key={c}
                  label={t(`facility.${c}`)}
                  on={category === c}
                  onPress={() => setCategory(c)}
                />
              ))}
            </View>
          </Field>
          <Field label={t("facility.eventTitle")}>
            <TextField
              value={title}
              onChangeText={setTitle}
              placeholder={t("facility.eventTitlePh")}
              maxLength={80}
            />
          </Field>
          <Field label={t("facility.when")}>
            <Pressable
              onPress={() => setPicker("date")}
              accessibilityRole="button"
              className="h-12 flex-row items-center gap-2 rounded-lg border border-neutral-200 bg-neutral-0 px-3"
            >
              <CalendarClock size={16} color="#475569" />
              <Text className={`text-base ${when ? "text-neutral-900" : "text-neutral-400"}`}>
                {when ? fmt(when.toISOString(), i18n.language) : t("facility.when")}
              </Text>
            </Pressable>
          </Field>
          {picker ? (
            <DateTimePicker
              value={when ?? new Date()}
              mode={picker}
              minimumDate={picker === "date" ? new Date() : undefined}
              onChange={onPicked}
            />
          ) : null}
          <Field label={t("facility.note")}>
            <TextField value={note} onChangeText={setNote} maxLength={120} />
          </Field>
          <FormError message={error} />
          <View className="flex-row justify-end gap-2.5 pb-4">
            <SmallButton tone="outline" label={t("profile.cancel")} onPress={onClose} />
            <SmallButton
              label={saving ? t("facility.saving") : t("facility.save")}
              onPress={submit}
              disabled={saving}
            />
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </Modal>
  );
}

export default function FacilitiesScreen() {
  const { t, i18n } = useTranslation(["auth", "dashboard"]);
  const me = useMyContext();
  const societyId = me.societyId;
  const canManage = me.isAuthority;
  const [events, setEvents] = useState([]);
  const [filter, setFilter] = useState("all");
  const [adding, setAdding] = useState(false);

  const load = useCallback(async () => {
    if (!societyId) return;
    const { data } = await getSupabase()
      .from("facility_events")
      .select("id, category, title, note, starts_at")
      .eq("society_id", societyId)
      .order("starts_at", { ascending: true });
    setEvents(Array.isArray(data) ? data : []);
  }, [societyId]);

  useEffect(() => {
    if (!societyId) return undefined;
    load();
    const supabase = getSupabase();
    const channel = supabase
      .channel(`facilities-${Math.random().toString(36).slice(2)}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "facility_events" }, () =>
        load(),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [societyId, load]);

  function remove(id) {
    Alert.alert(t("facility.remove"), "", [
      { text: t("profile.cancel"), style: "cancel" },
      {
        text: t("facility.remove"),
        style: "destructive",
        onPress: async () => {
          await deleteFacilityEvent(getSupabase(), id);
          await load();
        },
      },
    ]);
  }

  const now = Date.now();
  const filtered = filter === "all" ? events : events.filter((e) => e.category === filter);
  const upcoming = filtered.filter((e) => new Date(e.starts_at).getTime() >= now);
  const past = filtered.filter((e) => new Date(e.starts_at).getTime() < now).reverse();

  const Row = ({ e }) => (
    <SurfaceCard className="flex-row items-start gap-3">
      <View className="flex-1 gap-1">
        <View className="self-start rounded-full bg-brand-50 px-2 py-0.5">
          <Text className="text-xs font-semibold text-brand-700">
            {t(`facility.${e.category}`)}
          </Text>
        </View>
        <Text className="text-base font-semibold text-neutral-900">{e.title}</Text>
        <Text className="text-sm text-neutral-600">{fmt(e.starts_at, i18n.language)}</Text>
        {e.note ? <Text className="text-sm text-neutral-600">{e.note}</Text> : null}
      </View>
      {canManage ? (
        <Pressable
          onPress={() => remove(e.id)}
          accessibilityRole="button"
          accessibilityLabel={t("facility.remove")}
          className="p-1.5"
        >
          <Trash2 size={17} color="#c81e1e" />
        </Pressable>
      ) : null}
    </SurfaceCard>
  );

  return (
    <SafeAreaView className="flex-1 bg-neutral-50" edges={["top"]}>
      <ScrollView contentContainerClassName="px-5 pt-4 pb-10">
        <PageHeader
          backLabel={t("dashboard:nav.home")}
          backHref="/(protected)/(tabs)"
          title={t("facility.title")}
          description={t("facility.lead")}
        />
        {canManage ? (
          <View className="flex-row pb-4">
            <SmallButton icon={Plus} label={t("facility.add")} onPress={() => setAdding(true)} />
          </View>
        ) : null}

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerClassName="gap-2 pb-4"
        >
          {["all", ...FCATS].map((c) => (
            <Chip
              key={c}
              label={c === "all" ? t("facility.filterAll") : t(`facility.${c}`)}
              on={filter === c}
              onPress={() => setFilter(c)}
            />
          ))}
        </ScrollView>

        {upcoming.length === 0 && past.length === 0 ? (
          <EmptyState
            icon={CalendarClock}
            title={t("facility.empty")}
            action={
              canManage ? (
                <SmallButton
                  icon={Plus}
                  label={t("facility.addFirst")}
                  onPress={() => setAdding(true)}
                />
              ) : null
            }
          />
        ) : (
          <View className="gap-5">
            {upcoming.length ? (
              <View className="gap-2">
                <Text className="text-xs font-bold uppercase tracking-wide text-neutral-400">
                  {t("facility.upcoming")}
                </Text>
                {upcoming.map((e) => (
                  <Row key={e.id} e={e} />
                ))}
              </View>
            ) : null}
            {past.length ? (
              <View className="gap-2">
                <Text className="text-xs font-bold uppercase tracking-wide text-neutral-400">
                  {t("facility.past")}
                </Text>
                {past.map((e) => (
                  <Row key={e.id} e={e} />
                ))}
              </View>
            ) : null}
          </View>
        )}
      </ScrollView>
      {canManage ? (
        <AddEventSheet
          visible={adding}
          societyId={societyId}
          onClose={() => setAdding(false)}
          onAdded={load}
        />
      ) : null}
    </SafeAreaView>
  );
}
