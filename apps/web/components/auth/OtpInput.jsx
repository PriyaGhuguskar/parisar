"use client";

import { useEffect, useRef } from "react";

// 6-digit segmented OTP input with auto-advance, backspace, paste, and error shake.
// Props: value (string), onChange (fn), hasError (bool), onComplete (fn)

export default function OtpInput({ value = "", onChange, hasError = false, onComplete }) {
  const digits = Array.from({ length: 6 }, (_, i) => value[i] ?? "");
  const inputRefs = useRef([]);

  // When hasError turns true, focus box 1 so user can re-enter immediately
  useEffect(() => {
    if (hasError) {
      inputRefs.current[0]?.focus();
    }
  }, [hasError]);

  function handleChange(index, e) {
    const raw = e.target.value.replace(/\D/g, "");
    if (!raw) return;
    const digit = raw[raw.length - 1]; // take last char (handles browser autofill emitting multi-char)
    const newDigits = [...digits];
    newDigits[index] = digit;
    const newValue = newDigits.join("");
    onChange(newValue);
    if (index < 5) {
      inputRefs.current[index + 1]?.focus();
    } else if (newValue.length === 6) {
      onComplete?.(newValue);
    }
  }

  function handleKeyDown(index, e) {
    if (e.key === "Backspace") {
      e.preventDefault();
      const newDigits = [...digits];
      if (newDigits[index]) {
        // Clear current box
        newDigits[index] = "";
        onChange(newDigits.join(""));
      } else if (index > 0) {
        // Move to previous box and clear it
        newDigits[index - 1] = "";
        onChange(newDigits.join(""));
        inputRefs.current[index - 1]?.focus();
      }
    } else if (e.key === "ArrowLeft" && index > 0) {
      inputRefs.current[index - 1]?.focus();
    } else if (e.key === "ArrowRight" && index < 5) {
      inputRefs.current[index + 1]?.focus();
    }
  }

  function handlePaste(e) {
    e.preventDefault();
    const pasted = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, 6);
    if (!pasted) return;
    const newDigits = Array.from({ length: 6 }, (_, i) => pasted[i] ?? "");
    onChange(newDigits.join(""));
    // Focus last filled box or box 6
    const focusIndex = Math.min(pasted.length, 5);
    inputRefs.current[focusIndex]?.focus();
    if (pasted.length === 6) {
      onComplete?.(pasted);
    }
  }

  return (
    <div
      role="group"
      aria-labelledby="otp-group-label"
      className={["flex gap-2", hasError ? "otp-error" : ""].filter(Boolean).join(" ")}
    >
      {digits.map((digit, i) => (
        <input
          key={i}
          ref={(el) => {
            inputRefs.current[i] = el;
          }}
          type="text"
          inputMode="numeric"
          maxLength={1}
          value={digit}
          aria-label={`OTP digit ${i + 1} of 6`}
          onChange={(e) => handleChange(i, e)}
          onKeyDown={(e) => handleKeyDown(i, e)}
          onPaste={i === 0 ? handlePaste : undefined}
          className={[
            "w-12 h-14 text-xl font-semibold text-center rounded-lg border transition-colors outline-none",
            "text-[var(--color-neutral-900)]",
            hasError
              ? "border-[var(--color-danger)] bg-[#fff5f5]"
              : digit
                ? "border-[var(--color-brand-500)] bg-[var(--color-brand-50)]"
                : "border-[var(--color-neutral-200)] bg-[var(--color-neutral-0)]",
            "focus:border-[var(--color-brand-700)] focus:ring-2 focus:ring-[var(--color-brand-500)]/20",
          ]
            .filter(Boolean)
            .join(" ")}
        />
      ))}
    </div>
  );
}
