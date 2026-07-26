import { create } from "zustand";
import { unregisterPushTokenForDevice } from "./push-registration";
import { getSupabase } from "./supabase";

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
        set({ session, loading: false });
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
      set({ session, loading: false });
    });
    return () => subscription.unsubscribe();
  },

  signOut: async () => {
    const supabase = getSupabase();
    try {
      // T-04.1-02 mitigation: revoke this device's push token BEFORE clearing
      // the session, so subsequent push deliveries don't reach a signed-out device.
      await unregisterPushTokenForDevice(supabase);
    } catch (err) {
      // Defensive: don't block sign-out on push cleanup failure (network issues etc.).
      console.warn("[auth-store] push token revoke failed:", err?.message ?? err);
    }
    await supabase.auth.signOut();
    set({ session: null });
  },
}));
