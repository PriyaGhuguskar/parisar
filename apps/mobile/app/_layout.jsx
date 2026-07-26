import "../global.css";
import { ensureNotificationPreferences } from "@parisar/api-client";
import * as Notifications from "expo-notifications";
import { router, Stack } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { I18nextProvider } from "react-i18next";
import { useAuthStore } from "../lib/auth-store";
import { getI18n, initI18n } from "../lib/i18n";
import { registerForPushNotifications } from "../lib/push-registration";
import { getSupabase } from "../lib/supabase";

/**
 * Root layout — Stack.Protected auth guard + push notification wiring.
 *
 * Auth:
 *   `loading` stays true until the SecureStore session check completes.
 *   While loading, only `index` (the splash screen) is accessible — this
 *   prevents the login-screen flash (RESEARCH.md Pitfall 3).
 *
 *   Once loading completes:
 *   - isSignedIn = false → only (auth) routes are accessible
 *   - isSignedIn = true  → only (protected) routes are accessible
 *   Stack.Protected automatically redirects to the index anchor when guard = false.
 *
 * Push:
 *   - setNotificationHandler controls in-foreground display.
 *   - addNotificationResponseReceivedListener catches taps (app in background or killed)
 *     and deep-links to /complaints/{complaintId} via Expo Router.
 *   - registerForPushNotifications is invoked once a live session is detected
 *     (it self-guards if no projectId or no auth user; non-fatal on failure).
 */

// Foreground display rules — apply immediately at module load.
// shouldShowAlert: true keeps the banner visible even when the app is open
// (the user files a complaint and the board responds while they're still on screen).
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

export default function RootLayout() {
  const session = useAuthStore((s) => s.session);
  const loading = useAuthStore((s) => s.loading);
  const initialize = useAuthStore((s) => s.initialize);

  const pushRegisteredForUserRef = useRef(null);

  // Phase 7 Plan 07-03: i18n runtime readiness.
  // Holds the Stack from mounting until i18next has its default-namespace
  // bundle resident, so the first paint never flashes raw key strings.
  // The splash anchor (`index.jsx`) handles the empty UI while we wait.
  const [i18nReady, setI18nReady] = useState(false);
  useEffect(() => {
    let cancelled = false;
    initI18n()
      .then(() => {
        if (!cancelled) setI18nReady(true);
      })
      .catch((err) => {
        // Never block the app on i18n init failure — fall through with the
        // i18next instance still null. useTranslation() returns keys; the
        // user sees the dotted-path string which is louder than a hang.
        console.warn("[root-layout] initI18n failed:", err?.message ?? err);
        if (!cancelled) setI18nReady(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const unsubscribe = initialize();
    return unsubscribe;
  }, [initialize]);

  // Notification tap → deep-link to the originating screen.
  // Phase 5 fan-out functions (notification-fanout, booking-ack-fanout) put a
  // ready-to-use absolute `screen` path in the payload (notices/polls/bookings).
  // Phase 4's push-fanout predates that and only carries `complaintId`.
  useEffect(() => {
    const subscription = Notifications.addNotificationResponseReceivedListener((response) => {
      const data = response?.notification?.request?.content?.data;
      if (data?.screen) {
        router.push(data.screen);
      } else if (data?.complaintId) {
        // Legacy Phase 4 payload — absolute path resolves inside the (protected) group.
        router.push(`/(protected)/(tabs)/complaints/${data.complaintId}`);
      }
    });
    return () => subscription.remove();
  }, []);

  // Register push token once a session is confirmed.
  // Guard with a ref so we don't re-register on every auth state event
  // (e.g. token refresh fires onAuthStateChange).
  useEffect(() => {
    const userId = session?.user?.id ?? null;
    if (!userId) return;
    if (pushRegisteredForUserRef.current === userId) return;

    pushRegisteredForUserRef.current = userId;
    const supabase = getSupabase();
    // Fire-and-forget — never blocks UI; helper handles its own errors.
    registerForPushNotifications(supabase);

    // D-05 — idempotently provision the notification_preferences row for this
    // user + active society on first login. Fire-and-forget: the UPSERT uses
    // ignoreDuplicates so a re-login is a true no-op, and the preferences screen
    // also calls this on mount as a backstop. Guarded behind the same ref so it
    // only runs once per signed-in user.
    const societyId = session?.user?.app_metadata?.society_id ?? null;
    if (societyId) {
      ensureNotificationPreferences(supabase, societyId).catch((err) => {
        console.warn("[root-layout] ensureNotificationPreferences failed:", err?.message ?? err);
      });
    }
  }, [session]);

  const isSignedIn = !!session;

  // Hold the tree (rendered as null — splash screen still owns the pixels)
  // until i18next has its default-namespace bundle resident.
  if (!i18nReady) return null;

  const i18n = getI18n();

  return (
    <I18nextProvider i18n={i18n}>
      <Stack screenOptions={{ headerShown: false }}>
        {/* index.jsx is the splash anchor — shown while `loading` is true */}
        <Stack.Screen name="index" />

        {/* Auth routes — only accessible when NOT signed in (and not loading) */}
        <Stack.Protected guard={!loading && !isSignedIn}>
          <Stack.Screen name="(auth)/login" />
          <Stack.Screen name="(auth)/verify" />
        </Stack.Protected>

        {/* Protected routes — only accessible when signed in (and not loading).
            Post-onboard screens live inside (protected)/(tabs)/ so the bottom-nav
            stays visible across every reachable screen (Plan 04.1-02 Option A).
            The bootstrap flows (onboard, setup, join) remain at the Stack level
            because they intentionally render without a tab bar. */}
        <Stack.Protected guard={!loading && isSignedIn}>
          <Stack.Screen name="(protected)/(tabs)" />
          <Stack.Screen name="(protected)/onboard" />
          <Stack.Screen name="(protected)/setup" />
          <Stack.Screen name="(protected)/join" />
        </Stack.Protected>
      </Stack>
    </I18nextProvider>
  );
}
