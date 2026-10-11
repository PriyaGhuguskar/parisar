import { useRouter } from "expo-router";
import { CircleCheck } from "lucide-react-native";
import { useTranslation } from "react-i18next";
import { Text, TouchableOpacity, View } from "react-native";

/**
 * Step 3a — Join Success screen.
 *
 * Props:
 *   societyName               — string
 *   name                      — string (member's full name)
 *   autoElevatedToCoSecretary — boolean
 */
export function JoinSuccess({ societyName, name, autoElevatedToCoSecretary }) {
  const router = useRouter();
  const { t } = useTranslation("auth");

  function goToDashboard() {
    router.replace("/(protected)/(tabs)");
  }

  // Build body copy with interpolations
  const bodyText = t("join.success.body", { societyName: societyName ?? "", name: name ?? "" });

  return (
    <View className="flex-1 items-center justify-center gap-6 px-4 pt-4">
      {/* Success icon */}
      <CircleCheck size={64} color="#047857" />

      {/* Heading */}
      <Text className="text-[28px] font-semibold text-neutral-900 text-center">
        {t("join.success.heading")}
      </Text>

      {/* Body */}
      <Text className="text-base text-neutral-600 text-center">{bodyText}</Text>

      {/* Co-Secretary elevation chip */}
      {autoElevatedToCoSecretary && (
        <View className="bg-brand-50 border border-brand-200 rounded-xl px-4 py-3">
          <Text className="text-sm text-brand-500 font-medium text-center">
            You've been added as Co-Secretary.
          </Text>
        </View>
      )}

      {/* Go to Dashboard */}
      <TouchableOpacity
        onPress={goToDashboard}
        activeOpacity={0.8}
        className="h-14 w-full rounded-xl items-center justify-center bg-brand-500 active:bg-brand-600"
        accessibilityRole="button"
      >
        <Text className="text-base font-semibold text-neutral-0">{t("join.success.cta")}</Text>
      </TouchableOpacity>
    </View>
  );
}
