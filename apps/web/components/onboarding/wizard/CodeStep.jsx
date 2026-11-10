"use client";

// Step 1: the society code the society's authority shared.

import { useState } from "react";
import { useTranslation } from "react-i18next";
import { FormActions, FormField, Notice, SurfaceCard, TextInput } from "@/components/kit";

export function normaliseCode(raw) {
  const norm = String(raw ?? "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, 8);
  return norm.length > 4 ? `${norm.slice(0, 4)}-${norm.slice(4)}` : norm;
}

export function CodeStep({ code, onCode, onSubmit, busy, error }) {
  const { t } = useTranslation("resident-onboarding");
  const [fieldError, setFieldError] = useState(null);

  function submit(e) {
    e.preventDefault();
    if (code.replace("-", "").length !== 8) {
      setFieldError(t("validation.codeFormat"));
      document.getElementById("society-code")?.focus();
      return;
    }
    setFieldError(null);
    onSubmit(code);
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-6" noValidate>
      <SurfaceCard className="flex flex-col gap-5 p-5 sm:p-6">
        <FormField label={t("code.label")} required hint={t("code.hint")} error={fieldError}>
          <TextInput
            id="society-code"
            value={code}
            autoCapitalize="characters"
            autoComplete="off"
            placeholder="ABCD-1234"
            onChange={(e) => onCode(normaliseCode(e.target.value))}
            className="max-w-60 text-center tracking-[0.2em] uppercase"
          />
        </FormField>
      </SurfaceCard>
      {error ? <Notice tone="danger">{error}</Notice> : null}
      <FormActions submitLabel={t("common.continue")} submitting={busy} />
    </form>
  );
}
