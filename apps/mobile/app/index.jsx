import { colors } from "@parisar/ui-tokens";
import { Redirect } from "expo-router";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { ActivityIndicator, View } from "react-native";
import { PrimaryButton } from "../components/auth/PrimaryButton";
import { LogoutButton } from "../components/LogoutButton";
import { Text } from "../components/ui/Text";
import { useAuthStore } from "../lib/auth-store";
import { resolveRouteOnce } from "../lib/login-route-gate";
import { clearPinPending, isPinPending } from "../lib/pin-pending";
import { ROUTES, resolvePostLoginRoute } from "../lib/post-login";
import { getSupabase } from "../lib/supabase";

/**
 * Screen 1 — Auth Splash / Loading
 *
 * Shown while the auth store hydrates from SecureStore, then while a signed-in
 * user's destination is worked out. While working, it renders no interactive
 * element (UI-SPEC Screen 1); only a failed resolution shows Retry / Log out.
 *
 * Stack.Protected only blocks routes whose guard is false — it never
 * navigates away from this always-accessible index route — so this screen
 * redirects itself once it knows where to go:
 *   signed out → login
 *   signed in  → wherever resolvePostLoginRoute says (app, wings/flats setup
 *                or onboarding), so an app reopened mid-onboarding resumes it.
 *
 * SINGLE OWNER: this is the only place resolvePostLoginRoute runs (the OTP
 * screen just verifies and marks the PIN step pending — the session it creates
 * sends the user here). resolveRouteOnce collapses re-mounts onto one run, so
 * the claim RPCs inside it run once per login.
 *
 * On failure we show a retry instead of guessing: defaulting to the app would
 * skip the PIN step and onboarding.
 */
export default function SplashScreen() {
  const { t } = useTranslation("auth");
  const loading = useAuthStore((s) => s.loading);
  const session = useAuthStore((s) => s.session);
  const userId = session?.user?.id ?? null;
  const [route, setRoute] = useState(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);

  // biome-ignore lint/correctness/useExhaustiveDependencies: `attempt` re-runs the resolution on Retry
  useEffect(() => {
    // A different user (or a sign-out) must never reuse the last destination.
    setRoute(null);
    setFailed(false);
    if (loading || !userId) return undefined;
    let alive = true;
    resolveRouteOnce(userId, async () => {
      // A login whose PIN step isn't finished goes back through the PIN screen.
      const atLogin = await isPinPending(userId);
      const r = await resolvePostLoginRoute(getSupabase(), { atLogin });
      if (atLogin && !r.startsWith(ROUTES.pin)) await clearPinPending();
      return r;
    })
      .then((r) => {
        if (alive) setRoute(r);
      })
      .catch(() => {
        if (alive) setFailed(true);
      });
    return () => {
      alive = false;
    };
  }, [loading, userId, attempt]);

  if (!loading && !session) return <Redirect href="/(auth)/login" />;
  if (route) return <Redirect href={route} />;

  return (
    <View className="flex-1 items-center justify-center bg-neutral-50 px-6">
      {/* Parisar wordmark — Display / 28px / semibold / brand.500 */}
      <Text className="font-semibold text-brand-500" style={{ fontSize: 28, lineHeight: 32 }}>
        Parisar
      </Text>

      {/* Tagline — Label / 14px / neutral.600 */}
      <Text className="text-sm text-neutral-600 mt-2">Your society, connected</Text>

      {failed ? (
        <View className="w-full gap-3 mt-8 items-center">
          <Text className="text-sm text-danger-500 text-center">{t("auth.networkError")}</Text>
          <PrimaryButton
            label={t("auth.retry", { defaultValue: "Try again" })}
            onPress={() => setAttempt((n) => n + 1)}
          />
          <LogoutButton />
        </View>
      ) : (
        <ActivityIndicator color={colors.brand[500]} size="small" style={{ marginTop: 24 }} />
      )}
    </View>
  );
}
