import { useState } from "react";
import { Text, TextInput, View } from "react-native";

/**
 * Phone number input row: locked +91 selector + 10-digit input.
 * - Country selector: 80px wide, bg-neutral-100, text-neutral-600, no chevron
 *   // TODO: Phase 8 — multi-country selector
 * - Input: keyboardType="number-pad", maxLength=10, min-h-14 (56px)
 * - Border: neutral.200; focus border: brand.700
 */
export function PhoneInput({ value, onChangeText, hasError = false }) {
  const [focused, setFocused] = useState(false);

  const borderColor = hasError
    ? "border-danger-500"
    : focused
      ? "border-brand-700"
      : "border-neutral-200";

  const borderWidth = focused ? "border-2" : "border";

  return (
    <View className="flex-row items-center gap-2">
      {/* Locked +91 country selector — Phase 8 will replace with tappable multi-country */}
      {/* TODO: Phase 8 — multi-country selector */}
      <View
        className="h-14 w-20 items-center justify-center rounded-lg bg-neutral-100 border border-neutral-200"
        accessibilityLabel="Country code India +91"
        accessibilityRole="none"
      >
        <Text className="text-base text-neutral-600">🇮🇳 +91</Text>
      </View>

      {/* 10-digit phone number input */}
      <TextInput
        className={[
          "flex-1 h-14 rounded-lg bg-neutral-0 px-3 text-base text-neutral-900",
          borderColor,
          borderWidth,
        ].join(" ")}
        value={value}
        onChangeText={onChangeText}
        keyboardType="number-pad"
        maxLength={10}
        placeholder="98765 43210"
        placeholderTextColor="#6e6e6e"
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        accessibilityLabel="Mobile phone number"
        returnKeyType="done"
        textContentType="telephoneNumber"
      />
    </View>
  );
}
