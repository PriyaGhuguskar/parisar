// apps/mobile/components/authorities/AuthoritiesSection.jsx
// Society Authorities — the mobile port of apps/web/components/authorities/
// AuthoritiesSection.jsx. Lists the society's authorities with "Signed in" /
// "Not signed in yet", and lets any authority add another (name + mobile) via
// add_society_authority.
//
// JavaScript only — no TypeScript per CLAUDE.md.

import {
  addSocietyAuthority,
  isValidAuthorityPhone,
  listSocietyAuthorities,
} from "@parisar/api-client";
import { Plus, ShieldCheck, X } from "lucide-react-native";
import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { KeyboardAvoidingView, Modal, Platform, Pressable, Text, View } from "react-native";
import { getSupabase } from "../../lib/supabase";
import { FormError } from "../auth/FormError";
import { SectionTitle, SmallButton, StatusPill, SurfaceCard } from "../kit";
import { Field, TextField } from "../onboarding/Form";

const ERROR_KEY = {
  INVALID_NAME: "authority.errName",
  INVALID_PHONE: "authority.errPhone",
  ALREADY_AUTHORITY: "authority.errExists",
};

function AddAuthoritySheet({ visible, societyId, onClose, onAdded }) {
  const { t } = useTranslation("auth");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (visible) {
      setName("");
      setPhone("");
      setError(null);
    }
  }, [visible]);

  async function submit() {
    setError(null);
    if (name.trim().length < 2) return setError(t("authority.errName"));
    if (!isValidAuthorityPhone(phone)) return setError(t("authority.errPhone"));
    setSaving(true);
    try {
      const res = await addSocietyAuthority(getSupabase(), { societyId, name, phone });
      if (res?.error) {
        setError(t(ERROR_KEY[res.error] ?? "authority.errGeneric"));
        return;
      }
      onAdded(res.linked);
      onClose();
    } catch {
      setError(t("authority.errGeneric"));
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
            <Text className="text-xl font-semibold text-neutral-900">
              {t("authority.addAuthority")}
            </Text>
            <Pressable onPress={onClose} accessibilityRole="button" className="p-1">
              <X size={20} color="#64748B" />
            </Pressable>
          </View>
          <Field label={t("authority.name")}>
            <TextField
              autoFocus
              value={name}
              onChangeText={setName}
              placeholder={t("authority.namePh")}
              maxLength={80}
              autoCapitalize="words"
            />
          </Field>
          <Field label={t("authority.phone")}>
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
            <SmallButton tone="outline" label={t("authority.cancel")} onPress={onClose} />
            <SmallButton
              label={saving ? t("authority.adding") : t("authority.add")}
              onPress={submit}
              disabled={saving}
            />
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

export function AuthoritiesSection({ societyId, userId }) {
  const { t } = useTranslation("auth");
  const [rows, setRows] = useState([]);
  const [loadFailed, setLoadFailed] = useState(false);
  const [adding, setAdding] = useState(false);
  const [notice, setNotice] = useState(null);

  const load = useCallback(async () => {
    if (!societyId) return;
    try {
      setRows(await listSocietyAuthorities(getSupabase(), societyId));
      setLoadFailed(false);
    } catch {
      setLoadFailed(true);
    }
  }, [societyId]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <View>
      <SectionTitle title={t("authority.authoritiesTitle")} lead={t("authority.authoritiesLead")} />
      <View className="pb-3">
        <SmallButton
          icon={Plus}
          label={t("authority.addAuthority")}
          onPress={() => {
            setNotice(null);
            setAdding(true);
          }}
        />
      </View>
      {notice ? (
        <View className="mb-3 rounded-xl bg-brand-50 px-3.5 py-2.5">
          <Text className="text-sm font-medium text-brand-700">{notice}</Text>
        </View>
      ) : null}
      {loadFailed ? (
        <Text className="text-sm text-danger-500">{t("authority.loadError")}</Text>
      ) : (
        <View className="gap-2">
          {rows.map((a) => (
            <SurfaceCard key={a.id} className="flex-row items-center gap-3 py-3">
              <View className="h-9 w-9 items-center justify-center rounded-lg bg-brand-50">
                <ShieldCheck size={17} color="#0E5A48" />
              </View>
              <View className="flex-1">
                <Text className="text-base font-semibold text-neutral-900" numberOfLines={1}>
                  {a.full_name}
                  {a.user_id && a.user_id === userId ? ` (${t("authority.you")})` : ""}
                </Text>
                <Text className="text-sm text-neutral-600">+91 {a.phone}</Text>
              </View>
              <StatusPill tone={a.user_id ? "done" : "neutral"}>
                {a.user_id ? t("authority.statusJoined") : t("authority.statusInvited")}
              </StatusPill>
            </SurfaceCard>
          ))}
        </View>
      )}
      <AddAuthoritySheet
        visible={adding}
        societyId={societyId}
        onClose={() => setAdding(false)}
        onAdded={(linked) => {
          setNotice(linked ? t("authority.addedLinked") : t("authority.added"));
          load();
        }}
      />
    </View>
  );
}
