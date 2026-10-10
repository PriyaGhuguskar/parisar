// apps/mobile/app/(protected)/(tabs)/profile.jsx
// Profile — the mobile port of the website's /profile (ProfileClient +
// MyProfileCard): avatar, name, role and flat chips; phone, flat and
// emergency contact; Edit lets you change your name (profiles.full_name) and
// emergency contact (your society_memberships row). Reached from the Menu tab.
//
// JavaScript only — no TypeScript per CLAUDE.md.

import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { KeyboardAvoidingView, Platform, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { FormError } from "../../../components/auth/FormError";
import { PageHeader, SmallButton, SurfaceCard } from "../../../components/kit";
import { Field, TextField } from "../../../components/onboarding/Form";
import { useAuthStore } from "../../../lib/auth-store";
import { getAvatarColor, initials } from "../../../lib/avatar";
import { getSupabase } from "../../../lib/supabase";
import { refreshMyContext, useMyContext } from "../../../lib/use-my-context";

const ROLE_KEY = {
  secretary: "profile.roleSecretary",
  co_secretary: "profile.roleCoSecretary",
  board_member: "profile.roleBoard",
  member: "profile.roleMember",
};

function Row({ label, value }) {
  return (
    <View className="flex-row items-start justify-between gap-4 border-t border-neutral-100 py-3">
      <Text className="text-sm text-neutral-600">{label}</Text>
      <Text className="flex-1 text-right text-sm font-semibold text-neutral-900">{value}</Text>
    </View>
  );
}

export default function ProfileScreen() {
  const { t } = useTranslation(["auth", "dashboard"]);
  const userId = useAuthStore((s) => s.session?.user?.id ?? null);
  const authPhone = useAuthStore((s) => s.session?.user?.phone ?? "");
  const me = useMyContext();
  const [emergency, setEmergency] = useState(null);
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState("");
  const [emergencyDraft, setEmergencyDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  // Emergency contact lives on the membership row (not in the shared context).
  useEffect(() => {
    if (!me.membershipId) return;
    getSupabase()
      .from("society_memberships")
      .select("emergency_contact")
      .eq("id", me.membershipId)
      .maybeSingle()
      .then(({ data }) => setEmergency(data?.emergency_contact ?? null));
  }, [me.membershipId]);

  const displayName = me.fullName?.trim() || t("profile.roleMember");
  const avatar = getAvatarColor(displayName);
  const digits = String(authPhone ?? "")
    .replace(/\D/g, "")
    .slice(-10);
  const phone = digits ? `+91 ${digits.slice(0, 5)} ${digits.slice(5)}` : "—";

  async function save() {
    setError(null);
    const trimmed = name.trim();
    if (!trimmed) return setError(t("profile.nameRequired"));
    setSaving(true);
    try {
      const supabase = getSupabase();
      const { error: e1 } = await supabase
        .from("profiles")
        .update({ full_name: trimmed })
        .eq("user_id", userId);
      if (e1) throw e1;
      if (me.membershipId) {
        const { error: e2 } = await supabase
          .from("society_memberships")
          .update({ emergency_contact: emergencyDraft.trim() || null })
          .eq("id", me.membershipId);
        if (e2) throw e2;
        setEmergency(emergencyDraft.trim() || null);
      }
      await refreshMyContext();
      setEditing(false);
    } catch {
      setError(t("profile.saveError"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <SafeAreaView className="flex-1 bg-neutral-50" edges={["top"]}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        className="flex-1"
      >
        <ScrollView contentContainerClassName="px-5 pt-4 pb-10" keyboardShouldPersistTaps="handled">
          <PageHeader
            backLabel={t("dashboard:nav.menu")}
            title={t("dashboard:nav.profile")}
            description={t("profile.lead")}
          />
          <SurfaceCard>
            <View className="flex-row items-center gap-3">
              <View
                className="h-14 w-14 items-center justify-center rounded-full"
                style={{ backgroundColor: avatar.bg }}
              >
                <Text className="text-lg font-semibold" style={{ color: avatar.text }}>
                  {initials(displayName)}
                </Text>
              </View>
              <View className="flex-1 gap-1.5">
                <Text className="text-lg font-semibold text-neutral-900" numberOfLines={1}>
                  {displayName}
                </Text>
                <View className="flex-row flex-wrap gap-1.5">
                  <View className="rounded-full bg-brand-50 px-2 py-0.5">
                    <Text className="text-xs font-semibold text-brand-700">
                      {t(ROLE_KEY[me.role] ?? "profile.roleMember")}
                    </Text>
                  </View>
                  {me.flatLabel ? (
                    <View className="rounded-full bg-neutral-100 px-2 py-0.5">
                      <Text className="text-xs font-semibold text-neutral-600">{me.flatLabel}</Text>
                    </View>
                  ) : null}
                </View>
              </View>
            </View>

            {editing ? (
              <View className="mt-4 gap-4">
                <Field label={t("profile.fullName")}>
                  <TextField
                    value={name}
                    onChangeText={setName}
                    maxLength={80}
                    autoCapitalize="words"
                  />
                </Field>
                <Field label={t("profile.emergency")}>
                  <TextField
                    value={emergencyDraft}
                    onChangeText={setEmergencyDraft}
                    maxLength={40}
                    keyboardType="phone-pad"
                  />
                </Field>
                <FormError message={error} />
                <View className="flex-row justify-end gap-2.5">
                  <SmallButton
                    tone="outline"
                    label={t("profile.cancel")}
                    onPress={() => setEditing(false)}
                  />
                  <SmallButton
                    label={saving ? t("profile.saving") : t("profile.save")}
                    onPress={save}
                    disabled={saving}
                  />
                </View>
              </View>
            ) : (
              <View className="mt-4">
                <Row label={t("profile.phone")} value={phone} />
                <Row label={t("profile.flat")} value={me.flatLabel || "—"} />
                <Row
                  label={t("profile.emergency")}
                  value={emergency || t("profile.emergencyNone")}
                />
                <View className="flex-row pt-3">
                  <SmallButton
                    tone="outline"
                    label={t("profile.edit")}
                    onPress={() => {
                      setName(me.fullName ?? "");
                      setEmergencyDraft(emergency ?? "");
                      setError(null);
                      setEditing(true);
                    }}
                  />
                </View>
              </View>
            )}
          </SurfaceCard>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
