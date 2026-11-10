"use client";

// Registration details of one society: read with get_society_registration, corrected
// with admin_update_society_registration. That RPC changes only the fields it is
// given and cannot clear one, so emptying a saved value is refused here with a
// message rather than silently ignored.

import { adminUpdateSocietyRegistration, getSocietyRegistration } from "@parisar/api-client";
import { SOCIETY_TYPE } from "@parisar/shared-types";
import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  CONTROL_CLASS,
  DatePicker,
  ErrorState,
  FormActions,
  FormField,
  LoadingState,
  Notice,
  TextInput,
} from "@/components/kit";
import { Button } from "@/components/ui/button";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { todayInIst } from "../onboarding/lib/requestFormat";
import { errorText, settle } from "../onboarding/lib/rpc";

const FIELDS = [
  {
    key: "registrationNumber",
    column: "registration_number",
    label: "register.registrationNumber",
  },
  { key: "societyType", column: "society_type", label: "register.societyType" },
  { key: "registrationDate", column: "registration_date", label: "register.registrationDate" },
  { key: "officialEmail", column: "official_email", label: "register.officialEmail" },
  { key: "officialPhone", column: "official_phone", label: "register.officialPhone" },
  { key: "country", column: "country", label: "register.country" },
];
const SERVER_FIELD = {
  INVALID_REGISTRATION_NUMBER: "registrationNumber",
  DUPLICATE_REGISTRATION_NUMBER: "registrationNumber",
  INVALID_SOCIETY_TYPE: "societyType",
  INVALID_REGISTRATION_DATE: "registrationDate",
  INVALID_OFFICIAL_EMAIL: "officialEmail",
  INVALID_OFFICIAL_PHONE: "officialPhone",
  INVALID_COUNTRY: "country",
};
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const OFFICIAL_PHONE_RE = /^[0-9+() -]{6,20}$/;

function toForm(reg) {
  return Object.fromEntries(FIELDS.map((f) => [f.key, reg?.[f.column] ?? ""]));
}

/** Changed fields only, as wrapper keys; errors as codes ("CANNOT_CLEAR" for emptied). */
export function diffRegistration(form, saved, today) {
  const errors = {};
  const changes = {};
  for (const field of FIELDS) {
    const next = String(form[field.key] ?? "").trim();
    const before = String(saved[field.key] ?? "").trim();
    if (next === before) continue;
    if (!next) {
      errors[field.key] = "CANNOT_CLEAR";
      continue;
    }
    changes[field.key] = next;
  }
  if (changes.registrationNumber && changes.registrationNumber.length > 60)
    errors.registrationNumber = "INVALID_REGISTRATION_NUMBER";
  if (changes.officialEmail && !EMAIL_RE.test(changes.officialEmail))
    errors.officialEmail = "INVALID_OFFICIAL_EMAIL";
  if (changes.officialPhone && !OFFICIAL_PHONE_RE.test(changes.officialPhone))
    errors.officialPhone = "INVALID_OFFICIAL_PHONE";
  if (changes.country && (changes.country.length < 2 || changes.country.length > 60))
    errors.country = "INVALID_COUNTRY";
  if (changes.registrationDate && today && changes.registrationDate > today)
    errors.registrationDate = "INVALID_REGISTRATION_DATE";
  return { changes, errors };
}

function displayValue(field, value, t) {
  if (!value) return <span className="text-muted-foreground">{t("registration.notSet")}</span>;
  if (field.key === "societyType") return t(`societyType.${value}`, { defaultValue: value });
  return value;
}

