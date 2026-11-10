"use client";

// Tenant fields. Registering creates no membership: the flat's owner approves,
// then the society. Documents are uploaded after registering, because the
// private bucket only accepts files from someone with an open registration.

import { useState } from "react";
import { useTranslation } from "react-i18next";
import {
  DatePicker,
  FormActions,
  FormField,
  Notice,
  PhoneInput,
  SurfaceCard,
  TextInput,
} from "@/components/kit";
import {
  checkDateRange,
  checkMobile,
  checkName,
  checkOptionalText,
  firstError,
} from "../lib/validation";

const ORDER = ["start", "end", "ownerName", "ownerPhone", "policeReference"];

export function validateTenant(f) {
  const errors = {
    start: f.agreementStart ? null : "validation.startRequired",
    end: f.agreementEnd
      ? checkDateRange(f.agreementStart, f.agreementEnd)
      : "validation.endRequired",
    ownerName: f.ownerName.trim() ? checkName(f.ownerName) : null,
    ownerPhone: checkMobile(f.ownerPhone),
    policeReference: checkOptionalText(f.policeReference, 60),
  };
  return errors;
}

export function TenantFields({ value, onChange, errors, t }) {
  const err = (k) => (errors[k] ? t(errors[k]) : undefined);
  return (
    <>
      <div className="grid gap-5 sm:grid-cols-2">
        <FormField label={t("tenant.start")} required error={err("start")}>
          <DatePicker
            id="tenant-start"
            value={value.agreementStart}
            onChange={(v) => onChange({ agreementStart: v })}
          />
        </FormField>
        <FormField label={t("tenant.end")} required error={err("end")}>
          <DatePicker
            id="tenant-end"
            value={value.agreementEnd}
            min={value.agreementStart || undefined}
            onChange={(v) => onChange({ agreementEnd: v })}
          />
        </FormField>
      </div>
      <div className="grid gap-5 sm:grid-cols-2">
        <FormField label={t("tenant.ownerName")} optional error={err("ownerName")}>
          <TextInput
            id="tenant-ownerName"
            value={value.ownerName}
            onChange={(e) => onChange({ ownerName: e.target.value })}
          />
        </FormField>
        <FormField
          label={t("tenant.ownerPhone")}
          optional
          hint={t("tenant.ownerPhoneHint")}
          error={err("ownerPhone")}
        >
          <PhoneInput
            id="tenant-ownerPhone"
            value={value.ownerPhone}
            onChange={(digits) => onChange({ ownerPhone: digits })}
          />
        </FormField>
      </div>
      <FormField label={t("tenant.police")} required group>
        <div className="grid gap-2 sm:grid-cols-2">
          {["not_submitted", "submitted"].map((s) => (
            <label
              key={s}
              className="flex min-h-11 cursor-pointer items-center gap-2 rounded-lg border border-input bg-card px-3 py-2 has-[:checked]:border-primary has-[:checked]:bg-primary-soft"
            >
              <input
                type="radio"
                name="policeStatus"
                value={s}
                checked={value.policeStatus === s}
                onChange={() => onChange({ policeStatus: s })}
                className="size-4 accent-[var(--primary)]"
              />
              <span className="type-body text-foreground">{t(`status.police.${s}`)}</span>
            </label>
          ))}
        </div>
      </FormField>
      {value.policeStatus === "submitted" ? (
        <FormField label={t("tenant.policeReference")} optional error={err("policeReference")}>
          <TextInput
            id="tenant-policeReference"
            maxLength={60}
            value={value.policeReference}
            onChange={(e) => onChange({ policeReference: e.target.value })}
          />
        </FormField>
      ) : null}
    </>
  );
}

export function TenantStep({ value, onChange, onBack, onNext, busy, error, finalStep }) {
  const { t } = useTranslation("resident-onboarding");
  const [errors, setErrors] = useState({});

  function submit(e) {
    e.preventDefault();
    const next = validateTenant(value);
    setErrors(next);
    const first = firstError(next, ORDER);
    if (first) {
      document.getElementById(`tenant-${first}`)?.focus();
      return;
    }
    onNext();
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-6" noValidate>
      <SurfaceCard className="flex flex-col gap-5 p-5 sm:p-6">
        <div>
          <h2 className="type-h3 text-foreground">{t("tenant.title")}</h2>
          <p className="type-body-sm mt-1 text-muted-foreground">{t("tenant.hint")}</p>
        </div>
        <TenantFields value={value} onChange={onChange} errors={errors} t={t} />
      </SurfaceCard>
      <Notice tone="info" title={t("tenant.docsTitle")}>
        {t("tenant.docsHint")}
      </Notice>
      {error ? <Notice tone="danger">{error}</Notice> : null}
      <FormActions
        submitLabel={finalStep ? t("tenant.register") : t("common.continue")}
        submitting={busy}
        onBack={onBack}
        backLabel={t("common.back")}
      />
    </form>
  );
}
