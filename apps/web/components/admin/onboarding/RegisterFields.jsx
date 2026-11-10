"use client";

// Society information and full address for the Register Society form. Controlled:
// the section owns `form` and `errors` (codes, translated here).

import { SOCIETY_TYPE } from "@parisar/shared-types";
import { useTranslation } from "react-i18next";
import { CONTROL_CLASS, DatePicker, FormField, SurfaceCard, TextInput } from "@/components/kit";
import { STATES } from "../console/constants";
import { errorText } from "./lib/rpc";

function useFieldError(t, errors) {
  return (key) => (errors[key] ? errorText(t, errors[key]) : null);
}

export function SocietyFields({ form, errors, onChange, today }) {
  const { t } = useTranslation("platform");
  const err = useFieldError(t, errors);
  const set = (key) => (event) => onChange(key, event.target.value);
  return (
    <SurfaceCard className="flex flex-col gap-5 p-5 sm:p-6">
      <h2 className="type-h3 text-foreground">{t("register.societySection")}</h2>
      <FormField label={t("register.name")} required error={err("name")}>
        <TextInput id="reg-name" value={form.name} maxLength={100} onChange={set("name")} />
      </FormField>
      <div className="grid gap-5 sm:grid-cols-2">
        <FormField label={t("register.societyType")} optional error={err("societyType")}>
          <select
            id="reg-societyType"
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
        <FormField
          label={t("register.registrationNumber")}
          optional
          hint={t("register.registrationNumberHint")}
          error={err("registrationNumber")}
        >
          <TextInput
            id="reg-registrationNumber"
            value={form.registrationNumber}
            maxLength={60}
            onChange={set("registrationNumber")}
          />
        </FormField>
        <FormField label={t("register.registrationDate")} optional error={err("registrationDate")}>
          <DatePicker
            id="reg-registrationDate"
            value={form.registrationDate}
            onChange={(value) => onChange("registrationDate", value)}
            max={today}
            clearable
            captionLayout="dropdown"
          />
        </FormField>
        <FormField label={t("register.officialEmail")} optional error={err("officialEmail")}>
          <TextInput
            id="reg-officialEmail"
            type="email"
            autoComplete="off"
            value={form.officialEmail}
            onChange={set("officialEmail")}
          />
        </FormField>
        <FormField
          label={t("register.officialPhone")}
          optional
          hint={t("register.officialPhoneHint")}
          error={err("officialPhone")}
        >
          <TextInput
            id="reg-officialPhone"
            type="tel"
            maxLength={20}
            value={form.officialPhone}
            onChange={set("officialPhone")}
          />
        </FormField>
      </div>
    </SurfaceCard>
  );
}

export function AddressFields({ form, errors, onChange }) {
  const { t } = useTranslation("platform");
  const err = useFieldError(t, errors);
  const set = (key) => (event) => onChange(key, event.target.value);
  return (
    <SurfaceCard className="flex flex-col gap-5 p-5 sm:p-6">
      <h2 className="type-h3 text-foreground">{t("register.addressSection")}</h2>
      <FormField label={t("register.addressLine")} required error={err("addressLine")}>
        <TextInput id="reg-addressLine" value={form.addressLine} onChange={set("addressLine")} />
      </FormField>
      <FormField label={t("register.landmark")} optional error={err("landmark")}>
        <TextInput id="reg-landmark" value={form.landmark} onChange={set("landmark")} />
      </FormField>
      <div className="grid gap-5 sm:grid-cols-2">
        <FormField label={t("register.city")} required error={err("city")}>
          <TextInput id="reg-city" value={form.city} onChange={set("city")} />
        </FormField>
        <FormField label={t("register.state")} required error={err("state")}>
          <select
            id="reg-state"
            value={form.state}
            onChange={set("state")}
            className={CONTROL_CLASS}
          >
            <option value="">{t("register.chooseState")}</option>
            {STATES.map((state) => (
              <option key={state} value={state}>
                {state}
              </option>
            ))}
          </select>
        </FormField>
        <FormField label={t("register.pincode")} required error={err("pincode")}>
          <TextInput
            id="reg-pincode"
            inputMode="numeric"
            autoComplete="postal-code"
            maxLength={6}
            value={form.pincode}
            onChange={(event) =>
              onChange("pincode", event.target.value.replace(/\D/g, "").slice(0, 6))
            }
          />
        </FormField>
        <FormField label={t("register.country")} required error={err("country")}>
          <TextInput
            id="reg-country"
            value={form.country}
            maxLength={60}
            onChange={set("country")}
          />
        </FormField>
      </div>
    </SurfaceCard>
  );
}
