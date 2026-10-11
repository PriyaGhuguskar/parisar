import { useTranslation } from "react-i18next";
import { Text, TouchableOpacity, View } from "react-native";

/**
 * Step 1 — Society Found Preview.
 *
 * Props:
 *   preview     — { society_id, name, address, member_count }
 *   onConfirm   — function() — user taps "Yes, join"
 *   onWrong     — function() — user taps "Wrong society?"
 */
export function SocietyPreview({ preview, onConfirm, onWrong }) {
  const { t } = useTranslation("auth");
  const { name = "", address = "", member_count = 0 } = preview ?? {};

  // Society initials: first 2 characters, uppercase
  const initials =
    name
      .split(/\s+/)
      .slice(0, 2)
      .map((w) => w[0] ?? "")
      .join("")
      .toUpperCase() || name.slice(0, 2).toUpperCase();

  return (
    <View className="gap-6 pt-4">
      {/* Society card */}
      <View className="bg-neutral-0 rounded-2xl p-6 shadow-sm items-center gap-4">
        {/* Initial circle */}
        <View className="w-[72px] h-[72px] rounded-full items-center justify-center bg-brand-500">
          <Text className="text-[28px] font-semibold text-neutral-0">{initials}</Text>
        </View>

        {/* Society name */}
        <Text className="text-xl font-semibold text-neutral-900 text-center">{name}</Text>

        {/* Address */}
        <Text className="text-base text-neutral-600 text-center">{address}</Text>

        {/* Member count */}
        <Text className="text-sm text-neutral-400">
          {t("join.previewMemberCount", { count: String(member_count) })}
        </Text>

        {/* Divider */}
        <View className="w-full h-px bg-neutral-200" />

        {/* Confirm copy */}
        <Text className="text-base text-neutral-900 text-center">
          {t("join.confirmJoin", { societyName: name })}
        </Text>
      </View>

      {/* Actions */}
      <View className="gap-3">
        {/* Yes, join — primary */}
        <TouchableOpacity
          onPress={onConfirm}
          activeOpacity={0.8}
          className="h-14 w-full rounded-xl items-center justify-center bg-brand-500 active:bg-brand-600"
          accessibilityRole="button"
        >
          <Text className="text-base font-semibold text-neutral-0">{t("join.confirmYes")}</Text>
        </TouchableOpacity>

        {/* Wrong society — text link */}
        <TouchableOpacity
          onPress={onWrong}
          activeOpacity={0.7}
          className="items-center py-2"
          accessibilityRole="button"
        >
          <Text className="text-sm text-neutral-600">{t("join.wrongSociety")}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}
