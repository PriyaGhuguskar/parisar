"use client";

// Indian mobile input: a fixed +91 prefix and 10 digits.
//
//   <FormField label="Mobile number" required error={errors.phone}>
//     <PhoneInput value={phone} onChange={(digits, { e164, valid }) => setPhone(digits)} />
//   </FormField>
//
// `value` is the 10 local digits. Paste is cleaned up ("+91 98765-43210" becomes
// 9876543210). A partial or invalid number shows its own error after blur, unless the
// parent is already showing one through FormField. It is a format check only: it says
// nothing about whether the number exists or belongs to the person typing it.

import { AlertCircle } from "lucide-react";
import { useId, useState } from "react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import { CONTROL_GROUP_CLASS } from "./controlStyles";
import { isValidIndianMobile, normalizeIndianMobile, toE164 } from "./lib/phone";

export function PhoneInput({
  value = "",
  onChange,
  onBlur,
  id,
  className,
  placeholder,
  "aria-describedby": describedBy,
  "aria-invalid": ariaInvalid,
  ...props
}) {
  const { t } = useTranslation("kit");
  const autoId = useId();
  const baseId = id ?? autoId;
  const prefixId = `${baseId}-prefix`;
  const ownErrorId = `${baseId}-format-error`;
  const [touched, setTouched] = useState(false);

  const digits = normalizeIndianMobile(value);
  const showOwnError = touched && !ariaInvalid && digits.length > 0 && !isValidIndianMobile(digits);

  function handleChange(event) {
    const next = normalizeIndianMobile(event.target.value);
    onChange?.(next, { e164: toE164(next), valid: isValidIndianMobile(next) });
  }

  function handleBlur(event) {
    setTouched(true);
    onBlur?.(event);
  }

  return (
    <div className={cn("flex min-w-0 flex-col gap-1.5", className)}>
      <div className={CONTROL_GROUP_CLASS}>
        <span
          aria-hidden="true"
          className="flex shrink-0 items-center border-r border-border bg-muted px-3 font-medium text-muted-foreground"
        >
          +91
        </span>
        <span id={prefixId} className="sr-only">
          {t("phone.countryCode")}
        </span>
        <input
          {...props}
          id={baseId}
          type="tel"
          inputMode="numeric"
          autoComplete="tel-national"
          value={digits}
          onChange={handleChange}
          onBlur={handleBlur}
          placeholder={placeholder ?? t("phone.placeholder")}
          aria-invalid={ariaInvalid || showOwnError ? true : undefined}
          aria-describedby={
            [prefixId, describedBy, showOwnError ? ownErrorId : null].filter(Boolean).join(" ") ||
            undefined
          }
          className="w-full min-w-0 flex-1 bg-transparent px-3 tabular-nums outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:text-muted-foreground"
        />
      </div>
      {showOwnError ? (
        <p id={ownErrorId} role="alert" className="type-body-sm flex gap-1.5 text-destructive">
          <AlertCircle aria-hidden="true" className="mt-[3px] size-3.5 shrink-0" />
          <span>{t("phone.invalid")}</span>
        </p>
      ) : null}
    </div>
  );
}
