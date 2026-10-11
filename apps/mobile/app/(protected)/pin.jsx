// apps/mobile/app/(protected)/pin.jsx
// The PIN step after OTP — the mobile port of the website's verify page
// stages "pin" and "setpin" (apps/web/app/(auth)/verify/page.jsx):
//
//   mode=enter  enter the existing 4-digit PIN (second factor). Checked by the
//               pin-login Edge Function, which counts failures and locks the
//               phone after 5; on success it returns a session we adopt.
//               "Forgot your PIN?" switches to set mode — this login's OTP is
//               the proof the server needs to accept a new PIN.
//   mode=set    choose a PIN (no 1234 / four the same), confirm it, save — also
//               through pin-login, which takes the phone from the session.
//
// The app never computes or sees the stored credential (it is peppered on the
// server — supabase/functions/pin-login/pin-core.js).
// `next` = where to go afterwards.
//
// JavaScript only — no TypeScript per CLAUDE.md.

import { useLocalSearchParams, useRouter } from "expo-router";
import { KeyRound } from "lucide-react-native";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, View } from "react-native";
import { AuthShell } from "../../components/auth/AuthShell";
import { FormError } from "../../components/auth/FormError";
import { OtpInput } from "../../components/auth/OtpInput";
import { PrimaryButton } from "../../components/auth/PrimaryButton";
import { LogoutButton } from "../../components/LogoutButton";
import { Text } from "../../components/ui/Text";
import { clearPinPending } from "../../lib/pin-pending";
import { ROUTES } from "../../lib/post-login";
import { getSupabase } from "../../lib/supabase";

function weakPin(p) {
  return p === "1234" || /^(\d)\1{3}$/.test(p);
}

/**
 * Call the pin-login Edge Function. Business errors come back as non-2xx with
 * a JSON body ({ error, retry_after_seconds? }) — read it off the response.
 * @returns {Promise<object>} the JSON body, or { error: "NETWORK" }
 */
async function callPinLogin(body) {
  try {
    const { data, error } = await getSupabase().functions.invoke("pin-login", { body });
    if (!error) return data ?? {};
    const res = error.context;
    if (res && typeof res.json === "function") {
      const j = await res.json().catch(() => null);
      if (j?.error) return j;
    }
    return { error: "NETWORK" };
  } catch {
    return { error: "NETWORK" };
  }
}

/** Localized message for a pin-login error body. */
function pinErrorMessage(t, body) {
  switch (body?.error) {
    case "PIN_INVALID":
    case "INVALID_INPUT":
    case "INVALID_PIN":
      return t("auth.pinWrong");
    case "WEAK_PIN":
      return t("auth.setPinWeak");
    case "LOCKED":
      return t("auth.pinLocked", {
        minutes: String(Math.max(1, Math.ceil((body.retry_after_seconds ?? 900) / 60))),
        defaultValue: "Too many wrong PINs. Try again in {{minutes}} minutes.",
      });
    case "RATE_LIMITED":
      return t("auth.rateLimited", {
        minutes: String(Math.max(1, Math.ceil((body.retry_after_seconds ?? 60) / 60))),
      });
    case "REAUTH_REQUIRED":
    case "AUTH_REQUIRED":
      return t("auth.reauthRequired", {
        defaultValue: "For your security, please verify your number again.",
      });
    default:
      return t("auth.networkError");
  }
}

export default function PinScreen() {
  const router = useRouter();
  const { t } = useTranslation("auth");
  const params = useLocalSearchParams();
  const next = typeof params.next === "string" && params.next ? params.next : ROUTES.app;

  const [mode, setMode] = useState(params.mode === "set" ? "set" : "enter");
  const [forgot, setForgot] = useState(false);
  const [pin, setPin] = useState("");
  const [pin2, setPin2] = useState("");
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(false);

  async function finish() {
    await clearPinPending();
    router.replace(next);
  }

  // --- enter the existing PIN ----------------------------------------------
  async function submitEnter(code) {
    const value = typeof code === "string" ? code : pin;
    if (value.length !== 4 || busy) return;
    setErr(null);
    setBusy(true);
    // The function takes the phone from this session's access token.
    const body = await callPinLogin({ action: "login", pin: value });
    if (!body?.access_token || !body?.refresh_token) {
      setErr(pinErrorMessage(t, body));
      setPin("");
      setBusy(false);
      return;
    }
    try {
      const { error } = await getSupabase().auth.setSession({
        access_token: body.access_token,
        refresh_token: body.refresh_token,
      });
      if (error) throw error;
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
    setBusy(true);
    const body = await callPinLogin({ action: "set", pin });
    if (!body?.ok) {
      setErr(pinErrorMessage(t, body));
      setBusy(false);
      return;
    }
    try {
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
