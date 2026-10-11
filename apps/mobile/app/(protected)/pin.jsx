// apps/mobile/app/(protected)/pin.jsx
// The PIN step after OTP — the mobile port of the website's verify page
// stages "pin" and "setpin" (apps/web/app/(auth)/verify/page.jsx):
//
//   mode=enter  enter the existing 4-digit PIN (second factor), checked against
//               the real credential with signInWithPassword. "Forgot your PIN?"
//               switches to set mode — OTP has already proved who they are.
//   mode=set    choose a PIN (no 1234 / four the same), confirm it, save.
//
// The PIN is stored as the account password via the shared derivePinSecret
// (same format as the website), and profiles.pin_set is flagged.
// `next` = where to go afterwards.
//
// JavaScript only — no TypeScript per CLAUDE.md.

import { derivePinSecret } from "@parisar/api-client";
import { useLocalSearchParams, useRouter } from "expo-router";
import { KeyRound } from "lucide-react-native";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, View } from "react-native";
import { AuthShell } from "../../components/auth/AuthShell";
import { FormError } from "../../components/auth/FormError";
import { OtpInput } from "../../components/auth/OtpInput";
import { PrimaryButton } from "../../components/auth/PrimaryButton";
import { LogoutButton } from "../../components/LogoutButton";
import { clearPinPending } from "../../lib/pin-pending";
import { ROUTES } from "../../lib/post-login";
import { getSupabase } from "../../lib/supabase";

function weakPin(p) {
  return p === "1234" || /^(\d)\1{3}$/.test(p);
}

export default function PinScreen() {
  const router = useRouter();
  const { t } = useTranslation("auth");
  const params = useLocalSearchParams();
  const next = typeof params.next === "string" && params.next ? params.next : ROUTES.app;

  const [mode, setMode] = useState(params.mode === "set" ? "set" : "enter");
  const [forgot, setForgot] = useState(false);
  const [phone, setPhone] = useState("");
  const [userId, setUserId] = useState(null);
  const [pin, setPin] = useState("");
  const [pin2, setPin2] = useState("");
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    getSupabase()
      .auth.getUser()
      .then(({ data }) => {
        const u = data?.user;
        if (!u) return;
        setUserId(u.id);
        setPhone(u.phone ? `+${String(u.phone).replace(/\D/g, "")}` : "");
      });
  }, []);

  async function finish() {
    await clearPinPending();
    router.replace(next);
  }

  // --- enter the existing PIN ----------------------------------------------
  async function submitEnter(code) {
    const value = typeof code === "string" ? code : pin;
    if (value.length !== 4 || busy || !phone) return;
    setErr(null);
    setBusy(true);
    try {
      const { error } = await getSupabase().auth.signInWithPassword({
        phone,
        password: derivePinSecret(phone, value),
      });
      if (error) {
        setErr(error.status === 429 ? t("auth.rateLimited", { minutes: "1" }) : t("auth.pinWrong"));
        setPin("");
        setBusy(false);
        return;
      }
      await finish();
    } catch {
      setErr(t("auth.networkError"));
      setBusy(false);
    }
  }

  // --- choose a new PIN --------------------------------------------------------
  async function submitSet() {
    setErr(null);
    if (!/^\d{4}$/.test(pin) || weakPin(pin)) return setErr(t("auth.setPinWeak"));
    if (pin !== pin2) return setErr(t("auth.setPinMismatch"));
    if (!phone || !userId) return setErr(t("auth.networkError"));
    setBusy(true);
    try {
      const supabase = getSupabase();
      const { error } = await supabase.auth.updateUser({
        password: derivePinSecret(phone, pin),
      });
      if (error) throw error;
      const { error: flagErr } = await supabase
        .from("profiles")
        .update({ pin_set: true, pin_set_at: new Date().toISOString() })
        .eq("user_id", userId);
      if (flagErr) throw flagErr;
      await finish();
    } catch {
      setErr(t("auth.networkError"));
      setBusy(false);
    }
  }

  const isSet = mode === "set";

  return (
    <AuthShell>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        className="flex-1"
      >
        <ScrollView
          contentContainerClassName="flex-grow gap-5 pt-12 pb-10"
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View className="h-11 w-11 items-center justify-center rounded-xl bg-brand-500">
            <KeyRound size={20} color="#fff" />
          </View>

          <View className="gap-2">
            <Text className="text-2xl font-semibold text-neutral-900">
              {isSet ? t("auth.setPinTitle") : t("auth.pinSecondFactor")}
            </Text>
            <Text className="text-base text-neutral-600">
              {isSet
                ? forgot
                  ? t("auth.pinForgotHelp")
                  : t("auth.setPinSub")
                : t("auth.pinStepSub")}
            </Text>
          </View>

          {isSet ? (
            <View className="gap-4">
              <View className="gap-2">
                <Text className="text-sm font-semibold text-neutral-900">{t("auth.pinLabel")}</Text>
                <OtpInput
                  length={4}
                  secure
                  value={pin}
                  onChangeText={(v) => {
                    setPin(v);
                    setErr(null);
                  }}
                  boxLabel="PIN digit"
                  inputLabel={t("auth.pinLabel")}
                />
              </View>
              <View className="gap-2">
                <Text className="text-sm font-semibold text-neutral-900">
                  {t("auth.setPinConfirm")}
                </Text>
                <OtpInput
                  length={4}
                  secure
                  autoFocus={false}
                  value={pin2}
                  onChangeText={(v) => {
                    setPin2(v);
                    setErr(null);
                  }}
                  boxLabel="Confirm PIN digit"
                  inputLabel={t("auth.setPinConfirm")}
                />
              </View>
              <FormError message={err} />
              <PrimaryButton
                label={t("auth.setPinSave")}
                onPress={submitSet}
                loading={busy}
                disabled={pin.length !== 4 || pin2.length !== 4}
              />
            </View>
          ) : (
            <View className="gap-4">
              <OtpInput
                length={4}
                secure
                value={pin}
                hasError={Boolean(err)}
                onChangeText={(v) => {
                  setPin(v);
                  setErr(null);
                }}
                onComplete={submitEnter}
                boxLabel="PIN digit"
                inputLabel={t("auth.pinLabel")}
              />
              <FormError message={err} />
              <PrimaryButton
                label={t("auth.verify")}
                onPress={() => submitEnter()}
                loading={busy}
                disabled={pin.length !== 4}
              />
              <Pressable
                onPress={() => {
                  setMode("set");
                  setForgot(true);
                  setPin("");
                  setErr(null);
                }}
                accessibilityRole="button"
                className="items-center py-2"
              >
                <Text className="text-sm font-semibold text-brand-600">{t("auth.pinForgot")}</Text>
              </Pressable>
            </View>
          )}

          <View className="items-center pt-4">
            <LogoutButton />
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </AuthShell>
  );
}
