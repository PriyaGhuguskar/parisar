// /(protected)/notifications/permission — full-screen push permission ask.
//
// Per 04-UI-SPEC.md Screen 4:
//   - Renders <NotificationPermissionPrompt /> centered.
//   - Auto-skips if permission is already granted (no nag).
//   - "Not now" persists a flag to AsyncStorage so we don't re-prompt next launch.
//   - On grant, registers the push token with Supabase via the api-client helper.
//
// Routing: navigated to from dashboard or post-onboarding flow. After action,
// router.replace('/(protected)/dashboard') so back-button doesn't return here.

import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Notifications from "expo-notifications";
import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { ActivityIndicator, View } from "react-native";
import { NotificationPermissionPrompt } from "../../../../components/complaints/NotificationPermissionPrompt";
import { registerForPushNotifications } from "../../../../lib/push-registration";
import { getSupabase } from "../../../../lib/supabase";

const NOTIF_PROMPT_SEEN_KEY = "notif_prompt_seen";

export default function NotificationPermissionScreen() {
  const router = useRouter();
  const [checking, setChecking] = useState(true);

  // On mount: if permission was already decided, skip straight to dashboard.
  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const { status } = await Notifications.getPermissionsAsync();
        if (!active) return;
        if (status === "granted" || status === "denied") {
          // Already decided — never re-prompt.
          router.replace("/(protected)/(tabs)");
          return;
        }
        setChecking(false);
      } catch (err) {
        // On unexpected error, fall through to dashboard.
        console.warn("[notifications/permission] getPermissionsAsync failed:", err?.message ?? err);
        if (active) router.replace("/(protected)/(tabs)");
      }
    })();
    return () => {
      active = false;
    };
  }, [router]);

  async function handleEnable() {
    try {
      // Fire-and-forget — non-blocking. The helper checks permission again internally.
      registerForPushNotifications(getSupabase());
    } catch (err) {
      console.warn("[notifications/permission] register failed:", err?.message ?? err);
    }
    router.replace("/(protected)/(tabs)");
  }

  async function handleSkip() {
    try {
      await AsyncStorage.setItem(NOTIF_PROMPT_SEEN_KEY, "true");
    } catch {
      // AsyncStorage failure is non-critical; the worst case is we re-prompt next launch.
    }
    router.replace("/(protected)/(tabs)");
  }

  if (checking) {
    return (
      <View className="flex-1 bg-neutral-50 items-center justify-center">
        <ActivityIndicator size="large" color="#12715A" />
      </View>
    );
  }

  return <NotificationPermissionPrompt onEnable={handleEnable} onSkip={handleSkip} />;
}

// Export the storage key so other screens (dashboard) can check whether the prompt has been seen.
export { NOTIF_PROMPT_SEEN_KEY };
