// ResponseChip — predefined board-response outlined button.
//
// Visual contract per 04-UI-SPEC.md Screen 3 / ResponseChip spec:
//   - 1.5px border / rounded-xl / px-4 / min-h-[44px] (touch target rule)
//   - default border + text: brand.500
//   - "resolved" variant: border + text success.500
//   - "need_info" variant: border + text warning.500
//   - Press: active:bg-brand-50 (or success/warning tint)
//   - Loading: ActivityIndicator replaces label, chip stays active-color
//   - Disabled (other chip is loading): opacity 0.4
//
// Label resolves from i18n response.* keys.

import { useTranslation } from "react-i18next";
import { ActivityIndicator, Pressable, Text } from "react-native";

const VARIANT_META = {
  checking: { color: "#12715A", bgPressed: "#f5f7ff", labelKey: "response.checking" },
  will_resolve: { color: "#12715A", bgPressed: "#f5f7ff", labelKey: "response.willResolve" },
  need_info: { color: "#f59e0b", bgPressed: "#fffbeb", labelKey: "response.needInfo" },
  resolved: { color: "#047857", bgPressed: "#ecfdf5", labelKey: "response.resolved" },
};

/**
 * @param {{
 *   responseKind: 'checking'|'will_resolve'|'need_info'|'resolved',
 *   onPress: () => void,
 *   loading?: boolean,
 *   disabled?: boolean,
 * }} props
 */
export function ResponseChip({ responseKind, onPress, loading = false, disabled = false }) {
  const { t } = useTranslation("complaints");
  const variant = VARIANT_META[responseKind] ?? VARIANT_META.checking;
  const isInteractive = !loading && !disabled;
  const label = t(variant.labelKey);

  return (
    <Pressable
      onPress={isInteractive ? onPress : undefined}
      disabled={!isInteractive}
      style={({ pressed }) => ({
        borderWidth: 1.5,
        borderColor: variant.color,
        backgroundColor: pressed && isInteractive ? variant.bgPressed : "#ffffff",
        borderRadius: 12,
        paddingHorizontal: 16,
        minHeight: 44,
        alignItems: "center",
        justifyContent: "center",
        opacity: disabled && !loading ? 0.4 : 1,
        flex: 1,
        // Allow the chip to grow vertically for Devanagari ("जल्द ही हल होगा")
        // without truncating — line height handles wrap.
      })}
      accessibilityRole="button"
      accessibilityLabel={`Respond: ${label}`}
      accessibilityState={{ disabled: !isInteractive, busy: loading }}
    >
      {loading ? (
        <ActivityIndicator size="small" color={variant.color} />
      ) : (
        <Text
          className="text-sm font-semibold text-center"
          style={{ color: variant.color }}
          numberOfLines={2}
        >
          {label}
        </Text>
      )}
    </Pressable>
  );
}
