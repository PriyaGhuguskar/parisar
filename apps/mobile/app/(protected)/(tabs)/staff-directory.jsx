// apps/mobile/app/(protected)/(tabs)/staff-directory.jsx
// Staff directory — shared contacts for local help (maid, driver, plumber…);
// mobile port of apps/web/components/staff/StaffDirectory.jsx. Anyone can add,
// everyone sees; the person who added a contact (or an authority) can remove it.
// Live via realtime on society_staff.
//
// JavaScript only — no TypeScript per CLAUDE.md.

import { addStaff, deleteStaff } from "@parisar/api-client";
import { Phone, Plus, Trash2, UserRound, X } from "lucide-react-native";
import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Alert,
  KeyboardAvoidingView,
  Linking,
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
import { useAuthStore } from "../../../lib/auth-store";
import { getSupabase } from "../../../lib/supabase";
import { useMyContext } from "../../../lib/use-my-context";

const CATS = ["maid", "driver", "cook", "electrician", "plumber", "gardener", "other"];

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

function AddStaffSheet({ visible, societyId, onClose, onAdded }) {
  const { t } = useTranslation("auth");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [category, setCategory] = useState("maid");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (visible) {
      setName("");
      setPhone("");
      setCategory("maid");
      setError(null);
    }
  }, [visible]);

  async function submit() {
    setError(null);
    if (!name.trim()) return setError(t("staff.nameRequired"));
    setSaving(true);
    try {
      const res = await addStaff(getSupabase(), { societyId, name: name.trim(), phone, category });
      if (res?.error) {
        setError(t("staff.saveError"));
        return;
      }
      onAdded();
      onClose();
    } catch {
      setError(t("staff.saveError"));
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
        <View className="gap-4 rounded-t-3xl bg-neutral-0 p-5">
          <View className="flex-row items-center justify-between">
            <Text className="text-xl font-semibold text-neutral-900">{t("staff.add")}</Text>
            <Pressable onPress={onClose} accessibilityRole="button" className="p-1">
              <X size={20} color="#64748B" />
            </Pressable>
          </View>
          <Field label={t("staff.category")}>
            <View className="flex-row flex-wrap gap-2">
              {CATS.map((c) => (
                <Chip
                  key={c}
                  label={t(`staff.${c}`)}
                  on={category === c}
                  onPress={() => setCategory(c)}
                />
              ))}
            </View>
          </Field>
          <Field label={t("staff.name")}>
            <TextField
              value={name}
              onChangeText={setName}
              placeholder={t("staff.namePh")}
              maxLength={60}
              autoCapitalize="words"
            />
          </Field>
          <Field label={t("staff.phone")}>
            <TextField
              value={phone}
              onChangeText={(v) => setPhone(v.replace(/\D/g, "").slice(0, 10))}
              placeholder="9876543210"
              keyboardType="phone-pad"
              maxLength={10}
            />
          </Field>
          <FormError message={error} />
          <View className="flex-row justify-end gap-2.5 pb-2">
            <SmallButton tone="outline" label={t("profile.cancel")} onPress={onClose} />
            <SmallButton
              label={saving ? t("profile.saving") : t("staff.add")}
              onPress={submit}
              disabled={saving}
            />
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

export default function StaffDirectoryScreen() {
  const { t } = useTranslation(["auth", "dashboard"]);
  const userId = useAuthStore((s) => s.session?.user?.id ?? null);
  const me = useMyContext();
  const societyId = me.societyId;
  const [staff, setStaff] = useState([]);
  const [filter, setFilter] = useState("all");
  const [adding, setAdding] = useState(false);

  const load = useCallback(async () => {
    if (!societyId) return;
    const { data } = await getSupabase()
      .from("society_staff")
      .select("id, name, phone, category, added_by, added_by_name, added_by_flat")
      .eq("society_id", societyId)
      .order("created_at", { ascending: false });
    setStaff(Array.isArray(data) ? data : []);
  }, [societyId]);

  useEffect(() => {
    if (!societyId) return undefined;
    load();
    const supabase = getSupabase();
    const channel = supabase
      .channel(`staff-${Math.random().toString(36).slice(2)}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "society_staff" }, () =>
        load(),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [societyId, load]);

  function remove(id) {
    Alert.alert(t("staff.remove"), "", [
      { text: t("profile.cancel"), style: "cancel" },
      {
        text: t("staff.remove"),
        style: "destructive",
        onPress: async () => {
          await deleteStaff(getSupabase(), id);
          await load();
        },
      },
    ]);
  }

  const shown = filter === "all" ? staff : staff.filter((s) => s.category === filter);

  return (
    <SafeAreaView className="flex-1 bg-neutral-50" edges={["top"]}>
      <ScrollView contentContainerClassName="px-5 pt-4 pb-10">
        <PageHeader
          backLabel={t("dashboard:nav.home")}
          backHref="/(protected)/(tabs)"
          title={t("staff.title")}
          description={t("staff.lead")}
        />
        <View className="flex-row pb-4">
          <SmallButton icon={Plus} label={t("staff.add")} onPress={() => setAdding(true)} />
        </View>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerClassName="gap-2 pb-4"
        >
          {["all", ...CATS].map((c) => (
            <Chip
              key={c}
              label={c === "all" ? t("staff.filterAll") : t(`staff.${c}`)}
              on={filter === c}
              onPress={() => setFilter(c)}
            />
          ))}
        </ScrollView>

        {shown.length === 0 ? (
          <EmptyState
            icon={UserRound}
            title={t("staff.empty")}
            action={
              <SmallButton
                icon={Plus}
                label={t("staff.addFirst")}
                onPress={() => setAdding(true)}
              />
            }
          />
        ) : (
          <View className="gap-2.5">
            {shown.map((s) => (
              <SurfaceCard key={s.id} className="flex-row items-start gap-3">
                <View className="flex-1 gap-1">
                  <View className="self-start rounded-full bg-brand-50 px-2 py-0.5">
                    <Text className="text-xs font-semibold text-brand-700">
                      {t(`staff.${s.category}`)}
                    </Text>
                  </View>
                  <Text className="text-base font-semibold text-neutral-900">{s.name}</Text>
                  {s.phone ? (
                    <Pressable
                      onPress={() => Linking.openURL(`tel:+91${s.phone}`)}
                      accessibilityRole="link"
                      className="flex-row items-center gap-1.5 self-start"
                    >
                      <Phone size={14} color="#0E5A48" />
                      <Text className="text-sm font-semibold text-brand-600">+91 {s.phone}</Text>
                    </Pressable>
                  ) : null}
                  {s.added_by_name ? (
                    <Text className="text-xs text-neutral-400">
                      {t("staff.addedBy", {
                        who: `${s.added_by_name}${s.added_by_flat ? ` · ${s.added_by_flat}` : ""}`,
                      })}
                    </Text>
                  ) : null}
                </View>
                {s.added_by === userId || me.isAuthority ? (
                  <Pressable
                    onPress={() => remove(s.id)}
                    accessibilityRole="button"
                    accessibilityLabel={t("staff.remove")}
                    className="p-1.5"
                  >
                    <Trash2 size={17} color="#c81e1e" />
                  </Pressable>
                ) : null}
              </SurfaceCard>
            ))}
          </View>
        )}
      </ScrollView>
      <AddStaffSheet
        visible={adding}
        societyId={societyId}
        onClose={() => setAdding(false)}
        onAdded={load}
      />
    </SafeAreaView>
  );
}