function EditForm({ saved, societyId, onSaved, onCancel }) {
  const { t } = useTranslation("platform");
  const today = todayInIst();
  const [form, setForm] = useState(saved);
  const [errors, setErrors] = useState({});
  const [failure, setFailure] = useState(null);
  const [saving, setSaving] = useState(false);
  const set = (key) => (event) => setForm((f) => ({ ...f, [key]: event.target.value }));
  const err = (key) =>
    errors[key]
      ? errors[key] === "CANNOT_CLEAR"
        ? t("registration.cannotClear")
        : errorText(t, errors[key])
      : null;

  async function submit(event) {
    event.preventDefault();
    setFailure(null);
    const { changes, errors: found } = diffRegistration(form, saved, today);
    setErrors(found);
    if (Object.keys(found).length > 0) {
      const first = FIELDS.find((f) => found[f.key]);
      document.getElementById(`regpane-${first.key}`)?.focus();
      return;
    }
    if (Object.keys(changes).length === 0) {
      setFailure(t("registration.noChanges"));
      return;
    }
    setSaving(true);
    const supabase = createSupabaseBrowserClient();
    const res = await settle(() =>
      adminUpdateSocietyRegistration(supabase, { societyId, ...changes }),
    );
    setSaving(false);
    if (res.error) {
      if (SERVER_FIELD[res.error]) setErrors({ [SERVER_FIELD[res.error]]: res.error });
      else setFailure(errorText(t, res.error));
      return;
    }
    onSaved(res.data);
  }

  return (
    <form noValidate onSubmit={submit} className="flex flex-col gap-5">
      <p className="type-body-sm text-muted-foreground">{t("registration.cannotClear")}</p>
      <div className="grid gap-5 sm:grid-cols-2">
        <FormField
          label={t("register.registrationNumber")}
          optional
          error={err("registrationNumber")}
        >
          <TextInput
            id="regpane-registrationNumber"
            value={form.registrationNumber}
            onChange={set("registrationNumber")}
          />
        </FormField>
        <FormField label={t("register.societyType")} optional error={err("societyType")}>
          <select
            id="regpane-societyType"
            value={form.societyType}
            onChange={set("societyType")}
            className={CONTROL_CLASS}
          >
            <option value="">{t("register.chooseType")}</option>
            {SOCIETY_TYPE.map((type) => (
              <option key={type} value={type}>
                {t(`societyType.${type}`)}
              </option>
            ))}
          </select>
        </FormField>
        <FormField label={t("register.registrationDate")} optional error={err("registrationDate")}>
          <DatePicker
            id="regpane-registrationDate"
            value={form.registrationDate}
            onChange={(value) => setForm((f) => ({ ...f, registrationDate: value }))}
            max={today}
            captionLayout="dropdown"
          />
        </FormField>
        <FormField label={t("register.officialEmail")} optional error={err("officialEmail")}>
          <TextInput
            id="regpane-officialEmail"
            type="email"
            value={form.officialEmail}
            onChange={set("officialEmail")}
          />
        </FormField>
        <FormField label={t("register.officialPhone")} optional error={err("officialPhone")}>
          <TextInput
            id="regpane-officialPhone"
            type="tel"
            value={form.officialPhone}
            onChange={set("officialPhone")}
          />
        </FormField>
        <FormField label={t("register.country")} required error={err("country")}>
          <TextInput id="regpane-country" value={form.country} onChange={set("country")} />
        </FormField>
      </div>
      {failure ? <Notice tone="warning">{failure}</Notice> : null}
      <FormActions
        submitLabel={t("registration.save")}
        submittingLabel={t("registration.saving")}
        submitting={saving}
        onCancel={onCancel}
        cancelLabel={t("common.cancel")}
      />
    </form>
  );
}

export function RegistrationPane({ societyId }) {
  const { t } = useTranslation("platform");
  const [state, setState] = useState({ data: null, loading: true, error: null });
  const [editing, setEditing] = useState(false);
  const [saved, setSaved] = useState(false);

  const load = useCallback(async () => {
    setState((s) => ({ ...s, loading: true, error: null }));
    const res = await settle(() =>
      getSocietyRegistration(createSupabaseBrowserClient(), societyId),
    );
    setState({ data: res.data ?? null, loading: false, error: res.error ?? null });
  }, [societyId]);

  useEffect(() => {
    load();
  }, [load]);

  if (state.loading && !state.data) return <LoadingState variant="list" rows={4} />;
  if (state.error) return <ErrorState description={t("registration.loadError")} onRetry={load} />;
  const reg = state.data;
  if (!reg) return null;

  if (editing) {
    return (
      <EditForm
        saved={toForm(reg)}
        societyId={societyId}
        onCancel={() => setEditing(false)}
        onSaved={(next) => {
          setState({ data: { ...reg, ...next }, loading: false, error: null });
          setEditing(false);
          setSaved(true);
        }}
      />
    );
  }

  const values = toForm(reg);
  return (
    <div className="flex flex-col gap-5">
      {saved ? (
        <Notice tone="success" onDismiss={() => setSaved(false)}>
          {t("registration.saved")}
        </Notice>
      ) : null}
      <dl className="divide-y divide-border">
        {FIELDS.map((field) => (
          <div key={field.key} className="flex flex-col gap-0.5 py-2.5 sm:flex-row sm:gap-4">
            <dt className="type-body-sm shrink-0 text-muted-foreground sm:w-44">
              {t(field.label)}
            </dt>
            <dd className="type-body min-w-0 break-words text-foreground">
              {displayValue(field, values[field.key], t)}
            </dd>
          </div>
        ))}
        <div className="flex flex-col gap-0.5 py-2.5 sm:flex-row sm:gap-4">
          <dt className="type-body-sm shrink-0 text-muted-foreground sm:w-44">
            {t("register.setup")}
          </dt>
          <dd className="type-body text-foreground">
            {reg.setup_completed_at ? t("register.setupDone") : t("register.setupPending")}
          </dd>
        </div>
      </dl>
      <Button
        type="button"
        variant="outline"
        size="touch"
        className="self-start"
        onClick={() => {
          setSaved(false);
          setEditing(true);
        }}
      >
        {t("registration.edit")}
      </Button>
    </div>
  );
}
