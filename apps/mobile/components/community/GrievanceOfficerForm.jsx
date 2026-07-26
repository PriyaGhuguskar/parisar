// GrievanceOfficerForm — the admin-only Grievance Officer settings form (COMM-05, D-06).
//
// JavaScript only — no TypeScript per CLAUDE.md.

import { setGrievanceOfficer } from "@parisar/api-client";
import { CheckCircle2 } from "lucide-react-native";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { ActivityIndicator, Pressable, Text, TextInput, View } from "react-native";

const DANGER_500 = "#c81e1e";

// email OR Indian phone (10 digits, optional +91 / leading 0 / spaces).
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_RE = /^(?:\+?91[\s-]?)?[6-9]\d{4}[\s-]?\d{5}$/;

function isValidContact(value) {
  const v = (value ?? "").trim();
  if (!v) return false;
  return EMAIL_RE.test(v) || PHONE_RE.test(v.replace(/[\s-]/g, ""));
}

/**
 * @param {{
 *   supabase: object,
 *   initialName?: string,
 *   initialContact?: string,
 *   isDefault?: boolean,
 *   onSubmit?: (supabase: object, opts: { name: string, contact: string }) => Promise<object>,
 *   onSaved?: () => void,
 * }} props
 */
export function GrievanceOfficerForm({
  supabase,
  initialName = "",
  initialContact = "",
  isDefault = false,
  onSubmit = setGrievanceOfficer,
  onSaved,
}) {
  const { t } = useTranslation("moderation");
  const [name, setName] = useState(initialName);
  const [contact, setContact] = useState(initialContact);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [showSuccess, setShowSuccess] = useState(false);

  const nameValid = name.trim().length >= 2 && name.trim().length <= 80;
  const contactValid = isValidContact(contact);
  const canSave = nameValid && contactValid && !saving;

  async function handleSave() {
    if (!canSave) return;
    setError(null);
    setSaving(true);
    try {
      await onSubmit(supabase, { name: name.trim(), contact: contact.trim() });
      setShowSuccess(true);
      setTimeout(() => {
        setShowSuccess(false);
        onSaved?.();
      }, 1000);
    } catch (err) {
      console.warn("[GrievanceOfficerForm] save failed:", err?.message ?? err);
      setError(t("grievance.saveError"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <View className="bg-white rounded-2xl p-4 gap-4">
      <Text className="text-base text-neutral-600">{t("grievance.settingsIntro")}</Text>

      {/* Name */}
      <View className="gap-1">
        <Text className="text-sm text-neutral-600">{t("grievance.nameLabel")}</Text>
        <TextInput
          value={name}
          onChangeText={setName}
          placeholder={t("grievance.namePlaceholder")}
          placeholderTextColor="#6e6e6e"
          maxLength={80}
          className="rounded-xl border border-neutral-200 bg-white px-3 py-2 text-base text-neutral-900"
          accessibilityLabel={t("grievance.nameLabel")}
        />
      </View>

      {/* Contact */}
      <View className="gap-1">
        <Text className="text-sm text-neutral-600">{t("grievance.contactLabel")}</Text>
        <TextInput
          value={contact}
          onChangeText={setContact}
          placeholder={t("grievance.contactPlaceholder")}
          placeholderTextColor="#6e6e6e"
          autoCapitalize="none"
          keyboardType="email-address"
          className="rounded-xl border border-neutral-200 bg-white px-3 py-2 text-base text-neutral-900"
          accessibilityLabel={t("grievance.contactLabel")}
        />
      </View>

      {/* Default hint (shown while the value is still the Secretary fallback) */}
      {isDefault ? (
        <Text className="text-sm text-neutral-400">{t("grievance.defaultHint")}</Text>
      ) : null}

      {error ? (
        <Text className="text-sm" style={{ color: DANGER_500 }} accessibilityRole="alert">
          {error}
        </Text>
      ) : null}

      {/* Save */}
      <Pressable
        onPress={handleSave}
        disabled={!canSave}
        accessibilityRole="button"
        accessibilityLabel={t("grievance.saveCta")}
        accessibilityState={{ disabled: !canSave, busy: saving }}
        className={[
          "h-14 w-full rounded-xl items-center justify-center",
          canSave ? "bg-brand-500 active:bg-brand-600" : "bg-neutral-200",
        ].join(" ")}
      >
        {saving ? (
          <ActivityIndicator color="#ffffff" />
        ) : (
          <Text
            className={`text-base font-semibold ${canSave ? "text-white" : "text-neutral-400"}`}
          >
            {t("grievance.saveCta")}
          </Text>
        )}
      </Pressable>

      {showSuccess ? (
        <View
          className="flex-row items-center gap-2 rounded-xl p-3"
          style={{ backgroundColor: "#ecfdf5" }}
          accessibilityRole="alert"
        >
          <CheckCircle2 size={16} color="#047857" />
          <Text className="text-neutral-900 text-base">{t("grievance.saveSuccess")}</Text>
        </View>
      ) : null}
    </View>
  );
}
