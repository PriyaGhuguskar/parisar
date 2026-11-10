"use client";

// Step 2: who you are and which flat. Wing -> Floor -> Flat come from the society's
// real structure (onboard_structure_for_code). Resident type is a separate field
// from any society title.

import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  FormActions,
  FormField,
  PhoneInput,
  SearchableSelect,
  SurfaceCard,
  TextInput,
} from "@/components/kit";
import {
  findFlat,
  findWing,
  flatOptions,
  floorOptions,
  wingHasFloors,
  wingOptions,
} from "../lib/structure";
import { checkMobile, checkName, firstError } from "../lib/validation";

const ORDER = ["name", "wing", "floor", "flat", "residentType", "alt"];

export function validateDetails(form, structure, { authorityMode }) {
  const wing = findWing(structure, form.wingId);
  const flat = findFlat(wing, form.flatId);
  const errors = {};
  errors.name = checkName(form.name);
  if (!wing) errors.wing = "validation.wingRequired";
  if (wing && wingHasFloors(wing) && !form.floorId) errors.floor = "validation.floorRequired";
  if (!flat) errors.flat = "validation.flatRequired";
  if (!form.residentType) errors.residentType = "validation.residentTypeRequired";
  if (form.residentType === "family_member" && flat && !flat.taken && !authorityMode) {
    errors.residentType = "validation.familyNeedsHousehold";
  }
  errors.alt = checkMobile(form.alt);
  return errors;
}

export function DetailsStep({
  structure,
  form,
  onChange,
  phoneDisplay,
  authorityMode,
  onBack,
  onNext,
}) {
  const { t } = useTranslation("resident-onboarding");
  const [errors, setErrors] = useState({});
  const wing = findWing(structure, form.wingId);
  const wingOpts = useMemo(() => wingOptions(structure, t), [structure, t]);
  const floorOpts = useMemo(() => floorOptions(wing, t), [wing, t]);
  const flatOpts = useMemo(() => flatOptions(wing, form.floorId, t), [wing, form.floorId, t]);
  const types = authorityMode ? ["owner", "tenant"] : ["owner", "tenant", "family_member"];
  const noFlats = (structure?.wings ?? []).every((w) => (w.flats ?? []).length === 0);

  function submit(e) {
    e.preventDefault();
    const next = validateDetails(form, structure, { authorityMode });
    setErrors(next);
    const first = firstError(next, ORDER);
    if (first) {
      document.getElementById(`details-${first}`)?.focus();
      return;
    }
    onNext();
  }

  const err = (k) => (errors[k] ? t(errors[k]) : undefined);

  // Editing a field clears its error, so a fixed field stops showing as wrong.
  // Only the field set by the person clears: wing clears wing, not floor/flat.
  function change(patch, field) {
    setErrors((current) => {
      if (!current[field]) return current;
      const next = { ...current };
      delete next[field];
      return next;
    });
    onChange(patch);
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-6" noValidate>
      <SurfaceCard className="flex flex-col gap-5 p-5 sm:p-6">
        <h2 className="type-h3 text-foreground">{t("details.you")}</h2>
        <FormField label={t("details.mobile")} hint={t("details.mobileHint")}>
          <TextInput value={phoneDisplay} readOnly disabled />
        </FormField>
        <FormField label={t("details.name")} required error={err("name")}>
          <TextInput
            id="details-name"
            autoComplete="name"
            value={form.name}
            placeholder={t("details.namePlaceholder")}
            onChange={(e) => change({ name: e.target.value }, "name")}
          />
        </FormField>
        <FormField label={t("details.alt")} optional hint={t("details.altHint")} error={err("alt")}>
          <PhoneInput
            id="details-alt"
            value={form.alt}
            onChange={(digits) => change({ alt: digits }, "alt")}
          />
        </FormField>
      </SurfaceCard>

      <SurfaceCard className="flex flex-col gap-5 p-5 sm:p-6">
        <div>
          <h2 className="type-h3 text-foreground">{t("details.flatTitle")}</h2>
          <p className="type-body-sm mt-1 text-muted-foreground">
            {t("details.flatHint", { society: structure?.society_name ?? "" })}
          </p>
        </div>
        {noFlats ? (
          <p className="type-body-sm rounded-lg bg-muted p-3 text-muted-foreground">
            {t("details.noFlats")}
          </p>
        ) : null}
        <FormField label={t("details.wing")} required error={err("wing")}>
          <SearchableSelect
            id="details-wing"
            options={wingOpts}
            value={form.wingId}
            placeholder={t("details.wingPlaceholder")}
            emptyText={t("details.noMatch")}
            onChange={(value) => change({ wingId: value, floorId: "", flatId: "" }, "wing")}
          />
        </FormField>
        {wingHasFloors(wing) ? (
          <FormField label={t("details.floor")} required error={err("floor")}>
            <SearchableSelect
              id="details-floor"
              options={floorOpts}
              value={form.floorId}
              placeholder={t("details.floorPlaceholder")}
              emptyText={t("details.noMatch")}
              onChange={(value) => change({ floorId: value, flatId: "" }, "floor")}
            />
          </FormField>
        ) : null}
        <FormField
          label={t("details.flat")}
          required
          hint={t("details.flatTakenHint")}
          error={err("flat")}
        >
          <SearchableSelect
            id="details-flat"
            options={flatOpts}
            value={form.flatId}
            disabled={!wing || (wingHasFloors(wing) && !form.floorId)}
            placeholder={t("details.flatPlaceholder")}
            emptyText={t("details.noMatch")}
            onChange={(value) => change({ flatId: value }, "flat")}
          />
        </FormField>
        <FormField label={t("details.residentType")} required group error={err("residentType")}>
          <div id="details-residentType" tabIndex={-1} className="grid gap-2 sm:grid-cols-3">
            {types.map((type) => (
              <label
                key={type}
                className="focus-within:ring-ring flex min-h-11 cursor-pointer items-center gap-2 rounded-lg border border-input bg-card px-3 py-2 focus-within:ring-2 has-[:checked]:border-primary has-[:checked]:bg-primary-soft"
              >
                <input
                  type="radio"
                  name="residentType"
                  value={type}
                  checked={form.residentType === type}
                  onChange={() => change({ residentType: type }, "residentType")}
                  className="size-4 accent-[var(--primary)]"
                />
                <span className="type-body text-foreground">{t(`residentType.${type}`)}</span>
              </label>
            ))}
          </div>
        </FormField>
      </SurfaceCard>
      <FormActions
        submitLabel={t("common.continue")}
        onBack={onBack}
        backLabel={t("common.back")}
      />
    </form>
  );
}
