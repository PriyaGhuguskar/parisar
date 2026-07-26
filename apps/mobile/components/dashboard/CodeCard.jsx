import { resumeSocietyCode } from "@parisar/api-client";
import * as Clipboard from "expo-clipboard";
import * as Linking from "expo-linking";
import { useRouter } from "expo-router";
import { AlertTriangle, Copy, RotateCcw, Share2 } from "lucide-react-native";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { ActivityIndicator, Platform, Pressable, Share, Text, View } from "react-native";
import { getSupabase } from "../../lib/supabase";

/**
 * CodeCard — Society Code display card for the Secretary dashboard.
 *
 * Props:
 *   code       {string}
 *   societyId  {string}
 *   paused     {boolean}
 *   onResume   {Function}
 */
export function CodeCard({ code, societyId, paused = false, onResume }) {
  const router = useRouter();
  const { t } = useTranslation("auth");
  const [copied, setCopied] = useState(false);
  const [resuming, setResuming] = useState(false);
  const [resumeError, setResumeError] = useState(null);

  async function handleCopy() {
    if (!code) return;
    await Clipboard.setStringAsync(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  async function handleShare() {
    if (!code) return;
    const joinUrl = `parisar://join?code=${code}`;
    const message = t("setup.shareMessage", { link: joinUrl });
    const waUrl = `https://wa.me/?text=${encodeURIComponent(message)}`;

    try {
      const canOpen = await Linking.canOpenURL(waUrl).catch(() => false);
      if (canOpen) {
        await Linking.openURL(waUrl);
      } else if (Share?.share) {
        await Share.share({ message });
      }
    } catch {
      // Share fallback silently ignored — user can copy the code manually
    }
  }

  async function handleResume() {
    if (!societyId) return;
    setResuming(true);
    setResumeError(null);
    try {
      const supabase = getSupabase();
      await resumeSocietyCode(supabase, { societyId });
      if (onResume) onResume();
    } catch (err) {
      setResumeError(err.message ?? "Failed to resume code.");
    } finally {
      setResuming(false);
    }
  }

  // Paused state — amber alert block replaces normal code display
  if (paused) {
    return (
      <View className="bg-white rounded-2xl p-6">
        <Text className="text-xl font-semibold text-neutral-900 mb-4">
          {t("dashboard.code.heading")}
        </Text>

        {/* Amber alert block */}
        <View className="border border-warning-500 bg-amber-50 rounded-xl p-4 mb-4 flex-row items-start gap-3">
          <AlertTriangle size={18} color="#f59e0b" />
          <Text className="flex-1 text-sm text-neutral-700">{t("dashboard.code.pausedAlert")}</Text>
        </View>

        {resumeError ? <Text className="text-sm text-danger-500 mb-3">{resumeError}</Text> : null}

        {/* Resume Code button */}
        <Pressable
          onPress={handleResume}
          disabled={resuming}
          className="h-11 rounded-xl border border-warning-500 items-center justify-center"
          accessibilityRole="button"
          accessibilityLabel={t("codeRotation.resume")}
        >
          {resuming ? (
            <ActivityIndicator size="small" color="#f59e0b" />
          ) : (
            <Text className="text-sm font-semibold text-warning-500">
              {t("codeRotation.resume")}
            </Text>
          )}
        </Pressable>
      </View>
    );
  }

  // Normal (active) state
  return (
    <View className="bg-white rounded-2xl p-6">
      <Text className="text-xl font-semibold text-neutral-900 mb-4">
        {t("dashboard.code.heading")}
      </Text>

      {/* Code display */}
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
          accessibilityLabel={`Society code: ${code}`}
        >
          {code ?? "—"}
        </Text>
      </View>

      {/* Copy + Share buttons */}
      <View className="flex-row gap-3 mb-4">
        {/* Copy */}
        <Pressable
          onPress={handleCopy}
          className="flex-1 h-9 rounded-lg border border-neutral-200 flex-row items-center justify-center gap-1"
          accessibilityRole="button"
          accessibilityLabel="Copy society code"
        >
          <Copy size={16} color={copied ? "#047857" : "#737373"} />
          <Text
            className={`text-sm font-medium ${copied ? "text-success-500" : "text-neutral-600"}`}
          >
            {copied ? t("setup.step6.copied") : t("setup.step6.copyCode")}
          </Text>
        </Pressable>

        {/* Share */}
        <Pressable
          onPress={handleShare}
          className="flex-1 h-9 rounded-lg border border-neutral-200 flex-row items-center justify-center gap-1"
          accessibilityRole="button"
          accessibilityLabel="Share society code"
        >
          <Share2 size={16} color="#737373" />
          <Text className="text-sm font-medium text-neutral-600">
            {t("setup.step6.shareWhatsApp")}
          </Text>
        </Pressable>
      </View>

      {/* Rotate Code link */}
      <Pressable
        onPress={() => router.push("/(protected)/(tabs)/code-rotation")}
        accessibilityRole="button"
        accessibilityLabel="Rotate society code"
        className="items-center"
      >
        <Text className="text-sm font-medium text-danger-500 flex-row items-center">
          <RotateCcw size={14} color="#c81e1e" /> {t("dashboard.code.rotateLink")}
        </Text>
      </Pressable>
    </View>
  );
}
