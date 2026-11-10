"use client";

// Manager adds one resident record by hand (source "manual"). It grants nothing:
// the person confirms it after signing in with OTP on that same number.

import { managerAddResidentRecord } from "@parisar/api-client";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import {
  FormActions,
  FormField,
  Notice,
  PhoneInput,
  SearchableSelect,
  SurfaceCard,
  TextInput,
} from "@/components/kit";
import { errorMessage } from "@/components/onboarding/lib/errors";
import {
  checkEmail,
  checkMobile,
  checkName,
  firstError,
} from "@/components/onboarding/lib/validation";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

const TYPES = ["owner", "tenant", "family_member"];
const ORDER = ["flat", "name", "phone", "email"];

export function AddResidentPanel({
  societyId,
  flatOptions,
  flatsFailed,
  onRetryFlats,
  onAdded,
  onClose,
}) {
  const { t } = useTranslation("resident-onboarding");
  const [form, setForm] = useState({
    flatId: "",
    name: "",
    phone: "",
    residentType: "owner",
    email: "",
  });
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);
  const [serverError, setServerError] = useState(null);
  const set = (p) => setForm((f) => ({ ...f, ...p }));

  async function submit(e) {
    e.preventDefault();
    const next = {
      flat: form.flatId ? null : "validation.flatRequired",
      name: checkName(form.name),
      phone: checkMobile(form.phone, { required: true }),
      email: checkEmail(form.email),
    };
    setErrors(next);
    const first = firstError(next, ORDER);
    if (first) {
      document.getElementById(`add-${first}`)?.focus();
      return;
    }
    setBusy(true);
    setServerError(null);
    try {
      const res = await managerAddResidentRecord(createSupabaseBrowserClient(), {
        societyId,
        flatId: form.flatId,
        fullName: form.name.trim(),
        phone: form.phone,
        residentType: form.residentType,
        email: form.email.trim() || null,
      });
      if (res?.error) {
        setServerError(errorMessage(t, res));
        return;
      }
      onAdded(res);
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
          <h2 className="type-h3 text-foreground">{t("admin.addTitle")}</h2>
          <p className="type-body-sm mt-1 text-muted-foreground">{t("admin.addHint")}</p>
        </div>
        {flatsFailed ? (
          <Notice
            tone="danger"
            action={
              <button
                type="button"
                className="focus-ring min-h-11 rounded px-2 underline"
                onClick={onRetryFlats}
              >
                {t("common.retry")}
              </button>
            }
          >
            {t("admin.flatsError")}
          </Notice>
        ) : null}
        <FormField label={t("verify.flat")} required error={err("flat")}>
          <SearchableSelect
            id="add-flat"
            options={flatOptions ?? []}
            loading={!flatOptions && !flatsFailed}
            value={form.flatId}
            placeholder={t("details.flatPlaceholder")}
            emptyText={t("details.noMatch")}
            onChange={(v) => set({ flatId: v })}
          />
        </FormField>
        <div className="grid gap-5 sm:grid-cols-2">
          <FormField label={t("verify.name")} required error={err("name")}>
            <TextInput
              id="add-name"
              value={form.name}
              onChange={(e) => set({ name: e.target.value })}
            />
          </FormField>
          <FormField label={t("admin.mobile")} required error={err("phone")}>
            <PhoneInput
              id="add-phone"
              value={form.phone}
              onChange={(digits) => set({ phone: digits })}
            />
          </FormField>
        </div>
        <FormField label={t("verify.residentType")} required group>
          <div className="grid gap-2 sm:grid-cols-3">
            {TYPES.map((type) => (
              <label
                key={type}
                className="flex min-h-11 cursor-pointer items-center gap-2 rounded-lg border border-input bg-card px-3 py-2 has-[:checked]:border-primary has-[:checked]:bg-primary-soft"
              >
                <input
                  type="radio"
                  name="add-resident-type"
                  value={type}
                  checked={form.residentType === type}
                  onChange={() => set({ residentType: type })}
                  className="size-4 accent-[var(--primary)]"
                />
                <span className="type-body text-foreground">{t(`residentType.${type}`)}</span>
              </label>
            ))}
          </div>
        </FormField>
        <FormField label={t("verify.email")} optional error={err("email")}>
          <TextInput
            id="add-email"
            type="email"
            value={form.email}
            onChange={(e) => set({ email: e.target.value })}
          />
        </FormField>
      </SurfaceCard>
      {serverError ? <Notice tone="danger">{serverError}</Notice> : null}
      <FormActions
        submitLabel={t("admin.addSubmit")}
        submitting={busy}
        onCancel={onClose}
        cancelLabel={t("common.cancel")}
      />
    </form>
  );
}
