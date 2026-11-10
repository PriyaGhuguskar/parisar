"use client";

// The 4-digit PIN box used on /verify (digits only, masked).

import { PIN_FIELD } from "./pinErrors";

export default function PinField({
  id,
  value,
  onChange,
  hasError,
  autoComplete,
  autoFocus = false,
  "aria-label": ariaLabel,
}) {
  return (
    <input
      id={id}
      aria-label={ariaLabel}
      // biome-ignore lint/a11y/noAutofocus: the PIN is the only task on its screen
      autoFocus={autoFocus}
      type="password"
      inputMode="numeric"
      autoComplete={autoComplete}
      maxLength={4}
      value={value}
      onChange={(e) => onChange(e.target.value.replace(/\D/g, "").slice(0, 4))}
      placeholder="••••"
      className={PIN_FIELD}
      style={{ borderColor: hasError ? "var(--color-danger-500)" : "var(--color-neutral-200)" }}
    />
  );
}
