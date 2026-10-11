// /(protected)/notifications/permission — full-screen push permission ask.
//
// Per 04-UI-SPEC.md Screen 4:
//   - Renders <NotificationPermissionPrompt /> centered.
//   - Auto-skips if permission is already decided (no nag).
//   - "Not now" persists a flag to AsyncStorage so we don't re-prompt next launch.
//   - "Enable" is the ONLY place the OS permission prompt is shown; on grant the
//     push token is registered via the register_push_token RPC.
//
// Routing: the Home screen opens this once (shouldShowPushExplainer) for a
// signed-in user whose OS permission is still undetermined. After action,
// router.replace(Home) so the back button doesn't return here.

import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { ActivityIndicator, View } from "react-native";
import { NotificationPermissionPrompt } from "../../../../components/complaints/NotificationPermissionPrompt";
import { HOME_ROUTE } from "../../../../lib/navigation";
import {
  getPushPermissionStatus,
  markPushExplainerSeen,
  NOTIF_PROMPT_SEEN_KEY,
  registerForPushNotifications,
} from "../../../../lib/push-registration";
import { getSupabase } from "../../../../lib/supabase";

export default function NotificationPermissionScreen() {
  const router = useRouter();
  const [checking, setChecking] = useState(true);
  const [busy, setBusy] = useState(false);

  // On mount: if permission was already decided, skip straight to Home.
  useEffect(() => {
    let active = true;
    (async () => {
      const status = await getPushPermissionStatus();
      if (!active) return;
      if (status === "granted" || status === "denied") {
        // Already decided — never re-prompt.
        router.replace(HOME_ROUTE);
        return;
      }
      setChecking(false);
    })();
    return () => {
      active = false;
    };
  }, [router]);

  async function handleEnable() {
    if (busy) return;
    setBusy(true);
    await markPushExplainerSeen();
    // Shows the OS prompt, then registers the token when granted. Never throws.
    await registerForPushNotifications(getSupabase(), { prompt: true });
    router.replace(HOME_ROUTE);
  }

  async function handleSkip() {
    await markPushExplainerSeen();
    router.replace(HOME_ROUTE);
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

// Re-exported for screens that imported the key from here before it moved to lib.
export { NOTIF_PROMPT_SEEN_KEY };
