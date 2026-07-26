// /(protected)/complaints/new — File a Complaint form.
//
// Per 04-UI-SPEC.md Screen 2:
//   - Type segmented toggle (Society Issue / Member Issue), default 'society'
//   - Description Textarea (min 10, max 1000 chars + counter)
//   - PhotoPicker (optional)
//   - Submit button (full-width brand.500 h-14 rounded-xl)
//   - No optimistic UI (UI-SPEC D1) — wait for RPC confirmation
//   - On success: navigate back + success toast
//
// We pre-generate complaintId so PhotoPicker uploads to a stable storage prefix
// BEFORE file_complaint inserts the row (research Pitfall 7).

import { zodResolver } from "@hookform/resolvers/zod";
import { fileComplaint } from "@parisar/api-client";
import { useRouter } from "expo-router";
import { CheckCircle2 } from "lucide-react-native";
import { useMemo, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import { z } from "zod";
import { FormError } from "../../../../components/auth/FormError";
import { PhotoPicker } from "../../../../components/complaints/PhotoPicker";
import { useAuthStore } from "../../../../lib/auth-store";
import { getSupabase } from "../../../../lib/supabase";

const DESCRIPTION_MAX = 1000;

// Cross-runtime UUID — mirrors api-client/complaints.js cryptoRandomUUID.
function cryptoRandomUUID() {
  const g = globalThis.crypto;
  if (g && typeof g.randomUUID === "function") return g.randomUUID();
  const bytes = new Uint8Array(16);
  if (g && typeof g.getRandomValues === "function") g.getRandomValues(bytes);
  else for (let i = 0; i < 16; i++) bytes[i] = Math.floor(Math.random() * 256);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export default function NewComplaintScreen() {
  const router = useRouter();
  const { t } = useTranslation("complaints");
  const session = useAuthStore((s) => s.session);

  const jwtMeta = session?.user?.app_metadata ?? session?.user?.user_metadata ?? {};
  const societyId = jwtMeta.society_id ?? null;
  // The reporter's own flat — read from JWT app_metadata. The auth hook
  // (Phase 2 inject_society_claims) populates this for active members.
  // If the JWT doesn't include flat_id, the RPC will reject with INVALID_FLAT.
  const reporterFlatId = jwtMeta.flat_id ?? null;

  // Build schema once per render to bind the localized error message.
  const schema = useMemo(
    () =>
      z.object({
        kind: z.enum(["society", "member"]),
        description: z.string().min(10, t("complaint.descriptionRequired")).max(DESCRIPTION_MAX),
      }),
    [t],
  );

  // Pre-generate complaintId once per screen mount so PhotoPicker can build a
  // storage key that file_complaint will accept on insert.
  const complaintId = useMemo(() => cryptoRandomUUID(), []);

  const {
    control,
    handleSubmit,
    watch,
    formState: { errors },
  } = useForm({
    resolver: zodResolver(schema),
    defaultValues: { kind: "society", description: "" },
    mode: "onSubmit",
  });
  const description = watch("description") ?? "";

  const [photo, setPhoto] = useState(null); // { storageKey, mimeType, byteSize, previewUri }
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState(null);
  const [showSuccess, setShowSuccess] = useState(false);

  async function onSubmit(values) {
    if (submitting) return;
    setSubmitError(null);
    setSubmitting(true);
    try {
      const supabase = getSupabase();
      await fileComplaint(supabase, {
        kind: values.kind,
        description: values.description,
        reporterFlatId,
        complaintId,
        storageKey: photo?.storageKey ?? null,
        mimeType: photo?.mimeType ?? null,
        byteSize: photo?.byteSize ?? null,
      });
      setShowSuccess(true);
      // 2-second toast — then navigate back. Use a short delay so the user sees
      // confirmation; the new complaint will appear in the list via Realtime
      // INSERT shortly after navigation.
      setTimeout(() => {
        router.back();
      }, 1200);
    } catch (err) {
      console.warn("[complaints/new] submit failed:", err?.message ?? err);
      const code = err?.message ?? "";
      if (code.includes("NOT_ACTIVE_MEMBER")) {
        setSubmitError(t("complaint.notActiveMember"));
      } else {
        setSubmitError(t("complaint.submitError"));
      }
    } finally {
      setSubmitting(false);
    }
  }

  const charCounter = t("complaint.charCounter", {
    current: String(description.length),
    max: String(DESCRIPTION_MAX),
  });
  const counterColor =
    description.length >= DESCRIPTION_MAX
      ? "#c81e1e"
      : description.length >= 900
        ? "#f59e0b"
        : "#6e6e6e";

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      className="flex-1 bg-neutral-50"
    >
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
        <Text className="text-xl font-semibold text-neutral-900 flex-1">
          {t("complaint.fileTitle")}
        </Text>
      </View>

      <ScrollView
        contentContainerStyle={{ padding: 16, gap: 16, paddingBottom: 96 }}
        keyboardShouldPersistTaps="handled"
      >
        <View className="bg-white rounded-2xl p-4 gap-4">
          {/* Type toggle */}
          <View className="gap-2">
            <Text className="text-sm text-neutral-600">{t("complaint.typeLabel")}</Text>
            <Controller
              control={control}
              name="kind"
              render={({ field: { value, onChange } }) => (
                <View className="flex-row bg-neutral-100 rounded-xl p-1">
                  <Pressable
                    onPress={() => onChange("society")}
                    className={`flex-1 rounded-lg items-center justify-center ${
                      value === "society" ? "bg-brand-500" : "bg-transparent"
                    }`}
                    style={{ minHeight: 44 }}
                    accessibilityRole="button"
                    accessibilityState={{ selected: value === "society" }}
                  >
                    <Text
                      className={`text-sm font-semibold ${
                        value === "society" ? "text-white" : "text-neutral-600"
                      }`}
                    >
                      {t("complaint.typeSociety")}
                    </Text>
                  </Pressable>
                  <Pressable
                    onPress={() => onChange("member")}
                    className={`flex-1 rounded-lg items-center justify-center ${
                      value === "member" ? "bg-brand-500" : "bg-transparent"
                    }`}
                    style={{ minHeight: 44 }}
                    accessibilityRole="button"
                    accessibilityState={{ selected: value === "member" }}
                  >
                    <Text
                      className={`text-sm font-semibold ${
                        value === "member" ? "text-white" : "text-neutral-600"
                      }`}
                    >
                      {t("complaint.typeMember")}
                    </Text>
                  </Pressable>
                </View>
              )}
            />
          </View>

          {/* Description */}
          <View className="gap-2">
            <Text className="text-sm text-neutral-600">{t("complaint.descriptionLabel")}</Text>
            <Controller
              control={control}
              name="description"
              render={({ field: { value, onChange } }) => (
                <TextInput
                  value={value}
                  onChangeText={onChange}
                  placeholder={t("complaint.descriptionPlaceholder")}
                  placeholderTextColor="#6e6e6e"
                  multiline
                  numberOfLines={5}
                  maxLength={DESCRIPTION_MAX}
                  textAlignVertical="top"
                  className="rounded-xl border border-neutral-200 bg-white px-3 py-2 text-base text-neutral-900"
                  style={{ minHeight: 120 }}
                />
              )}
            />
            <Text
              className="text-sm self-end"
              style={{ color: counterColor }}
              accessibilityLabel={`Character count ${description.length} of ${DESCRIPTION_MAX}`}
            >
              {charCounter}
            </Text>
            <FormError message={errors.description?.message} />
          </View>

          {/* Photo */}
          <View className="gap-2">
            <Text className="text-sm text-neutral-600">{t("complaint.photoLabel")}</Text>
            <PhotoPicker
              supabase={getSupabase()}
              societyId={societyId}
              complaintId={complaintId}
              selectedPhoto={photo}
              onPhotoSelected={(result) => setPhoto(result)}
              onRemove={() => setPhoto(null)}
            />
          </View>
        </View>

        {/* Submit error */}
        {submitError ? <FormError message={submitError} /> : null}

        {/* Submit button */}
        <Pressable
          onPress={handleSubmit(onSubmit)}
          disabled={submitting || description.length < 10}
          accessibilityRole="button"
          accessibilityLabel={t("complaint.submitCta")}
          accessibilityState={{ disabled: submitting || description.length < 10, busy: submitting }}
          className={`h-14 w-full rounded-xl items-center justify-center ${
            submitting || description.length < 10
              ? "bg-neutral-200"
              : "bg-brand-500 active:bg-brand-600"
          }`}
        >
          {submitting ? (
            <View className="flex-row items-center gap-2">
              <ActivityIndicator color="#ffffff" />
              <Text className="text-base font-semibold text-white">
                {t("complaint.submitting")}
              </Text>
            </View>
          ) : (
            <Text
              className={`text-base font-semibold ${
                description.length < 10 ? "text-neutral-400" : "text-white"
              }`}
            >
              {t("complaint.submitCta")}
            </Text>
          )}
        </Pressable>
      </ScrollView>

      {/* Success toast */}
      {showSuccess ? (
        <View
          className="absolute left-4 right-4 flex-row items-center gap-2 bg-white border border-success-500 rounded-xl p-3"
          style={{ top: 56, backgroundColor: "#ecfdf5" }}
          accessibilityRole="alert"
        >
          <CheckCircle2 size={16} color="#047857" />
          <Text className="text-neutral-900 text-base">{t("complaint.submitSuccess")}</Text>
        </View>
      ) : null}
    </KeyboardAvoidingView>
  );
}
