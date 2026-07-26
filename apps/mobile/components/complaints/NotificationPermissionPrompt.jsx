// NotificationPermissionPrompt — full-screen ask for push notifications.
//
// Visual contract per 04-UI-SPEC.md Screen 4:
//   - Centered card on neutral.50 background
//   - Bell icon 64px brand.500
//   - Heading (28px semibold)
//   - Body (16px neutral.600 centered)
//   - Note (14px neutral.400 centered)
//   - "Enable Notifications" primary CTA (h-14 brand.500 rounded-xl)
//   - "Not now" text link (14px neutral.400)
//
// Behavior:
//   - "Enable" calls Notifications.requestPermissionsAsync().
//     - Granted → onEnable()
//     - Denied  → show inline note (push.permissionDenied)
//   - "Not now" → onSkip()

import * as Notifications from "expo-notifications";
import { Bell } from "lucide-react-native";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { ActivityIndicator, Pressable, Text, View } from "react-native";

/**
 * @param {{ onEnable: () => void, onSkip: () => void }} props
 */
export function NotificationPermissionPrompt({ onEnable, onSkip }) {
  const { t } = useTranslation("complaints");
  const [requesting, setRequesting] = useState(false);
  const [deniedNote, setDeniedNote] = useState(null);

  async function handleEnable() {
    if (requesting) return;
    setDeniedNote(null);
    setRequesting(true);
    try {
      const { status } = await Notifications.requestPermissionsAsync();
      if (status === "granted") {
        onEnable?.();
      } else {
        setDeniedNote(t("push.permissionDenied"));
      }
    } catch (err) {
      setDeniedNote(t("push.permissionDenied"));
      console.warn("[NotificationPermissionPrompt] request failed:", err?.message ?? err);
    } finally {
      setRequesting(false);
    }
  }

  return (
    <View className="flex-1 bg-neutral-50 items-center justify-center px-4">
      <View className="bg-white rounded-2xl p-8 w-full items-center">
        <Bell size={64} color="#12715A" />

        <Text
          className="text-2xl font-semibold text-neutral-900 text-center mt-6"
          style={{ fontSize: 28, lineHeight: 32 }}
        >
          {t("push.permissionHeading")}
        </Text>

        <Text className="text-base text-neutral-600 text-center mt-4" style={{ lineHeight: 24 }}>
          {t("push.permissionBody")}
        </Text>

        <Text className="text-sm text-neutral-400 text-center mt-4">
          {t("push.permissionNote")}
        </Text>

        {deniedNote ? (
          <Text className="text-sm text-neutral-600 text-center mt-4" accessibilityRole="alert">
            {deniedNote}
          </Text>
        ) : null}

        <View className="w-full mt-8 gap-4">
          <Pressable
            onPress={handleEnable}
            disabled={requesting}
            className={`h-14 w-full rounded-xl items-center justify-center ${
              requesting ? "bg-neutral-200" : "bg-brand-500 active:bg-brand-600"
            }`}
            accessibilityRole="button"
            accessibilityLabel={t("push.enableCta")}
            accessibilityState={{ busy: requesting }}
          >
            {requesting ? (
              <ActivityIndicator color="#ffffff" />
            ) : (
              <Text className="text-base font-semibold text-white">{t("push.enableCta")}</Text>
            )}
          </Pressable>

          <Pressable
            onPress={onSkip}
            disabled={requesting}
            className="h-12 items-center justify-center"
            accessibilityRole="button"
            accessibilityLabel={t("push.skipCta")}
          >
            <Text className="text-sm text-neutral-400">{t("push.skipCta")}</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}
