import "../global.css";
import { ensureNotificationPreferences } from "@parisar/api-client";
import * as Notifications from "expo-notifications";
import { router, Stack, useRootNavigationState, useSegments } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { I18nextProvider } from "react-i18next";
import { useAuthStore } from "../lib/auth-store";
import { getI18n, initI18n } from "../lib/i18n";
import { routeForNotification } from "../lib/notification-route";
import { registerForPushNotifications, shouldShowPushExplainer } from "../lib/push-registration";
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
 *   - useLastNotificationResponse catches taps — including the one that cold-
 *     started the app — and, once the user is signed in and inside the app
 *     tabs (past the splash / PIN / onboarding), opens the validated route
 *     (lib/notification-route.js). Each response is handled once.
 *   - registerForPushNotifications runs once per signed-in user and only
 *     registers when the OS permission is ALREADY granted; the permission
 *     prompt itself lives on notifications/permission. Signing out clears the
 *     guard so the next sign-in registers again.
 *   - usePushExplainer opens notifications/permission once for a user whose
 *     OS permission is still undetermined.
 */

// Foreground display rules — apply immediately at module load.
// Banner + list keep the notification visible even when the app is open
// (the user files a complaint and the board responds while they're still on screen).
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

/** Stable id for a notification response so a tap is only handled once. */
function responseKey(response) {
  const n = response?.notification;
  return `${n?.request?.identifier ?? ""}:${n?.date ?? ""}:${response?.actionIdentifier ?? ""}`;
}

/**
 * Open the screen a tapped notification points to — once the navigator is
 * mounted, auth has hydrated and the user is inside the app tabs.
 */
function useNotificationTapRouting({ loading, session }) {
  const lastResponse = Notifications.useLastNotificationResponse();
  const navState = useRootNavigationState();
  const segments = useSegments();
  const handledRef = useRef(null);
  const inApp = segments[0] === "(protected)" && segments[1] === "(tabs)";
  const navReady = Boolean(navState?.key);

  useEffect(() => {
    if (!lastResponse || loading || !session || !navReady || !inApp) return;
    if (lastResponse.actionIdentifier !== Notifications.DEFAULT_ACTION_IDENTIFIER) return;
    const key = responseKey(lastResponse);
    if (handledRef.current === key) return;
    handledRef.current = key;
    const route = routeForNotification(lastResponse.notification?.request?.content?.data);
    if (route) router.push(route);
  }, [lastResponse, loading, session, navReady, inApp]);
}

/**
 * Register this device's push token once per signed-in user (silently — only
 * when permission is already granted) and provision notification preferences.
 */
function usePushRegistration(session) {
  const registeredForUserRef = useRef(null);
  const userId = session?.user?.id ?? null;
  const societyId = session?.user?.app_metadata?.society_id ?? null;

  useEffect(() => {
    if (!userId) {
      // Signed out: the next sign-in (same or another user) registers again.
      registeredForUserRef.current = null;
      return;
    }
    if (registeredForUserRef.current === userId) return;
    registeredForUserRef.current = userId;

    const supabase = getSupabase();
    // Fire-and-forget — never blocks UI; the helper handles its own errors.
    registerForPushNotifications(supabase);

    // D-05 — idempotently provision the notification_preferences row for this
    // user + active society. The preferences screen also calls this on mount.
    if (societyId) {
      ensureNotificationPreferences(supabase, societyId).catch((err) => {
        console.warn("[root-layout] ensureNotificationPreferences failed:", err?.message ?? err);
      });
    }
  }, [userId, societyId]);
}

const PUSH_EXPLAINER_ROUTE = "/(protected)/(tabs)/notifications/permission";

/**
 * Once per signed-in user, when they reach the app tabs and the OS has never
 * been asked, open the notifications explainer (the only place the OS prompt
 * is shown). "Not now" / "Enable" there mark it seen for good.
 */
function usePushExplainer(session) {
  const segments = useSegments();
  const navState = useRootNavigationState();
  const checkedForUserRef = useRef(null);
  const userId = session?.user?.id ?? null;
  const inApp = segments[0] === "(protected)" && segments[1] === "(tabs)";
  const navReady = Boolean(navState?.key);

  useEffect(() => {
    if (!userId) {
      checkedForUserRef.current = null;
      return undefined;
    }
    if (!inApp || !navReady || checkedForUserRef.current === userId) return undefined;
    checkedForUserRef.current = userId;
    let alive = true;
    shouldShowPushExplainer().then((show) => {
      if (alive && show) router.push(PUSH_EXPLAINER_ROUTE);
    });
    return () => {
      alive = false;
    };
  }, [userId, inApp, navReady]);
}

export default function RootLayout() {
  const session = useAuthStore((s) => s.session);
  const loading = useAuthStore((s) => s.loading);
  const initialize = useAuthStore((s) => s.initialize);

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

  useNotificationTapRouting({ loading, session });
  usePushRegistration(session);
  usePushExplainer(session);

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

        {/* Guards name the route GROUPS — (auth) and (protected) each have their
            own _layout.jsx, so "(auth)/login"-style names never matched and the
            guards did nothing (signing out left you on the screen you were on).
            When a guard turns false, expo-router sends the user back to the
            index anchor, which routes them (login, or where they belong). */}
        <Stack.Protected guard={!loading && !isSignedIn}>
          <Stack.Screen name="(auth)" />
        </Stack.Protected>

        {/* Everything signed-in: tabs, onboarding, wings/flats setup, staff. */}
        <Stack.Protected guard={!loading && isSignedIn}>
          <Stack.Screen name="(protected)" />
        </Stack.Protected>
      </Stack>
    </I18nextProvider>
  );
}
