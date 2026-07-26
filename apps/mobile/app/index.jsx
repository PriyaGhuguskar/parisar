import { colors } from "@parisar/ui-tokens";
import { ActivityIndicator, Text, View } from "react-native";
import { useAuthStore } from "../lib/auth-store";

/**
 * Screen 1 — Auth Splash / Loading
 *
 * Shown while the Zustand auth store hydrates from SecureStore.
 * `loading: true`  → show wordmark + spinner (this screen)
 * `loading: false` → Stack.Protected guards in _layout.jsx redirect to
 *                    the correct route (login or dashboard)
 *
 * This screen must NEVER render an interactive element. It is purely a
 * loading interstitial (UI-SPEC Screen 1).
 */
export default function SplashScreen() {
  // Read loading state — the Stack.Protected guard handles redirects once loaded
  const loading = useAuthStore((s) => s.loading);

  // Always render the splash — _layout.jsx shows this screen while loading.
  // If somehow we get here after loading, the guard will redirect shortly.
  return (
    <View className="flex-1 items-center justify-center bg-neutral-50">
      {/* Parisar wordmark — Display / 28px / semibold / brand.500 */}
      <Text className="font-semibold text-brand-500" style={{ fontSize: 28, lineHeight: 32 }}>
        Parisar
      </Text>

      {/* Tagline — Label / 14px / neutral.600 */}
      <Text className="text-sm text-neutral-600 mt-2">Your society, connected</Text>

      {/* Loading spinner */}
      {loading && (
        <ActivityIndicator color={colors.brand[500]} size="small" style={{ marginTop: 24 }} />
      )}
    </View>
  );
}
