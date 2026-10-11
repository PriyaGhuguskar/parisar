// push-registration.js — OS notification permission + Expo push token registration.
//
// registerForPushNotifications() never shows the OS prompt by itself: the app
// registers silently at sign-in only when permission is ALREADY granted. The
// explicit ask lives on the notifications/permission explainer screen, which
// passes { prompt: true }.
//
// The token is stored through the register_push_token RPC (migration 055) —
// direct push_tokens writes are not used any more. (packages/api-client
// registerPushToken still upserts the table; it is not called from here.)
//
// SIGN-OUT: lib/auth-store.js revokes this device's token via
// unregister_push_token; unregisterPushTokenForDevice below is the same call for
// any other caller (call it BEFORE signOut while the session is still valid).
//
// Plain JS (no TypeScript per project rule).

import AsyncStorage from "@react-native-async-storage/async-storage";
import Constants from "expo-constants";
import * as Notifications from "expo-notifications";
import { Platform } from "react-native";

function easProjectId() {
  return (
    Constants.expoConfig?.extra?.eas?.projectId ?? Constants.expoConfig?.extra?.projectId ?? null
  );
}

/** "granted" | "denied" | "undetermined" (or the raw status), never throws. */
export async function getPushPermissionStatus() {
  try {
    const { status } = await Notifications.getPermissionsAsync();
    return status ?? "undetermined";
  } catch {
    return "undetermined";
  }
}

/**
 * Get the Expo push token and register it for the signed-in user.
 *
 * Behavior matrix:
 *   - Permission not granted, prompt=false → returns null (no OS prompt)
 *   - Permission undetermined, prompt=true → shows the OS prompt first
 *   - Permission denied                    → returns null, no nag
 *   - No EAS projectId (local dev)         → returns null with console.warn
 *   - RPC error (signed out, bad token)    → returns null with console.warn
 *   - Success                              → returns the expo push token string
 *
 * @param {object} supabase - Authenticated supabase-js client
 * @param {{ prompt?: boolean }} [opts]
 * @returns {Promise<string|null>}
 */
export async function registerForPushNotifications(supabase, { prompt = false } = {}) {
  try {
    let status = await getPushPermissionStatus();
    if (status !== "granted" && prompt && status !== "denied") {
      const res = await Notifications.requestPermissionsAsync();
      status = res?.status;
    }
    if (status !== "granted") return null;

    // Local dev without EAS configured can't generate a real token; no-op.
    const projectId = easProjectId();
    if (!projectId) {
      console.warn(
        "[push-registration] No EAS projectId in expoConfig.extra — skipping push token registration. " +
          "This is expected in local dev without EAS.",
      );
      return null;
    }

    const tokenData = await Notifications.getExpoPushTokenAsync({ projectId });
    const expoToken = tokenData?.data ?? null;
    if (!expoToken) return null;

    const platform = Platform.OS === "ios" ? "ios" : "android";
    const { error } = await supabase.rpc("register_push_token", {
      p_token: expoToken,
      p_platform: platform,
      p_device_label: Constants.deviceName ?? null,
    });
    if (error) throw error;
    return expoToken;
  } catch (err) {
    // Push is non-critical: never crash the app on token registration failure.
    console.warn("[push-registration] failed:", err?.message ?? err);
    return null;
  }
}

/**
 * Remove this device's push token for the current user (unregister_push_token
 * deletes only the caller's own row). No-op without a project id / token.
 *
 * @param {object} supabase
 * @returns {Promise<void>}
 */
export async function unregisterPushTokenForDevice(supabase) {
  try {
    const projectId = easProjectId();
    if (!projectId) return;

    const tokenData = await Notifications.getExpoPushTokenAsync({ projectId });
    const expoToken = tokenData?.data ?? null;
    if (!expoToken) return;

    const { error } = await supabase.rpc("unregister_push_token", { p_token: expoToken });
    if (error) throw error;
  } catch (err) {
    console.warn("[push-registration] unregister failed:", err?.message ?? err);
  }
}

// ---------------------------------------------------------------------------
// One-time permission explainer (notifications/permission screen)
// ---------------------------------------------------------------------------

/** AsyncStorage flag: the explainer was shown (enabled or "Not now"). */
export const NOTIF_PROMPT_SEEN_KEY = "notif_prompt_seen";

/**
 * True when the OS has not been asked yet and the user has not dismissed the
 * explainer before — the Home screen then opens notifications/permission once.
 * @returns {Promise<boolean>}
 */
export async function shouldShowPushExplainer() {
  try {
    const status = await getPushPermissionStatus();
    if (status !== "undetermined") return false;
    const seen = await AsyncStorage.getItem(NOTIF_PROMPT_SEEN_KEY);
    return seen !== "true";
  } catch {
    return false;
  }
}

/** Remember that the explainer was shown so it never nags again. */
export async function markPushExplainerSeen() {
  try {
    await AsyncStorage.setItem(NOTIF_PROMPT_SEEN_KEY, "true");
  } catch {
    // Non-critical: worst case the explainer shows once more.
  }
}
