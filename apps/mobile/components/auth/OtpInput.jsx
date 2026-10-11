import { useEffect, useRef, useState } from "react";
import { Pressable, Text, TextInput, View } from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withTiming,
} from "react-native-reanimated";

const DEFAULT_LENGTH = 6;

/**
 * 6-box OTP input (MyGate style).
 *
 * ONE hidden TextInput receives all typing; the six boxes only display its
 * digits. (The earlier one-TextInput-per-box version moved focus after every
 * digit, so fast typing landed digits in the wrong box or dropped them.) This
 * way typing "123456" fills all six in one go, backspace just deletes, and
 * paste / SMS auto-fill (textContentType="oneTimeCode", autoComplete="sms-otp")
 * fill the whole code at once. Tapping any box focuses the input.
 *
 * - 52×60px boxes, gap-2, rounded-lg
 * - Active box: brand.700 2px border · filled: brand.500 border
 * - Error: danger.500 border + light-red bg on all boxes + horizontal shake
 * - onComplete(code) fires once 6 digits are entered
 */
export function OtpInput({
  value = "",
  onChangeText,
  hasError = false,
  onComplete,
  length = DEFAULT_LENGTH, // 4 for the PIN screens
  secure = false, // show dots instead of digits (PIN)
  boxLabel = "OTP digit",
  inputLabel = "One-time password",
  autoFocus = true,
}) {
  const OTP_LENGTH = length;
  const code = value.replace(/\D/g, "").slice(0, OTP_LENGTH);
  const inputRef = useRef(null);
  const [focused, setFocused] = useState(false);
  const shakeX = useSharedValue(0);

  // Trigger shake animation when hasError becomes true
  useEffect(() => {
    if (hasError) {
      shakeX.value = withSequence(
        withTiming(-6, { duration: 50 }),
        withTiming(6, { duration: 50 }),
        withTiming(-6, { duration: 50 }),
        withTiming(6, { duration: 50 }),
        withTiming(-4, { duration: 50 }),
        withTiming(4, { duration: 50 }),
        withTiming(0, { duration: 50 }),
      );
    }
  }, [hasError, shakeX]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: shakeX.value }],
  }));

  function handleChangeText(text) {
    const next = text.replace(/\D/g, "").slice(0, OTP_LENGTH);
    onChangeText(next);
    if (next.length === OTP_LENGTH && next !== code && onComplete) onComplete(next);
  }

  const activeIndex = Math.min(code.length, OTP_LENGTH - 1);

  return (
    <Animated.View style={animatedStyle}>
      <Pressable onPress={() => inputRef.current?.focus()} accessible={false}>
        <View className="flex-row gap-2">
          {Array.from({ length: OTP_LENGTH }, (_, index) => {
            const digit = code[index] ?? "";
            const isFilled = digit !== "";
            const isActive = focused && index === activeIndex && !hasError;

            let borderClass = "border border-neutral-200";
            if (hasError) borderClass = "border-2 border-danger-500";
            else if (isActive) borderClass = "border-2 border-brand-700";
            else if (isFilled) borderClass = "border border-brand-500";

            const bgColor = hasError ? "#fff5f5" : isFilled ? "#f5f7ff" : "#ffffff";

            return (
              <View
                // biome-ignore lint/suspicious/noArrayIndexKey: fixed positional boxes
                key={index}
                accessibilityLabel={`${boxLabel} ${index + 1} of ${OTP_LENGTH}`}
                className={["items-center justify-center rounded-lg", borderClass].join(" ")}
                style={{ width: 52, height: 60, backgroundColor: bgColor }}
              >
                <Text className="text-xl font-semibold text-neutral-900">
                  {secure && digit ? "•" : digit}
                </Text>
              </View>
            );
          })}
        </View>
      </Pressable>

      {/* The real input: covers the boxes, invisible, receives every keystroke. */}
      <TextInput
        ref={inputRef}
        value={code}
        onChangeText={handleChangeText}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        keyboardType="number-pad"
        maxLength={OTP_LENGTH}
        textContentType={secure ? "none" : "oneTimeCode"}
        autoComplete={secure ? "off" : "sms-otp"}
        autoFocus={autoFocus}
        caretHidden
        contextMenuHidden={false}
        accessibilityLabel={inputLabel}
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          opacity: 0.011,
          color: "transparent",
        }}
      />
    </Animated.View>
  );
}
