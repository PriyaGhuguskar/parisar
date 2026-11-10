"use client";

// The fields of the staff form, grouped into cards. Controlled: StaffForm owns
// `form` and `errors` (error keys, translated here). Control ids are
// `staff-<field>` so the form can move focus to the first invalid one.
//
// JavaScript only — no TypeScript per CLAUDE.md.

import { useTranslation } from "react-i18next";
import {
  CONTROL_CLASS,
  DatePicker,
  FormField,
  PhoneInput,
  SurfaceCard,
  TextInput,
} from "@/components/kit";
import { ID_PROOF_TYPES, STAFF_CATEGORIES, STAFF_SHIFTS } from "./staffFormModel";

function Select({ id, value, onChange, placeholder, options, ...rest }) {
  return (
    <select
      id={id}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={CONTROL_CLASS}
      {...rest}
    >
      <option value="">{placeholder}</option>
      {options.map(([v, label]) => (
        <option key={v} value={v}>
          {label}
        </option>
      ))}
    </select>
  );
}

/**
 * @param {{ form: object, errors: Record<string,string>, onChange: (key: string, value: string) => void,
 *   disabled?: boolean, maxJoiningDate?: string, children?: React.ReactNode }} props
 *   `children` renders inside the ID proof card (the upload, once the record exists).
 */
export function StaffFormFields({
  form,
  errors,
  onChange,
  disabled = false,
  maxJoiningDate,
  children,
}) {
  const { t } = useTranslation("staff-nav");
  const err = (key) => (errors[key] ? t(`staffForm.error.${errors[key]}`) : undefined);
  const text = (key) => (e) => onChange(key, e.target.value);

  return (
    <>
      <SurfaceCard className="flex flex-col gap-5 p-5 sm:p-6">
        <h2 className="type-h3 text-foreground">{t("staffForm.section.details")}</h2>
        <div className="grid gap-5 sm:grid-cols-2">
          <FormField label={t("staffForm.field.name")} required error={err("name")}>
            <TextInput
              id="staff-name"
              value={form.name}
              maxLength={80}
              autoComplete="off"
              disabled={disabled}
              onChange={text("name")}
            />
          </FormField>
          <FormField label={t("staffForm.field.lastName")} optional error={err("lastName")}>
            <TextInput
              id="staff-lastName"
              value={form.lastName}
              maxLength={80}
              autoComplete="off"
              disabled={disabled}
              onChange={text("lastName")}
            />
          </FormField>
        </div>
        <FormField
          label={t("staffForm.field.category")}
          required
          hint={t("staffForm.hint.category")}
          error={err("category")}
        >
          <Select
            id="staff-category"
            value={form.category}
            disabled={disabled}
            onChange={(v) => onChange("category", v)}
            placeholder={t("staffForm.choose")}
            options={STAFF_CATEGORIES.map((c) => [c, t(`staffRole.${c}`)])}
          />
        </FormField>
        <div className="grid gap-5 sm:grid-cols-2">
          <FormField label={t("staffForm.field.phone")} optional error={err("phone")}>
            <PhoneInput
              id="staff-phone"
              value={form.phone}
              disabled={disabled}
              onChange={(digits) => onChange("phone", digits)}
            />
          </FormField>
          <FormField label={t("staffForm.field.email")} optional error={err("email")}>
            <TextInput
              id="staff-email"
              type="email"
              inputMode="email"
              value={form.email}
              maxLength={254}
              disabled={disabled}
              onChange={text("email")}
            />
          </FormField>
        </div>
      </SurfaceCard>

      <SurfaceCard className="flex flex-col gap-5 p-5 sm:p-6">
        <h2 className="type-h3 text-foreground">{t("staffForm.section.work")}</h2>
        <div className="grid gap-5 sm:grid-cols-2">
          <FormField label={t("staffForm.field.joiningDate")} optional error={err("joiningDate")}>
            <DatePicker
              id="staff-joiningDate"
              value={form.joiningDate}
              disabled={disabled}
              clearable
              max={maxJoiningDate}
              captionLayout="dropdown"
              onChange={(v) => onChange("joiningDate", v ?? "")}
            />
          </FormField>
          <FormField label={t("staffForm.field.shift")} optional error={err("shift")}>
            <Select
              id="staff-shift"
              value={form.shift}
              disabled={disabled}
              onChange={(v) => onChange("shift", v)}
              placeholder={t("staffForm.notSet")}
              options={STAFF_SHIFTS.map((s) => [s, t(`shift.${s}`)])}
            />
          </FormField>
          <FormField label={t("staffForm.field.employeeId")} optional error={err("employeeId")}>
            <TextInput
              id="staff-employeeId"
              value={form.employeeId}
              maxLength={40}
              autoComplete="off"
              disabled={disabled}
              onChange={text("employeeId")}
            />
          </FormField>
          <FormField
            label={t("staffForm.field.vendorName")}
            optional
            hint={t("staffForm.hint.vendorName")}
            error={err("vendorName")}
          >
            <TextInput
              id="staff-vendorName"
              value={form.vendorName}
              maxLength={120}
              disabled={disabled}
              onChange={text("vendorName")}
            />
          </FormField>
        </div>
      </SurfaceCard>

      <SurfaceCard className="flex flex-col gap-5 p-5 sm:p-6">
        <h2 className="type-h3 text-foreground">{t("staffForm.section.emergency")}</h2>
        <div className="grid gap-5 sm:grid-cols-2">
          <FormField
            label={t("staffForm.field.emergencyContactName")}
            optional
            error={err("emergencyContactName")}
          >
            <TextInput
              id="staff-emergencyContactName"
              value={form.emergencyContactName}
              maxLength={80}
              disabled={disabled}
              onChange={text("emergencyContactName")}
            />
          </FormField>
          <FormField
            label={t("staffForm.field.emergencyContactPhone")}
            optional
            error={err("emergencyContactPhone")}
          >
            <PhoneInput
              id="staff-emergencyContactPhone"
              value={form.emergencyContactPhone}
              disabled={disabled}
              onChange={(digits) => onChange("emergencyContactPhone", digits)}
            />
          </FormField>
        </div>
      </SurfaceCard>

      <SurfaceCard className="flex flex-col gap-5 p-5 sm:p-6">
        <h2 className="type-h3 text-foreground">{t("staffForm.section.idProof")}</h2>
        <FormField label={t("staffForm.field.idProofType")} optional error={err("idProofType")}>
          <Select
            id="staff-idProofType"
            value={form.idProofType}
            disabled={disabled}
            onChange={(v) => onChange("idProofType", v)}
            placeholder={t("staffForm.notSet")}
            options={ID_PROOF_TYPES.map((p) => [p, t(`idProof.${p}`)])}
          />
        </FormField>
        {children}
      </SurfaceCard>
    </>
  );
}
