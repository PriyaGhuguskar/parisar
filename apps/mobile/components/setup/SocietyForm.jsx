import { zodResolver } from "@hookform/resolvers/zod";
import { createSociety } from "@parisar/api-client";
import { LockKeyhole } from "lucide-react-native";
import { useMemo, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { z } from "zod";
import { FormError } from "../auth/FormError";
import { WizardProgress } from "./WizardProgress";

/**
 * SocietyForm — Step 1 of the Secretary wizard.
 *
 * Props:
 *   supabase          {object}  Supabase client instance
 *   secretaryPhone    {string}  Secretary's phone (e.g. "+919876543210")
 *   onNext            {function({ societyId, code, coSecretaryFound })}
 */
export function SocietyForm({ supabase, secretaryPhone, onNext }) {
  const { t } = useTranslation("auth");
  const [submitError, setSubmitError] = useState(null);

  // Strip +91 prefix to get bare 10-digit number for locked display and validation
  const rawDigits = (secretaryPhone ?? "").replace(/\D/g, "");
  const secretaryPhoneDigits =
    rawDigits.startsWith("91") && rawDigits.length === 12 ? rawDigits.slice(2) : rawDigits;

  // Build the schema with localized error messages.
  const schema = useMemo(
    () =>
      z.object({
        societyName: z
          .string()
          .min(3, `${t("setup.step1.societyName")} must be at least 3 characters`)
          .max(100),
        address: z
          .string()
          .min(10, `${t("setup.step1.address")} must be at least 10 characters`)
          .max(500),
        coSecPhone: z
          .string()
          .regex(/^[6-9]\d{9}$/, t("setup.step1.coSecInvalid"))
          .refine((v) => v !== secretaryPhoneDigits, t("setup.step1.coSecSameAsSelf")),
      }),
    [t, secretaryPhoneDigits],
  );

  const {
    control,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm({
    resolver: zodResolver(schema),
    defaultValues: { societyName: "", address: "", coSecPhone: "" },
    mode: "onTouched",
  });

  async function onSubmit(values) {
    setSubmitError(null);
    try {
      const result = await createSociety(supabase, {
        name: values.societyName.trim(),
        address: values.address.trim(),
        coSecretaryPhone: values.coSecPhone,
      });
      onNext(result);
    } catch (err) {
      setSubmitError(err?.message ?? t("auth.networkError"));
    }
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      className="flex-1"
    >
      <ScrollView
        contentContainerClassName="pb-8 px-4 pt-2"
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* Progress */}
        <WizardProgress currentStep={1} totalSteps={6} />

        {/* Step card */}
        <View className="bg-white rounded-2xl p-6 shadow-sm mt-2">
          {/* Title */}
          <Text className="text-xl font-semibold text-neutral-900 mb-1">
            {t("setup.step1.title")}
          </Text>
          <Text className="text-base text-neutral-600 mb-5">{t("setup.step1.subtitle")}</Text>

          {/* Society Name */}
          <View className="mb-4">
            <Text className="text-sm text-neutral-700 mb-1">{t("setup.step1.societyName")}</Text>
            <Controller
              control={control}
              name="societyName"
              render={({ field: { onChange, onBlur, value } }) => (
                <TextInput
                  className={[
                    "h-14 rounded-lg bg-neutral-50 px-3 text-base text-neutral-900 border",
                    errors.societyName ? "border-danger-500" : "border-neutral-200",
                  ].join(" ")}
                  value={value}
                  onChangeText={onChange}
                  onBlur={onBlur}
                  placeholder={t("setup.step1.societyNamePlaceholder")}
                  placeholderTextColor="#6e6e6e"
                  maxLength={100}
                  returnKeyType="next"
                  autoCapitalize="words"
                />
              )}
            />
            {errors.societyName && (
              <Text className="text-sm text-danger-500 mt-1">{errors.societyName.message}</Text>
            )}
          </View>

          {/* Address */}
          <View className="mb-4">
            <Text className="text-sm text-neutral-700 mb-1">{t("setup.step1.address")}</Text>
            <Controller
              control={control}
              name="address"
              render={({ field: { onChange, onBlur, value } }) => (
                <TextInput
                  className={[
                    "rounded-lg bg-neutral-50 px-3 text-base text-neutral-900 border py-3",
                    errors.address ? "border-danger-500" : "border-neutral-200",
                  ].join(" ")}
                  value={value}
                  onChangeText={onChange}
                  onBlur={onBlur}
                  placeholder={t("setup.step1.addressPlaceholder")}
                  placeholderTextColor="#6e6e6e"
                  maxLength={500}
                  multiline
                  numberOfLines={3}
                  style={{ minHeight: 96, maxHeight: 180, textAlignVertical: "top" }}
                />
              )}
            />
            {errors.address && (
              <Text className="text-sm text-danger-500 mt-1">{errors.address.message}</Text>
            )}
          </View>

          {/* Secretary Phone — locked */}
          <View className="mb-4">
            <Text className="text-sm text-neutral-700 mb-1">{t("setup.step1.secretaryPhone")}</Text>
            <View className="h-14 rounded-lg bg-neutral-100 border border-neutral-200 px-3 flex-row items-center justify-between">
              <Text className="text-base text-neutral-600">
                {secretaryPhoneDigits ? `+91 ${secretaryPhoneDigits}` : "—"}
              </Text>
              <LockKeyhole size={16} color="#737373" />
            </View>
            <Text className="text-sm text-neutral-400 mt-1">
              {t("setup.step1.secretaryPhoneHelper")}
            </Text>
          </View>

          {/* Co-Secretary Phone */}
          <View className="mb-4">
            <Text className="text-sm text-neutral-700 mb-1">{t("setup.step1.coSecPhone")}</Text>
            <Text className="text-sm text-neutral-600 mb-2">{t("setup.step1.coSecHelper")}</Text>
            <Controller
              control={control}
              name="coSecPhone"
              render={({ field: { onChange, onBlur, value } }) => (
                <TextInput
                  className={[
                    "h-14 rounded-lg bg-neutral-50 px-3 text-base text-neutral-900 border",
                    errors.coSecPhone ? "border-danger-500" : "border-neutral-200",
                  ].join(" ")}
                  value={value}
                  onChangeText={onChange}
                  onBlur={onBlur}
                  placeholder="98765 43210"
                  placeholderTextColor="#6e6e6e"
                  keyboardType="phone-pad"
                  maxLength={10}
                  returnKeyType="done"
                />
              )}
            />
            {errors.coSecPhone && (
              <Text className="text-sm text-danger-500 mt-1">{errors.coSecPhone.message}</Text>
            )}
            {!errors.coSecPhone && (
              <Text className="text-sm text-neutral-400 mt-1">
                {t("setup.step1.coSecNotYetJoined")}
              </Text>
            )}
          </View>

          {/* Submit error */}
          {submitError && <FormError message={submitError} />}

          {/* Next button */}
          <TouchableOpacity
            onPress={handleSubmit(onSubmit)}
            disabled={isSubmitting}
            activeOpacity={0.8}
            className={[
              "h-14 w-full rounded-xl items-center justify-center mt-2",
              isSubmitting ? "bg-neutral-200" : "bg-brand-500",
            ].join(" ")}
            accessibilityRole="button"
          >
            {isSubmitting ? (
              <ActivityIndicator color="#ffffff" size="small" />
            ) : (
              <Text className="text-base font-semibold text-white">{t("auth.continue")}</Text>
            )}
          </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
