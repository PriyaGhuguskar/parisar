// apps/mobile/components/auth/DevOtpHint.jsx
// DEV-ONLY on-screen OTP hint (OTP provider deferred — see PROJECT.md Key Decisions).
//
// While no real SMS provider is wired, [auth.sms.test_otp] in supabase/config.toml
// maps the manual-QA numbers (+91 90000 00001 … 00030) to the fixed code 123456 and
// skips SMS entirely. This banner surfaces that code in the app so testers can log in
// with any of those numbers without a phone/SMS.
//
// SAFETY: gated on React Native's `__DEV__` global — statically `false` in any
// release/production build, so the whole component is dead-code-eliminated and can
// NEVER render to a real user. Remove this component (and the test_otp block) when a
// production OTP provider is chosen.
//
// Intentionally NOT internationalized: it is developer-facing, never ships to users,
// and adding keys would trip the en≡hi≡mr i18n-coverage CI gate for a dev-only string.

import { Text, View } from "react-native";

const DEV_OTP = "123456";

export function DevOtpHint() {
  if (!__DEV__) return null;

  return (
    <View
      accessibilityRole="alert"
      className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 gap-1"
    >
      <Text className="text-sm font-semibold text-amber-900">🔧 Dev mode — SMS bypassed</Text>
      <Text className="text-sm text-amber-800">
        OTP is <Text className="font-bold tracking-widest">{DEV_OTP}</Text>. Use any test number
        90000 00001–00030.
      </Text>
    </View>
  );
}
