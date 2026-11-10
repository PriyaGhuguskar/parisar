"use client";

// Optional family list, sent with onboard_resident as before. A phone given here
// becomes that person's own login path (claim_family_membership).

import { Plus, X } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import {
  FormActions,
  FormField,
  Notice,
  PhoneInput,
  SurfaceCard,
  TextInput,
} from "@/components/kit";
import { Button } from "@/components/ui/button";
import { checkMobile } from "../lib/validation";

export function validateFamily(family) {
  return family.map((m) => {
    const hasAny = m.name.trim() || m.relation.trim() || m.phone;
    return {
      name: hasAny && m.name.trim().length < 2 ? "validation.nameLength" : null,
      phone: checkMobile(m.phone),
    };
  });
}

export function FamilyStep({ family, onChange, onBack, onNext, busy, error, finalStep }) {
  const { t } = useTranslation("resident-onboarding");
  const [errors, setErrors] = useState([]);

  function update(i, patch) {
    onChange(family.map((row, idx) => (idx === i ? { ...row, ...patch } : row)));
  }

  function submit(e) {
    e.preventDefault();
    const next = validateFamily(family);
    setErrors(next);
    const bad = next.findIndex((r) => r.name || r.phone);
    if (bad >= 0) {
      document.getElementById(`family-${bad}-${next[bad].name ? "name" : "phone"}`)?.focus();
      return;
    }
    onNext();
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-6" noValidate>
      <SurfaceCard className="flex flex-col gap-5 p-5 sm:p-6">
        <div>
          <h2 className="type-h3 text-foreground">{t("family.title")}</h2>
          <p className="type-body-sm mt-1 text-muted-foreground">{t("family.hint")}</p>
        </div>
        {family.length === 0 ? (
          <p className="type-body-sm text-muted-foreground">{t("family.empty")}</p>
        ) : null}
        {family.map((m, i) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: positional rows with no id yet
          <fieldset key={i} className="flex flex-col gap-4 rounded-lg border border-border p-4">
            <legend className="sr-only">{t("family.person", { n: i + 1 })}</legend>
            <div className="flex items-center justify-between gap-2">
              <span aria-hidden="true" className="type-label text-foreground">
                {t("family.person", { n: i + 1 })}
              </span>
              <Button
                type="button"
                variant="ghost"
                size="icon-touch"
                aria-label={t("family.remove", { n: i + 1 })}
                onClick={() => onChange(family.filter((_, idx) => idx !== i))}
              >
                <X aria-hidden="true" />
              </Button>
            </div>
            <FormField
              label={t("family.name")}
              required
              error={errors[i]?.name ? t(errors[i].name) : undefined}
            >
              <TextInput
                id={`family-${i}-name`}
                value={m.name}
                onChange={(e) => update(i, { name: e.target.value })}
              />
            </FormField>
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField label={t("family.relation")} optional>
                <TextInput
                  value={m.relation}
                  placeholder={t("family.relationPlaceholder")}
                  onChange={(e) => update(i, { relation: e.target.value })}
                />
              </FormField>
              <FormField
                label={t("family.phone")}
                optional
                hint={t("family.phoneHint")}
                error={errors[i]?.phone ? t(errors[i].phone) : undefined}
              >
                <PhoneInput
                  id={`family-${i}-phone`}
                  value={m.phone}
                  onChange={(digits) => update(i, { phone: digits })}
                />
              </FormField>
            </div>
          </fieldset>
        ))}
        <Button
          type="button"
          variant="outline"
          size="touch"
          className="self-start"
          onClick={() => onChange([...family, { name: "", relation: "", phone: "" }])}
        >
          <Plus aria-hidden="true" />
          {t("family.add")}
        </Button>
      </SurfaceCard>
      {error ? <Notice tone="danger">{error}</Notice> : null}
      <FormActions
        submitLabel={finalStep ? t("common.finish") : t("common.continue")}
        submitting={busy}
        onBack={onBack}
        backLabel={t("common.back")}
      />
    </form>
  );
}
