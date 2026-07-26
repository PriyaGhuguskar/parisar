import { resumeSocietyCode, rotateSocietyCode } from "@parisar/api-client";
import { useRouter } from "expo-router";
import { AlertTriangle, CheckCircle2, X } from "lucide-react-native";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  ActivityIndicator,
  Linking,
  Platform,
  Pressable,
  SafeAreaView,
  Share,
  Text,
  View,
} from "react-native";
import { useAuthStore } from "../../../lib/auth-store";
import { getSupabase } from "../../../lib/supabase";

// ---------------------------------------------------------------------------
// Screen states
// ---------------------------------------------------------------------------
const STATE_LOADING = "loading"; // fetching current code + paused_at on mount
const STATE_ACTIVE = "active"; // code is active — show rotate warning
const STATE_PAUSED = "paused"; // code is paused — show resume/rotate options
const STATE_ROTATED = "rotated"; // rotation succeeded — show new code
const STATE_RESUMED = "resumed"; // resume succeeded — show success
const STATE_ERROR = "error"; // fetch/RPC failed

/**
 * Code Rotation screen — modal presentation.
 *
 * Active-code path:
 *   Shows current code + warning block.
 *   "Generate New Code" → calls rotateSocietyCode → transitions to STATE_ROTATED.
 *   "Keep Current Code" → router.back().
 *
 * Paused-code path:
 *   Shows "Your code is paused" heading.
 *   "Resume Code"       → calls resumeSocietyCode → transitions to STATE_RESUMED.
 *   "Rotate to New Code"→ calls rotateSocietyCode → transitions to STATE_ROTATED.
 *
 * Registered as a modal via Stack.Screen options={{ presentation: 'modal' }}
 * in apps/mobile/app/(protected)/_layout.jsx (Plan 08 will add the Stack.Screen
 * entry explicitly; until then Expo Router presents it as a standard push).
 */
