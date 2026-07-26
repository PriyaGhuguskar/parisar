import { Text } from "react-native";

/**
 * Inline error message below a form field.
 * - text-danger-500, 14px (text-sm)
 * - accessibilityRole="alert" for screen readers
 * - Renders nothing if message is falsy
 */
export function FormError({ message }) {
  if (!message) return null;
  return (
    <Text
      className="text-sm text-danger-500 mt-1"
      accessibilityRole="alert"
      accessibilityLiveRegion="assertive"
    >
      {message}
    </Text>
  );
}
