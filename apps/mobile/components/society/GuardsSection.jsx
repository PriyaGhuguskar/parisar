// apps/mobile/components/society/GuardsSection.jsx
// Gate guards — list + "Add guard" (name, 10-digit mobile); mobile port of
// apps/web/components/profile/GuardsSection.jsx. A guard then signs in with OTP
// and lands on the gate screen.
//
// JavaScript only — no TypeScript per CLAUDE.md.

import { addGuard } from "@parisar/api-client";
import { Plus, ShieldCheck, X } from "lucide-react-native";
import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { KeyboardAvoidingView, Modal, Platform, Pressable, Text, View } from "react-native";
import { getSupabase } from "../../lib/supabase";
import { FormError } from "../auth/FormError";
import { SectionTitle, SmallButton, SurfaceCard } from "../kit";
import { Field, TextField } from "../onboarding/Form";

export function GuardsSection({ societyId }) {
  const { t } = useTranslation("auth");
  const [guards, setGuards] = useState([]);
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    if (!societyId) return;
    const { data } = await getSupabase()
      .from("society_guards")
      .select("id, name, phone")
      .eq("society_id", societyId)
      .eq("status", "active")
      .order("created_at", { ascending: true });
    setGuards(Array.isArray(data) ? data : []);
  }, [societyId]);

  useEffect(() => {
    load();
  }, [load]);

  async function submit() {
    setError(null);
    if (!name.trim()) return setError(t("visitor.guardAddError"));
    if (!/^[6-9]\d{9}$/.test(phone)) return setError(t("visitor.guardInvalidPhone"));
    setSaving(true);
    try {
      const res = await addGuard(getSupabase(), { societyId, name: name.trim(), phone });
      if (res?.error) {
        setError(
          res.error === "GUARD_EXISTS"
            ? t("visitor.guardExists")
            : res.error === "INVALID_PHONE"
              ? t("visitor.guardInvalidPhone")
              : t("visitor.guardAddError"),
        );
        return;
      }
      setAdding(false);
      await load();
    } catch {
      setError(t("visitor.guardAddError"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <View>
      <SectionTitle
        title={t("visitor.guardsTitle")}
        lead={t("visitor.guardsLead")}
        action={
          <SmallButton
            icon={Plus}
            label={t("visitor.addGuard")}
            onPress={() => {
              setName("");
              setPhone("");
              setError(null);
              setAdding(true);
            }}
          />
        }
      />
      {guards.length === 0 ? (
        <Text className="text-sm text-neutral-400">{t("visitor.noGuards")}</Text>
      ) : (
        <View className="gap-2">
          {guards.map((g) => (
            <SurfaceCard key={g.id} className="flex-row items-center gap-3 py-3">
              <View className="h-9 w-9 items-center justify-center rounded-lg bg-brand-50">
                <ShieldCheck size={17} color="#0E5A48" />
              </View>
              <View className="flex-1">
                <Text className="text-base font-semibold text-neutral-900">{g.name}</Text>
                <Text className="text-sm text-neutral-600">+91 {g.phone}</Text>
              </View>
            </SurfaceCard>
          ))}
        </View>
      )}

      <Modal
        visible={adding}
        animationType="slide"
        transparent
        onRequestClose={() => setAdding(false)}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          className="flex-1 justify-end bg-black/40"
        >
          <View className="gap-4 rounded-t-3xl bg-neutral-0 p-5">
            <View className="flex-row items-center justify-between">
              <Text className="text-xl font-semibold text-neutral-900">
                {t("visitor.addGuard")}
              </Text>
              <Pressable
                onPress={() => setAdding(false)}
                accessibilityRole="button"
                className="p-1"
              >
                <X size={20} color="#64748B" />
              </Pressable>
            </View>
            <Field label={t("visitor.guardName")}>
              <TextField
                value={name}
                onChangeText={setName}
                placeholder={t("visitor.guardNamePh")}
                maxLength={80}
                autoCapitalize="words"
              />
            </Field>
            <Field label={t("visitor.guardPhone")}>
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
              <SmallButton
                tone="outline"
                label={t("profile.cancel")}
                onPress={() => setAdding(false)}
              />
              <SmallButton
                label={saving ? t("profile.saving") : t("visitor.addGuard")}
                onPress={submit}
                disabled={saving}
              />
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}
