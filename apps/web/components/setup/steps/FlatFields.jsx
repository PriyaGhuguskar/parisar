"use client";

// Flat attribute fields shared by the bulk generator and the single-flat editor:
// type, area, bedrooms, parking slot, status. Values are strings; setupModel's
// flatPayload() turns them into the RPC shape. Native selects: short fixed lists,
// and they behave well inside dialogs and on phones.

import { FLAT_STATUS, FLAT_TYPE } from "@parisar/shared-types";
import { useTranslation } from "react-i18next";
import { CONTROL_CLASS, FormField, TextInput } from "@/components/kit";
import { cn } from "@/lib/utils";
import { LIMITS } from "../lib/setupModel";

export const EMPTY_ATTRS = {
  flatType: "",
  areaSqft: "",
  bedrooms: "",
  parkingSlot: "",
  status: "vacant",
};

export function FlatFields({ value, onChange, errors = {}, withParking = true, idPrefix }) {
  const { t } = useTranslation("setup-wizard");
  const set = (patch) => onChange({ ...value, ...patch });
  const err = (k) => (errors[k] ? t(errors[k]) : null);

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <FormField label={t("flats.type")} optional>
        <select
          id={idPrefix ? `${idPrefix}-type` : undefined}
          value={value.flatType}
          onChange={(e) => set({ flatType: e.target.value })}
          className={cn(CONTROL_CLASS, "w-full")}
        >
          <option value="">{t("flats.typeNone")}</option>
          {FLAT_TYPE.map((type) => (
            <option key={type} value={type}>
              {t(`flatType.${type}`)}
            </option>
          ))}
        </select>
      </FormField>
      <FormField label={t("flats.status")} required>
        <select
          value={value.status}
          onChange={(e) => set({ status: e.target.value })}
          className={cn(CONTROL_CLASS, "w-full")}
        >
          {FLAT_STATUS.map((status) => (
            <option key={status} value={status}>
              {t(`flatStatus.${status}`)}
            </option>
          ))}
        </select>
      </FormField>
      <FormField
        label={t("flats.area")}
        optional
        hint={t("flats.areaHint")}
        error={err("areaSqft")}
      >
        <TextInput
          inputMode="decimal"
          value={value.areaSqft}
          onChange={(e) => set({ areaSqft: e.target.value.replace(/[^\d.]/g, "").slice(0, 9) })}
        />
      </FormField>
      <FormField label={t("flats.bedrooms")} optional error={err("bedrooms")}>
        <TextInput
          inputMode="numeric"
          value={value.bedrooms}
          onChange={(e) => set({ bedrooms: e.target.value.replace(/\D/g, "").slice(0, 2) })}
        />
      </FormField>
      {withParking ? (
        <FormField
          label={t("flats.parking")}
          optional
          hint={t("flats.parkingHint")}
          error={err("parkingSlot")}
        >
          <TextInput
            value={value.parkingSlot}
            maxLength={LIMITS.parkingSlot}
            onChange={(e) => set({ parkingSlot: e.target.value })}
          />
        </FormField>
      ) : null}
    </div>
  );
}
