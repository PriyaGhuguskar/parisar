import { createClient } from "@supabase/supabase-js";
import Constants from "expo-constants";
import * as Notifications from "expo-notifications";
import { create } from "zustand";
import { useDashboardSummary } from "./dashboard-summary-store";
import { resetRouteGate } from "./login-route-gate";
import { getSupabase } from "./supabase";
import { withTokenClaims } from "./token-claims";

// Push-token cleanup may never hold up sign-out longer than this.
export const PUSH_UNREGISTER_TIMEOUT_MS = 3000;

function withTimeout(promise, ms) {
  let timer;
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error("TIMEOUT")), ms);
    }),
  ]).finally(() => clearTimeout(timer));
}

/**
 * A throwaway client that acts as the signed-out user for one last request.
 * The access token stays valid until it expires even after signOut revokes
 * the refresh token, which is what lets us clean up AFTER signing out.
 */
function clientForToken(supabase, accessToken) {
  const url = supabase?.supabaseUrl;
  const key = supabase?.supabaseKey;
  if (!url || !key || !accessToken) return null;
  return createClient(url, key, {
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}

/**
 * Revoke THIS device's Expo push token via unregister_push_token (migration
 * 055 — deletes only the caller's own row). No-op without a project id/token.
 */
async function revokeDevicePushToken(client) {
  const projectId =
    Constants.expoConfig?.extra?.eas?.projectId ?? Constants.expoConfig?.extra?.projectId ?? null;
  if (!projectId) return;
  const tokenData = await Notifications.getExpoPushTokenAsync({ projectId });
  const expoToken = tokenData?.data ?? null;
  if (!expoToken) return;
  const { error } = await client.rpc("unregister_push_token", { p_token: expoToken });
  if (error) throw error;
}

/** Forget every per-user cache so the next account starts clean. */
function resetUserCaches() {
  try {
    useDashboardSummary.getState().reset?.();
  } catch {
    // ignore
  }
  resetRouteGate();
  try {
    // Lazy: use-my-context imports this store, so a static import would cycle.
    require("./use-my-context").resetMyContext?.();
  } catch {
    // ignore
  }
}

// Auth store. `loading` stays true until the initial SecureStore session check
// completes — the root layout renders the splash during that window to avoid the
// login-screen flash (RESEARCH.md Pitfall 3).
export const useAuthStore = create((set) => ({
  session: null,
  loading: true,

  initialize: () => {
    const supabase = getSupabase();
    supabase.auth
      .getSession()
      .then(({ data: { session } }) => {
        set({ session: withTokenClaims(session), loading: false });
      })
      .catch((err) => {
        // PAR-102: a corrupted/undecryptable SecureStore session must NOT hang the
        // splash forever. Fail open to signed-out so the login screen renders.
        console.warn("[auth-store] getSession failed:", err?.message ?? err);
        set({ session: null, loading: false });
      });
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      // Token claims (society_id, role) live in the access token, not the user
      // record — merge them so every screen's app_metadata reads work.
      set({ session: withTokenClaims(session), loading: false });
    });
    return () => subscription.unsubscribe();
  },

  signOut: async () => {
    const supabase = getSupabase();
    // Capture the token first: after signOut the client has no session.
    let accessToken = null;
    try {
      const { data } = await supabase.auth.getSession();
      accessToken = data?.session?.access_token ?? null;
    } catch {
      // ignore — sign-out still proceeds
    }

    // Sign out FIRST: nothing (a slow or offline push cleanup) may keep the
    // user signed in on this device.
    try {
      await supabase.auth.signOut();
    } catch (err) {
      console.warn("[auth-store] signOut failed:", err?.message ?? err);
    }
    set({ session: null });
    resetUserCaches();

    // T-04.1-02: then revoke this device's push token, best-effort and bounded,
    // as the user who just left (their access token is still valid).
    const scoped = clientForToken(supabase, accessToken);
    if (scoped) {
      try {
        await withTimeout(revokeDevicePushToken(scoped), PUSH_UNREGISTER_TIMEOUT_MS);
      } catch (err) {
        console.warn("[auth-store] push token revoke failed:", err?.message ?? err);
      }
    }
  },
}));