export default function CodeRotationScreen() {
  const router = useRouter();
  const { t } = useTranslation("auth");
  const session = useAuthStore((s) => s.session);

  const jwtMeta = session?.user?.app_metadata ?? session?.user?.user_metadata ?? {};
  const societyId = jwtMeta.society_id ?? null;

  // Screen state
  const [screenState, setScreenState] = useState(STATE_LOADING);
  const [currentCode, setCurrentCode] = useState(null);
  const [newCode, setNewCode] = useState(null);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState(null);

  // ---------------------------------------------------------------------------
  // On mount: fetch current code + paused_at
  // ---------------------------------------------------------------------------
  useEffect(() => {
    let cancelled = false;

    async function fetchCode() {
      if (!societyId) {
        setScreenState(STATE_ERROR);
        setError("Society not found. Please go back and try again.");
        return;
      }

      try {
        const supabase = getSupabase();
        const { data, error: fetchErr } = await supabase
          .from("society_codes")
          .select("code, paused_at")
          .eq("society_id", societyId)
          .eq("active", true)
          .maybeSingle();

        if (fetchErr) throw fetchErr;
        if (!cancelled) {
          setCurrentCode(data?.code ?? null);
          setScreenState(data?.paused_at != null ? STATE_PAUSED : STATE_ACTIVE);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err.message ?? "Failed to load society code.");
          setScreenState(STATE_ERROR);
        }
      }
    }

    fetchCode();
    return () => {
      cancelled = true;
    };
  }, [societyId]);

  // ---------------------------------------------------------------------------
  // Action: Rotate
  // ---------------------------------------------------------------------------
  async function handleRotate() {
    if (!societyId || working) return;
    setWorking(true);
    setError(null);
    try {
      const supabase = getSupabase();
      const result = await rotateSocietyCode(supabase, { societyId });
      setNewCode(result.code);
      setScreenState(STATE_ROTATED);
    } catch (err) {
      setError(err.message ?? "Failed to rotate code. Please try again.");
    } finally {
      setWorking(false);
    }
  }

  // ---------------------------------------------------------------------------
  // Action: Resume
  // ---------------------------------------------------------------------------
  async function handleResume() {
    if (!societyId || working) return;
    setWorking(true);
    setError(null);
    try {
      const supabase = getSupabase();
      await resumeSocietyCode(supabase, { societyId });
      setScreenState(STATE_RESUMED);
    } catch (err) {
      setError(err.message ?? "Failed to resume code. Please try again.");
    } finally {
      setWorking(false);
    }
  }

  // ---------------------------------------------------------------------------
  // Share new code via WhatsApp after rotation
  // ---------------------------------------------------------------------------
  async function handleShareNew() {
    if (!newCode) return;
    const joinUrl = `parisar://join?code=${newCode}`;
    const message = t("setup.shareMessage", { link: joinUrl });
    const waUrl = `https://wa.me/?text=${encodeURIComponent(message)}`;
    const canOpen = await Linking.canOpenURL(waUrl).catch(() => false);
    if (canOpen) {
      await Linking.openURL(waUrl);
    } else {
      await Share.share({ message });
    }
  }

  // ---------------------------------------------------------------------------
  // Render helpers
  // ---------------------------------------------------------------------------

  // Code display pill (monospace, heading-size, brand.500)
  function CodePill({ value }) {
    return (
      <View className="bg-neutral-100 rounded-lg p-3 mb-4">
        <Text
          style={{
            fontFamily: Platform.OS === "ios" ? "Courier New" : "monospace",
            fontSize: 20,
            fontWeight: "600",
            letterSpacing: 4,
            color: "#12715A",
            textAlign: "center",
          }}
          selectable
        >
          {value ?? "—"}
        </Text>
      </View>
    );
  }

  // Shared close/dismiss button
  function CloseButton() {
    return (
      <Pressable
        onPress={() => router.back()}
        className="p-2 rounded-full"
        accessibilityRole="button"
        accessibilityLabel="Close"
      >
        <X size={20} color="#737373" />
      </Pressable>
    );
  }

  // ---------------------------------------------------------------------------
  // STATE_LOADING
  // ---------------------------------------------------------------------------
  if (screenState === STATE_LOADING) {
    return (
      <SafeAreaView className="flex-1 bg-white items-center justify-center">
        <ActivityIndicator size="large" color="#12715A" />
      </SafeAreaView>
    );
  }

  // ---------------------------------------------------------------------------
  // STATE_ERROR
  // ---------------------------------------------------------------------------
  if (screenState === STATE_ERROR) {
    return (
      <SafeAreaView className="flex-1 bg-white">
        <View className="flex-row items-center justify-between px-6 pt-4 pb-4">
          <Text className="text-xl font-semibold text-neutral-900">{t("codeRotation.title")}</Text>
          <CloseButton />
        </View>
        <View className="flex-1 items-center justify-center px-6">
          <Text className="text-base text-danger-500 text-center">{error}</Text>
          <Pressable
            onPress={() => router.back()}
            className="mt-6 h-12 px-8 rounded-xl border border-neutral-200 items-center justify-center"
            accessibilityRole="button"
          >
            <Text className="text-base font-semibold text-neutral-900">Go Back</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  // ---------------------------------------------------------------------------
  // STATE_ROTATED — success: show new code + Share + Done
  // ---------------------------------------------------------------------------
  if (screenState === STATE_ROTATED) {
    return (
      <SafeAreaView className="flex-1 bg-white">
        <View className="flex-row items-center justify-between px-6 pt-4 pb-4">
          <Text className="text-xl font-semibold text-success-500">
            {t("codeRotation.successHeading")}
          </Text>
          <CloseButton />
        </View>

        <View className="flex-1 px-6">
          {/* Success icon */}
          <View className="items-center mb-6 mt-4">
            <CheckCircle2 size={48} color="#047857" />
          </View>

          <CodePill value={newCode} />

          {/* Share via WhatsApp */}
          <Pressable
            onPress={handleShareNew}
            className="h-14 rounded-xl items-center justify-center mb-3"
            style={{ backgroundColor: "#16a34a" }}
            accessibilityRole="button"
          >
            <Text className="text-base font-semibold text-white">
              {t("setup.step6.shareWhatsApp")}
            </Text>
          </Pressable>

          {/* Done */}
          <Pressable
            onPress={() => router.back()}
            className="h-12 rounded-xl border border-neutral-200 items-center justify-center"
            accessibilityRole="button"
          >
            <Text className="text-base font-semibold text-neutral-900">Done</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  // ---------------------------------------------------------------------------
  // STATE_RESUMED — success: code is active again
  // ---------------------------------------------------------------------------
  if (screenState === STATE_RESUMED) {
    return (
      <SafeAreaView className="flex-1 bg-white">
        <View className="flex-row items-center justify-between px-6 pt-4 pb-4">
          <Text className="text-xl font-semibold text-neutral-900">{t("codeRotation.title")}</Text>
          <CloseButton />
        </View>

        <View className="flex-1 items-center justify-center px-6">
          <CheckCircle2 size={48} color="#047857" />
          <Text className="text-xl font-semibold text-success-500 mt-4 text-center">
            {t("codeRotation.resumedSuccess")}
          </Text>
          <Pressable
            onPress={() => router.back()}
            className="mt-8 h-12 px-8 rounded-xl bg-brand-500 items-center justify-center"
            accessibilityRole="button"
          >
            <Text className="text-base font-semibold text-white">Done</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  // ---------------------------------------------------------------------------
  // STATE_PAUSED — resume or rotate-to-new
  // ---------------------------------------------------------------------------
  if (screenState === STATE_PAUSED) {
    return (
      <SafeAreaView className="flex-1 bg-white">
        <View className="flex-row items-center justify-between px-6 pt-4 pb-4">
          <Text className="text-xl font-semibold text-neutral-900">
            {t("codeRotation.pausedHeading")}
          </Text>
          <CloseButton />
        </View>

        <View className="flex-1 px-6">
          <CodePill value={currentCode} />

          {/* Paused amber notice */}
          <View className="border border-warning-500 bg-amber-50 rounded-xl p-4 flex-row gap-3 mb-6">
            <AlertTriangle size={20} color="#f59e0b" />
            <Text className="flex-1 text-sm text-neutral-700">
              {t("dashboard.code.pausedAlert")}
            </Text>
          </View>

          {error ? <Text className="text-sm text-danger-500 mb-4">{error}</Text> : null}

          {/* Resume Code — primary brand.500 */}
          <Pressable
            onPress={handleResume}
            disabled={working}
            className="h-14 rounded-xl items-center justify-center mb-3 bg-brand-500"
            accessibilityRole="button"
            accessibilityLabel={t("codeRotation.resume")}
          >
            {working ? (
              <ActivityIndicator size="small" color="#ffffff" />
            ) : (
              <Text className="text-base font-semibold text-white">{t("codeRotation.resume")}</Text>
            )}
          </Pressable>

          {/* Rotate to New Code — outlined danger.500 */}
          <Pressable
            onPress={handleRotate}
            disabled={working}
            className="h-12 rounded-xl border border-danger-500 items-center justify-center"
            accessibilityRole="button"
            accessibilityLabel={t("codeRotation.rotateToNew")}
          >
            {working ? (
              <ActivityIndicator size="small" color="#c81e1e" />
            ) : (
              <Text className="text-base font-semibold text-danger-500">
                {t("codeRotation.rotateToNew")}
              </Text>
            )}
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  // ---------------------------------------------------------------------------
  // STATE_ACTIVE — rotate warning + Generate New / Keep Current
  // ---------------------------------------------------------------------------
  return (
    <SafeAreaView className="flex-1 bg-white">
      {/* Header */}
      <View className="flex-row items-center justify-between px-6 pt-4 pb-4">
        <Text className="text-xl font-semibold text-neutral-900">{t("codeRotation.title")}</Text>
        <CloseButton />
      </View>

      <View className="flex-1 px-6">
        {/* Current code */}
        <CodePill value={currentCode} />

        {/* Warning block */}
        <View className="bg-neutral-100 rounded-xl p-4 flex-row gap-3 mb-6">
          <AlertTriangle size={20} color="#f59e0b" />
          <Text className="flex-1 text-sm text-neutral-700">{t("codeRotation.warning")}</Text>
        </View>

        {error ? <Text className="text-sm text-danger-500 mb-4">{error}</Text> : null}

        {/* Generate New Code — danger.500 destructive primary */}
        <Pressable
          onPress={handleRotate}
          disabled={working}
          className="h-14 rounded-xl items-center justify-center mb-3"
          style={{ backgroundColor: working ? "#d4d4d4" : "#c81e1e" }}
          accessibilityRole="button"
          accessibilityLabel={t("codeRotation.confirm")}
        >
          {working ? (
            <ActivityIndicator size="small" color="#ffffff" />
          ) : (
            <Text className="text-base font-semibold text-white">{t("codeRotation.confirm")}</Text>
          )}
        </Pressable>

        {/* Keep Current Code — outlined secondary */}
        <Pressable
          onPress={() => router.back()}
          disabled={working}
          className="h-12 rounded-xl border border-neutral-200 items-center justify-center"
          accessibilityRole="button"
          accessibilityLabel={t("codeRotation.cancel")}
        >
          <Text className="text-base font-semibold text-neutral-900">
            {t("codeRotation.cancel")}
          </Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}
