"use client";

// "Edit details": a proposal for the society to apply. Nothing changes until a
// manager accepts it, and the screen says so.

import { residentSubmitCorrection } from "@parisar/api-client";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { FormActions, FormField, Notice, SurfaceCard, TextArea, TextInput } from "@/components/kit";
import { errorMessage } from "@/components/onboarding/lib/errors";
import {
  checkEmail,
  checkName,
  checkOptionalText,
  firstError,
} from "@/components/onboarding/lib/validation";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

const TYPES = ["owner", "tenant", "family_member"];
const ORDER = ["full_name", "email", "flat_label", "note", "form"];

/** Only the fields that differ from the record. Pure, for tests. */
export function changedFields(record, form) {
  const changes = {};
  if (form.full_name.trim() !== (record.full_name ?? "")) changes.full_name = form.full_name.trim();
  if (form.email.trim() !== (record.email ?? "")) changes.email = form.email.trim();
  if (form.resident_type !== record.resident_type) changes.resident_type = form.resident_type;
  if (form.flat_label.trim() !== (record.flat_label ?? ""))
    changes.flat_label = form.flat_label.trim();
  return changes;
}

export function CorrectionForm({ record, onDone, onCancel }) {
  const { t } = useTranslation("resident-onboarding");
  const [form, setForm] = useState({
    full_name: record.full_name ?? "",
    email: record.email ?? "",
    resident_type: record.resident_type ?? "owner",
    flat_label: record.flat_label ?? "",
    note: "",
  });
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);
  const [serverError, setServerError] = useState(null);
  const set = (patch) => setForm((f) => ({ ...f, ...patch }));

  async function submit(e) {
    e.preventDefault();
    const changes = changedFields(record, form);
    const next = {
      full_name: checkName(form.full_name),
      email: checkEmail(form.email),
      flat_label: checkOptionalText(form.flat_label, 40),
      note: checkOptionalText(form.note, 500),
      form: Object.keys(changes).length ? null : "validation.noChanges",
    };
    setErrors(next);
    const first = firstError(next, ORDER);
    if (first) {
      document.getElementById(`correction-${first}`)?.focus();
      return;
    }
    setBusy(true);
    setServerError(null);
    try {
      const res = await residentSubmitCorrection(createSupabaseBrowserClient(), {
        recordId: record.id,
        changes,
        note: form.note.trim() || null,
      });
      if (res?.error) {
        setServerError(errorMessage(t, res));
        return;
      }
      onDone(res, t("verify.correctionSent"));
    } catch {
      setServerError(t("errors.generic"));
    } finally {
      setBusy(false);
    }
  }

  const err = (k) => (errors[k] ? t(errors[k]) : undefined);

  return (
    <form onSubmit={submit} className="flex flex-col gap-5" noValidate>
      <SurfaceCard className="flex flex-col gap-5 p-5 sm:p-6">
        <div>
          <h3 className="type-h3 text-foreground">{t("verify.editTitle")}</h3>
          <p className="type-body-sm mt-1 text-muted-foreground">{t("verify.editHint")}</p>
        </div>
        <FormField label={t("verify.name")} required error={err("full_name")}>
          <TextInput
            id="correction-full_name"
            value={form.full_name}
            onChange={(e) => set({ full_name: e.target.value })}
          />
        </FormField>
        <FormField label={t("verify.email")} optional error={err("email")}>
          <TextInput
            id="correction-email"
            type="email"
            autoComplete="email"
            value={form.email}
            onChange={(e) => set({ email: e.target.value })}
          />
        </FormField>
        <FormField label={t("verify.residentType")} required group>
          <div className="grid gap-2 sm:grid-cols-3">
            {TYPES.map((type) => (
              <label
                key={type}
                className="flex min-h-11 cursor-pointer items-center gap-2 rounded-lg border border-input bg-card px-3 py-2 has-[:checked]:border-primary has-[:checked]:bg-primary-soft"
              >
                <input
                  type="radio"
                  name={`rt-${record.id}`}
                  value={type}
                  checked={form.resident_type === type}
                  onChange={() => set({ resident_type: type })}
                  className="size-4 accent-[var(--primary)]"
                />
                <span className="type-body text-foreground">{t(`residentType.${type}`)}</span>
              </label>
            ))}
          </div>
        </FormField>
        <FormField
          label={t("verify.flat")}
          optional
          hint={t("verify.flatHint")}
          error={err("flat_label")}
        >
          <TextInput
            id="correction-flat_label"
            maxLength={40}
            value={form.flat_label}
            onChange={(e) => set({ flat_label: e.target.value })}
          />
        </FormField>
        <FormField label={t("verify.note")} optional error={err("note")}>
          <TextArea
            id="correction-note"
            rows={3}
            maxLength={500}
            value={form.note}
            onChange={(e) => set({ note: e.target.value })}
          />
        </FormField>
      </SurfaceCard>
      {errors.form ? (
        <p
          id="correction-form"
          tabIndex={-1}
          role="alert"
          className="type-body-sm text-destructive"
        >
          {t(errors.form)}
        </p>
      ) : null}
      {serverError ? <Notice tone="danger">{serverError}</Notice> : null}
      <FormActions
        submitLabel={t("verify.sendCorrection")}
        submitting={busy}
        onCancel={onCancel}
        cancelLabel={t("common.cancel")}
      />
    </form>
  );
}
