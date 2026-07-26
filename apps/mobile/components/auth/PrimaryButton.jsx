import { ActivityIndicator, Text, TouchableOpacity } from "react-native";

/**
 * Full-width primary button.
 * - bg-brand-500, h-14 (56px), rounded-xl (12px)
 * - text neutral.0 16px semibold
 * - Disabled: bg-neutral-200 / text-neutral-400
 * - Loading: white ActivityIndicator replaces label
 * - Press: active:bg-brand-600
 */
export function PrimaryButton({ label, onPress, loading = false, disabled = false }) {
  const isDisabled = disabled || loading;

  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={isDisabled}
      activeOpacity={0.8}
      className={[
        "h-14 w-full rounded-xl items-center justify-center",
        isDisabled ? "bg-neutral-200" : "bg-brand-500 active:bg-brand-600",
      ].join(" ")}
      accessibilityRole="button"
      accessibilityState={{ disabled: isDisabled, busy: loading }}
    >
      {loading ? (
        <ActivityIndicator color="#ffffff" size="small" />
      ) : (
        <Text
          className={[
            "text-base font-semibold",
            isDisabled ? "text-neutral-400" : "text-neutral-0",
          ].join(" ")}
          numberOfLines={1}
        >
          {label}
        </Text>
      )}
    </TouchableOpacity>
  );
}
