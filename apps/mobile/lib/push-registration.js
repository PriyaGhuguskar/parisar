// push-registration.js — request OS permission, get Expo push token, upsert push_tokens.
//
// Call from the root layout AFTER the user's session is confirmed (otherwise
// registerPushToken returns null because auth.getUser() has no user).
//
// SIGN-OUT NOTE (documented for callers):
//   On user-initiated sign-out, the caller should delete the push_tokens row for
//   THIS device's expoToken so notifications stop being sent to it. This file does
//   not handle sign-out — the auth-store or logout button is the right surface for that.
//
// Pattern source: 04-RESEARCH.md Pattern 7. Plain JS (no TypeScript per project rule).

import { registerPushToken } from "@parisar/api-client";
import Constants from "expo-constants";
import * as Notifications from "expo-notifications";
import { Platform } from "react-native";

/**
 * Request notification permission, fetch the Expo push token, and upsert it
 * into the push_tokens table for the current user.
 *
 * Idempotent: safe to call on every app launch — the upsert (onConflict on
 * expo_token) refreshes last_seen_at and keeps notifications_enabled=true.
 *
 * Behavior matrix:
 *   - Permission denied (already)       → returns null, no nag
 *   - Permission denied at OS prompt    → returns null, no nag
 *   - No EAS projectId (local dev)      → returns null with console.warn
 *   - No authenticated user             → registerPushToken returns null
 *   - Success                            → returns the expo push token string
 *
 * @param {object} supabase - Authenticated supabase-js client
 * @returns {Promise<string|null>}
 */
export async function registerForPushNotifications(supabase) {
  try {
    // 1. Check existing permission, request if undetermined.
    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;
    if (existingStatus !== "granted") {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }
    if (finalStatus !== "granted") {
      // Silent: caller decides if it wants to surface a banner (Screen 4
      // permission prompt handles the explicit ask).
      return null;
    }

    // 2. Determine EAS projectId — required for getExpoPushTokenAsync.
    // Local dev without EAS configured can't generate a real token; gracefully no-op.
    const projectId =
      Constants.expoConfig?.extra?.eas?.projectId ?? Constants.expoConfig?.extra?.projectId ?? null;

    if (!projectId) {
      console.warn(
        "[push-registration] No EAS projectId in expoConfig.extra — skipping push token registration. " +
          "This is expected in local dev without EAS.",
      );
      return null;
    }

    // 3. Get the Expo push token.
    const tokenData = await Notifications.getExpoPushTokenAsync({ projectId });
    const expoToken = tokenData?.data ?? null;
    if (!expoToken) return null;

    // 4. Upsert via the api-client helper (server-side fetches user_id; T-04-14 mitigation).
    const platform = Platform.OS === "ios" ? "ios" : "android";
    await registerPushToken(supabase, { expoToken, platform });

    return expoToken;
  } catch (err) {
    // Push is non-critical: never crash the app on token registration failure.
    console.warn("[push-registration] failed:", err?.message ?? err);
    return null;
  }
}

/**
 * Delete this device's push token from push_tokens on user sign-out.
 * No-op if no token has been registered yet on this device.
 *
 * @param {object} supabase
 * @returns {Promise<void>}
 */
export async function unregisterPushTokenForDevice(supabase) {
  try {
    const projectId =
      Constants.expoConfig?.extra?.eas?.projectId ?? Constants.expoConfig?.extra?.projectId ?? null;
    if (!projectId) return;

    const tokenData = await Notifications.getExpoPushTokenAsync({ projectId });
    const expoToken = tokenData?.data ?? null;
    if (!expoToken) return;

    await supabase.from("push_tokens").delete().eq("expo_token", expoToken);
  } catch (err) {
    console.warn("[push-registration] unregister failed:", err?.message ?? err);
  }
}
