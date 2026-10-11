import { colors } from "@parisar/ui-tokens";
import { Redirect } from "expo-router";
import { useEffect, useState } from "react";
import { ActivityIndicator, Text, View } from "react-native";
import { useAuthStore } from "../lib/auth-store";
import { clearPinPending, isPinPending } from "../lib/pin-pending";
import { ROUTES, resolvePostLoginRoute } from "../lib/post-login";
import { getSupabase } from "../lib/supabase";

/**
 * Screen 1 — Auth Splash / Loading
 *
 * Shown while the auth store hydrates from SecureStore, then while a signed-in
 * user's destination is worked out. It must NEVER render an interactive
 * element (UI-SPEC Screen 1).
 *
 * Stack.Protected only blocks routes whose guard is false — it never
 * navigates away from this always-accessible index route — so this screen
 * redirects itself once it knows where to go:
 *   signed out → login
 *   signed in  → wherever resolvePostLoginRoute says (app, wings/flats setup
 *                or onboarding), so an app reopened mid-onboarding resumes it.
 */
export default function SplashScreen() {
  const loading = useAuthStore((s) => s.loading);
  const session = useAuthStore((s) => s.session);
  const userId = session?.user?.id ?? null;
  const [route, setRoute] = useState(null);

  useEffect(() => {
    // A different user (or a sign-out) must never reuse the last destination.
    setRoute(null);
    if (loading || !userId) return undefined;
    let alive = true;
    (async () => {
      // A login whose PIN step isn't finished goes back through the PIN screen.
      const atLogin = await isPinPending(userId);
      const r = await resolvePostLoginRoute(getSupabase(), { atLogin });
      if (atLogin && !r.startsWith(ROUTES.pin)) await clearPinPending();
      return r;
    })()
      .then((r) => {
        if (alive) setRoute(r);
      })
      .catch(() => {
        // Offline / transient error: open the app; its screens show their
        // own retry states.
        if (alive) setRoute(ROUTES.app);
      });
    return () => {
      alive = false;
    };
  }, [loading, userId]);

  if (!loading && !session) return <Redirect href="/(auth)/login" />;
  if (route) return <Redirect href={route} />;

  return (
    <View className="flex-1 items-center justify-center bg-neutral-50">
      {/* Parisar wordmark — Display / 28px / semibold / brand.500 */}
      <Text className="font-semibold text-brand-500" style={{ fontSize: 28, lineHeight: 32 }}>
        Parisar
      </Text>

      {/* Tagline — Label / 14px / neutral.600 */}
      <Text className="text-sm text-neutral-600 mt-2">Your society, connected</Text>

      <ActivityIndicator color={colors.brand[500]} size="small" style={{ marginTop: 24 }} />
    </View>
  );
}
