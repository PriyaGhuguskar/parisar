"use client";

// Four-digit PIN form. `onSubmit(pin)` does the work (the wizard commits the join
// first, then saves the PIN) and resolves to an error message, or null on success.
// The PIN itself is always saved server-side by setMyPin; the session decides whose.

import { useState } from "react";
import { useTranslation } from "react-i18next";
import { FormActions, FormField, Notice, SurfaceCard, TextInput } from "@/components/kit";

export function isWeakPin(pin) {
  return pin === "1234" || /^(\d)\1{3}$/.test(pin);
}

export function PinSetup({ onSubmit, submitLabel, onBack }) {
  const { t } = useTranslation("resident-onboarding");
  const [pin, setPin] = useState("");
  const [pin2, setPin2] = useState("");
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState(null);
  const [busy, setBusy] = useState(false);

  async function handle(e) {
    e.preventDefault();
    const next = {};
    if (!/^\d{4}$/.test(pin)) next.pin = t("pin.errorFormat");
    else if (isWeakPin(pin)) next.pin = t("pin.errorWeak");
    if (!next.pin && pin2 !== pin) next.pin2 = t("pin.errorMismatch");
    setErrors(next);
    setFormError(null);
    if (next.pin || next.pin2) {
      document.getElementById(next.pin ? "pin-new" : "pin-confirm")?.focus();
      return;
    }
    setBusy(true);
    try {
      const message = await onSubmit(pin);
      if (message) setFormError(message);
    } catch {
      setFormError(t("errors.generic"));
    } finally {
      setBusy(false);
    }
  }

  const digits = (v) => v.replace(/\D/g, "").slice(0, 4);

  return (
    <form onSubmit={handle} className="flex flex-col gap-6" noValidate>
      <SurfaceCard className="flex flex-col gap-5 p-5 sm:p-6">
        <div>
          <h2 className="type-h3 text-foreground">{t("pin.title")}</h2>
          <p className="type-body-sm mt-1 text-muted-foreground">{t("pin.hint")}</p>
        </div>
        <FormField label={t("pin.new")} required error={errors.pin}>
          <TextInput
            id="pin-new"
            type="password"
            inputMode="numeric"
            autoComplete="new-password"
            maxLength={4}
            value={pin}
            onChange={(e) => setPin(digits(e.target.value))}
            className="max-w-40 text-center tracking-[0.5em]"
          />
        </FormField>
        <FormField label={t("pin.confirm")} required error={errors.pin2}>
          <TextInput
            id="pin-confirm"
            type="password"
            inputMode="numeric"
            autoComplete="new-password"
            maxLength={4}
            value={pin2}
            onChange={(e) => setPin2(digits(e.target.value))}
            className="max-w-40 text-center tracking-[0.5em]"
          />
        </FormField>
      </SurfaceCard>
      {formError ? <Notice tone="danger">{formError}</Notice> : null}
      <FormActions
        submitLabel={submitLabel ?? t("pin.save")}
        submitting={busy}
        onBack={onBack}
        backLabel={t("common.back")}
      />
    </form>
  );
}

/** setMyPin error -> message. */
export function pinErrorMessage(t, code) {
  if (code === "WEAK_PIN" || code === "INVALID_PIN") return t("pin.errorWeak");
  if (code === "REAUTH_REQUIRED" || code === "AUTH_REQUIRED") return t("errors.REAUTH_REQUIRED");
  return t("errors.generic");
}
