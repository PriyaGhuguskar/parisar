import { isNewUser } from "@parisar/api-client";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { AuthShell } from "../../components/auth/AuthShell";
import { DevOtpHint } from "../../components/auth/DevOtpHint";
import { FormError } from "../../components/auth/FormError";
import { OtpInput } from "../../components/auth/OtpInput";
import { PrimaryButton } from "../../components/auth/PrimaryButton";
import { ResendTimer } from "../../components/auth/ResendTimer";
import { getSupabase } from "../../lib/supabase";

/**
 * Screen 3 — OTP Entry
 * User enters the 6-digit OTP. Detects new vs returning user after verify.
 */
export default function VerifyScreen() {
  const router = useRouter();
  const { t } = useTranslation("auth");
  const { phone } = useLocalSearchParams();

  const [otp, setOtp] = useState("");
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const [hasOtpError, setHasOtpError] = useState(false);

  // Display phone without leading +91 prefix for the sub-heading
  const displayPhone = phone ? phone.replace(/^\+91/, "") : "";

  async function handleVerify() {
    if (otp.length < 6) return;
    setError(null);
    setHasOtpError(false);
    setLoading(true);

    try {
      const supabase = getSupabase();
      const { data, error: verifyError } = await supabase.auth.verifyOtp({
        phone,
        token: otp,
        type: "sms",
      });

      if (verifyError) {
        const msg = verifyError.message?.toLowerCase() ?? "";
        if (msg.includes("expired")) {
          setError(t("auth.otpExpired"));
        } else if (verifyError.status === 429) {
          setError(t("auth.verifyRateLimited"));
        } else {
          setError(t("auth.incorrectOtp"));
        }
        setHasOtpError(true);
        setOtp("");
        return;
      }

      // PAR-109: verifyOtp can resolve without a user object. Reading
      // `data.user.id` unguarded threw into the generic catch below, which
      // masked the real cause as a "network error". Fail explicitly instead.
      const userId = data?.user?.id;
      if (!userId) {
        setError(t("auth.networkError"));
        setHasOtpError(true);
        setOtp("");
        return;
      }

      // Detect new vs returning user by checking profiles table
      const { data: profile, error: profileError } = await supabase
        .from("profiles")
        .select("user_id")
        .eq("user_id", userId)
        .maybeSingle();

      // PAR-109/116: a failed lookup must not be treated as "new user" — that
      // would route an existing member into onboarding.
      if (profileError) {
        setError(t("auth.networkError"));
        return;
      }

      if (isNewUser(profile)) {
        router.replace("/(protected)/onboard");
      } else {
        router.replace("/(protected)/(tabs)");
      }
    } catch {
      setError(t("auth.networkError"));
    } finally {
      setLoading(false);
    }
  }

  async function handleResend() {
    // PAR-109: was fire-and-forget — a failed or throttled (429) resend silently
    // restarted the countdown, so the user waited for an OTP that never came.
    // Surface it, and rethrow so ResendTimer keeps the link tappable for retry.
    setError(null);
    const supabase = getSupabase();
    const { error: resendError } = await supabase.auth.signInWithOtp({ phone });
    if (resendError) {
      setError(
        resendError.status === 429
          ? t("auth.rateLimited", { minutes: "1" })
          : t("auth.networkError"),
      );
      throw resendError;
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
          {/* Back / change number link */}
          <View className="pt-12 pb-4">
            <TouchableOpacity onPress={() => router.back()} accessibilityRole="button">
              <Text className="text-sm text-brand-500">{t("auth.changeNumber")}</Text>
            </TouchableOpacity>
          </View>

          {/* Form */}
          <View className="gap-4">
            {/* Heading */}
            <Text className="text-xl font-semibold text-neutral-900">{t("auth.enterOtp")}</Text>

            {/* Sub-heading — shows masked phone */}
            <Text className="text-base text-neutral-600">
              {t("auth.otpSentTo", { phone: displayPhone })}
            </Text>

            {/* DEV-ONLY OTP hint (no-op in production builds) */}
            <DevOtpHint />

            {/* OTP boxes */}
            <View className="gap-2">
              <OtpInput
                value={otp}
                onChangeText={(val) => {
                  setOtp(val);
                  if (hasOtpError) setHasOtpError(false);
                  if (error) setError(null);
                }}
                hasError={hasOtpError}
                onComplete={handleVerify}
              />
              <FormError message={error} />
            </View>

            {/* Resend timer */}
            <ResendTimer onResend={handleResend} />

            {/* Verify button */}
            <PrimaryButton
              label={loading ? t("auth.verifying") : t("auth.verify")}
              onPress={handleVerify}
              loading={loading}
              disabled={otp.length < 6}
            />
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </AuthShell>
  );
}
