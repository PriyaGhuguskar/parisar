import { View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

/**
 * Outer wrapper for all auth screens.
 * - neutral.50 background
 * - SafeAreaView edges top+bottom
 * - px-6 (24px) horizontal padding
 * - full-height content column
 */
export function AuthShell({ children }) {
  return (
    <SafeAreaView className="flex-1 bg-neutral-50" edges={["top", "bottom"]}>
      <View className="flex-1 px-6">{children}</View>
    </SafeAreaView>
  );
}
