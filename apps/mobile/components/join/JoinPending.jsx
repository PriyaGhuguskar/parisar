import { useRouter } from "expo-router";
import { Clock } from "lucide-react-native";
import { useTranslation } from "react-i18next";
import { Text, TouchableOpacity, View } from "react-native";

/**
 * Step 3b — Join Pending (duplicate flat / under review) screen.
 *
 * Design note: Pitfall 5 — NO red/danger on this screen.
 * This is NOT an error — it is a normal, calm, informational state.
 * The Clock icon and all accents use warning.500 amber (#f59e0b).
 *
 * Props:
 *   flatNumber — string, e.g. "A-102"
 */
export function JoinPending({ flatNumber }) {
  const router = useRouter();
  const { t } = useTranslation("auth");

  function goToSociety() {
    router.replace("/(protected)/(tabs)");
  }

  // Build body copy with interpolation
  const bodyText = t("join.pending.body", { flatNumber: flatNumber ?? "" });

  return (
    <View className="flex-1 items-center justify-center gap-6 px-4 pt-4">
      {/* Amber clock icon — warning, NOT danger */}
      <Clock size={64} color="#f59e0b" />

      {/* Heading */}
      <Text className="text-[28px] font-semibold text-neutral-900 text-center">
        {t("join.pending.heading")}
      </Text>

      {/* Body */}
      <Text className="text-base text-neutral-600 text-center">{bodyText}</Text>

      {/* Info paragraph */}
      <Text className="text-sm text-neutral-600 text-center">{t("join.pending.info")}</Text>

      {/* Go to Society — secondary outlined button */}
      <TouchableOpacity
        onPress={goToSociety}
        activeOpacity={0.8}
        className="h-14 w-full rounded-xl items-center justify-center border border-neutral-200 bg-neutral-0"
        accessibilityRole="button"
      >
        <Text className="text-base font-semibold text-neutral-900">{t("join.pending.cta")}</Text>
      </TouchableOpacity>
    </View>
  );
}
