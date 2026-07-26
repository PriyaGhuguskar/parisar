import { Text, TouchableOpacity, View } from "react-native";

/**
 * Selectable role card (Secretary or Member).
 * - Full-width, rounded-xl, px-5 py-4
 * - Unselected: 1.5px neutral.200 border / white bg
 * - Selected: 2px brand.500 border / brand.50 bg
 * - Top-right filled-circle indicator when selected
 * - Lucide icon (24px brand.500), title (20px semibold), description (14px neutral.600)
 */
export function RoleCard({ icon: Icon, title, description, selected, onPress }) {
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.85}
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      className={[
        "w-full rounded-xl px-5 py-4 flex-row items-start gap-4",
        selected
          ? "border-2 border-brand-500 bg-brand-50"
          : "border border-neutral-200 bg-neutral-0",
      ].join(" ")}
    >
      {/* Icon */}
      {Icon && (
        <View className="mt-1">
          <Icon size={24} color="#12715A" />
        </View>
      )}

      {/* Text content */}
      <View className="flex-1">
        <Text className="text-xl font-semibold text-neutral-900 flex-wrap">{title}</Text>
        <Text className="text-sm text-neutral-600 mt-1 flex-wrap">{description}</Text>
      </View>

      {/* Selection indicator — top-right filled circle */}
      <View className="mt-1">
        {selected ? (
          <View
            className="w-4 h-4 rounded-full bg-brand-500 items-center justify-center"
            accessibilityLabel="Selected"
          />
        ) : (
          <View
            className="w-4 h-4 rounded-full border-2 border-neutral-200"
            accessibilityLabel="Not selected"
          />
        )}
      </View>
    </TouchableOpacity>
  );
}
