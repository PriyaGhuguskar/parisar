import { isValidIndianMobile, toE164 } from "@parisar/api-client";
import { useRouter } from "expo-router";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { KeyboardAvoidingView, Platform, ScrollView, Text, View } from "react-native";
import { AuthShell } from "../../components/auth/AuthShell";
import { DevOtpHint } from "../../components/auth/DevOtpHint";
import { FormError } from "../../components/auth/FormError";
import { PhoneInput } from "../../components/auth/PhoneInput";
import { PrimaryButton } from "../../components/auth/PrimaryButton";
import { getSupabase } from "../../lib/supabase";

/**
 * Screen 2 — Mobile Number Entry
 * Collects user's Indian mobile number and calls signInWithOtp.
 */
export default function LoginScreen() {
  const router = useRouter();
  const { t } = useTranslation("auth");
  const [phone, setPhone] = useState("");
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  const isReady = phone.length === 10;

  async function handleSendOtp() {
    setError(null);

    if (!isValidIndianMobile(phone)) {
      setError(t("auth.invalidPhone"));
      return;
    }

    setLoading(true);
    try {
      const e164 = toE164(phone);
      const supabase = getSupabase();
      const { error: otpError } = await supabase.auth.signInWithOtp({
        phone: e164,
      });

      if (otpError) {
        if (otpError.status === 429) {
          setError(t("auth.rateLimited", { minutes: "1" }));
        } else {
          setError(t("auth.networkError"));
        }
        return;
      }

      router.push({
        pathname: "/(auth)/verify",
        params: { phone: e164 },
      });
    } catch {
      setError(t("auth.networkError"));
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthShell>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        className="flex-1"
      >
        <ScrollView
          contentContainerClassName="flex-grow"
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Top area: wordmark + spacing */}
          <View className="pt-16 pb-12 items-center">
            <Text className="font-semibold text-brand-500" style={{ fontSize: 28, lineHeight: 32 }}>
              Parisar
            </Text>
          </View>

          {/* Form */}
          <View className="gap-4">
            {/* DEV-ONLY OTP hint (no-op in production builds) */}
            <DevOtpHint />

            {/* Heading */}
            <Text className="text-xl font-semibold text-neutral-900">{t("auth.enterPhone")}</Text>

            {/* Sub-heading */}
            <Text className="text-base text-neutral-600">{t("auth.sendOtpExplainer")}</Text>

            {/* Phone input */}
            <View className="gap-1">
              <PhoneInput value={phone} onChangeText={setPhone} hasError={!!error} />
              <FormError message={error} />
            </View>

            {/* CTA button */}
            <PrimaryButton
              label={loading ? t("auth.sending") : t("auth.sendOtp")}
              onPress={handleSendOtp}
              loading={loading}
              disabled={!isReady}
            />

            {/* Terms note */}
            <Text className="text-sm text-neutral-400 text-center">{t("auth.termsNote")}</Text>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </AuthShell>
  );
}
