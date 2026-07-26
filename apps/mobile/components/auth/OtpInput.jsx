import { useEffect, useRef } from "react";
import { TextInput, View } from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withTiming,
} from "react-native-reanimated";

const OTP_LENGTH = 6;

/**
 * 6-box segmented OTP input (MyGate style).
 * - 52×60px boxes, gap-2 (8px), rounded-lg
 * - Auto-advance on digit entry, backspace clears + moves back, paste fills all
 * - Focused box: brand.700 2px border
 * - Filled box: brand.500 border + brand.50 bg
 * - Error: danger.500 border + light-red bg on all boxes + horizontal shake
 * - Each box: accessibilityLabel="OTP digit N of 6"
 * - textContentType="oneTimeCode", autoComplete="sms-otp"
 */
export function OtpInput({ value = "", onChangeText, hasError = false, onComplete }) {
  const digits = value.split("").slice(0, OTP_LENGTH);
  // Pad to OTP_LENGTH
  while (digits.length < OTP_LENGTH) digits.push("");

  const inputRefs = useRef([]);
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

  function handleKeyPress(index, key) {
    if (key === "Backspace") {
      if (digits[index] !== "") {
        // Clear current box
        const newDigits = [...digits];
        newDigits[index] = "";
        onChangeText(newDigits.join(""));
      } else if (index > 0) {
        // Move to previous box and clear it
        const newDigits = [...digits];
        newDigits[index - 1] = "";
        onChangeText(newDigits.join(""));
        inputRefs.current[index - 1]?.focus();
      }
    }
  }

  function handleChangeText(index, text) {
    // Handle paste: if text length > 1 it's a paste
    const sanitized = text.replace(/\D/g, "");
    if (sanitized.length > 1) {
      // Fill all boxes from paste
      const pasted = sanitized.slice(0, OTP_LENGTH);
      const padded = pasted.padEnd(OTP_LENGTH, "").split("");
      while (padded.length < OTP_LENGTH) padded.push("");
      const newValue = padded.join("").slice(0, OTP_LENGTH);
      onChangeText(newValue);
      // Focus last filled box or last box
      const focusIndex = Math.min(pasted.length, OTP_LENGTH - 1);
      inputRefs.current[focusIndex]?.focus();
      if (pasted.length === OTP_LENGTH && onComplete) {
        onComplete(newValue);
      }
      return;
    }

    const digit = sanitized.slice(-1); // take last char (handles autofill edge cases)
    const newDigits = [...digits];
    newDigits[index] = digit;
    const newValue = newDigits.join("");
    onChangeText(newValue);

    if (digit && index < OTP_LENGTH - 1) {
      // Auto-advance to next box
      inputRefs.current[index + 1]?.focus();
    }
    if (newValue.replace(/\s/g, "").length === OTP_LENGTH && !newValue.includes(" ")) {
      const filled = newDigits.filter(Boolean);
      if (filled.length === OTP_LENGTH && onComplete) {
        onComplete(newValue);
      }
    }
  }

  return (
    <Animated.View style={animatedStyle} className="flex-row gap-2">
      {digits.map((digit, index) => {
        const isFilled = digit !== "";
        const errorBg = hasError ? "#fff5f5" : undefined;
        const filledBg = !hasError && isFilled ? "#f5f7ff" : undefined;
        const normalBg = "#ffffff";
        const bgColor = errorBg ?? filledBg ?? normalBg;

        let borderClass = "border border-neutral-200";
        if (hasError) {
          borderClass = "border-2 border-danger-500";
        } else if (isFilled) {
          borderClass = "border border-brand-500";
        }

        return (
          <TextInput
            key={index}
            ref={(ref) => {
              inputRefs.current[index] = ref;
            }}
            className={[
              "rounded-lg text-xl font-semibold text-neutral-900 text-center",
              borderClass,
            ].join(" ")}
            style={{ width: 52, height: 60, backgroundColor: bgColor }}
            value={digit}
            onChangeText={(text) => handleChangeText(index, text)}
            onKeyPress={({ nativeEvent }) => handleKeyPress(index, nativeEvent.key)}
            keyboardType="number-pad"
            maxLength={OTP_LENGTH}
            textContentType="oneTimeCode"
            autoComplete="sms-otp"
            selectTextOnFocus
            accessibilityLabel={`OTP digit ${index + 1} of 6`}
          />
        );
      })}
    </Animated.View>
  );
}
