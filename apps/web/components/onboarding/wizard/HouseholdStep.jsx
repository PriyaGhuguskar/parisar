"use client";

// Same-flat flow. Someone already lives in the chosen flat, so nothing is granted
// here: "Yes" sends a household request that an owner (or, for family, a tenant)
// of the flat or the society approves; "No" lets an owner ask the society to
// review the claim (onboard_resident's pending_review queue). Only masked names
// and a count are shown, never phones.

import { Users } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { FormActions, FormField, Notice, SurfaceCard, TextArea } from "@/components/kit";
import { Button } from "@/components/ui/button";
import { checkOptionalText } from "../lib/validation";

export const RELATIONSHIPS = ["spouse", "parent", "child", "sibling", "other"];

export function HouseholdStep({
  lookup,
  residentType,
  value,
  onChange,
  onBack,
  onRequest,
  onAskSociety,
  busy,
  error,
  finalStep,
}) {
  const { t } = useTranslation("resident-onboarding");
  const [errors, setErrors] = useState({});
  const answer = value.answer;

  function submit(e) {
    e.preventDefault();
    const next = {
      relationship: value.relationship ? null : "validation.relationshipRequired",
      message: checkOptionalText(value.message, 500),
    };
    setErrors(next);
    if (next.relationship || next.message) {
      document
        .getElementById(next.relationship ? "household-relationship" : "household-message")
        ?.focus();
      return;
    }
    onRequest();
  }

  if (lookup.already_on_flat) {
    return (
      <Notice tone="info" title={t("household.alreadyTitle")}>
        {t("household.alreadyBody", { flat: lookup.flat_label })}
      </Notice>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <SurfaceCard className="flex flex-col gap-4 p-5 sm:p-6">
        <div className="flex items-start gap-3">
          <Users aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-primary" />
          <div>
            <h2 className="type-h3 text-foreground">
              {t("household.foundTitle", { flat: lookup.flat_label })}
            </h2>
            <p className="type-body-sm mt-1 text-muted-foreground">
              {t("household.foundBody", { count: lookup.member_count })}
            </p>
          </div>
        </div>
        {lookup.masked_members?.length ? (
          <ul className="flex flex-wrap gap-2" aria-label={t("household.membersLabel")}>
            {lookup.masked_members.map((name, i) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: masked names can repeat
              <li key={i} className="type-body-sm rounded-full bg-muted px-3 py-1 text-foreground">
                {name}
              </li>
            ))}
          </ul>
        ) : null}
        <p className="type-body font-medium text-foreground">{t("household.question")}</p>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Button
            type="button"
            size="touch"
            variant={answer === "yes" ? "default" : "outline"}
            aria-pressed={answer === "yes"}
            onClick={() => onChange({ answer: "yes" })}
          >
            {t("household.yes")}
          </Button>
          <Button
            type="button"
            size="touch"
            variant={answer === "no" ? "default" : "outline"}
            aria-pressed={answer === "no"}
            onClick={() => onChange({ answer: "no" })}
          >
            {t("household.no")}
          </Button>
        </div>
      </SurfaceCard>

      {answer === "yes" ? (
        <form onSubmit={submit} className="flex flex-col gap-6" noValidate>
          <SurfaceCard className="flex flex-col gap-5 p-5 sm:p-6">
            <p className="type-body-sm text-muted-foreground">
              {t(residentType === "owner" ? "household.coOwnerHint" : "household.familyHint")}
            </p>
            <FormField
              label={t("household.relationship")}
              required
              group
              error={errors.relationship ? t(errors.relationship) : undefined}
            >
              <div
                id="household-relationship"
                tabIndex={-1}
                className="grid grid-cols-2 gap-2 sm:grid-cols-3"
              >
                {RELATIONSHIPS.map((r) => (
                  <label
                    key={r}
                    className="flex min-h-11 cursor-pointer items-center gap-2 rounded-lg border border-input bg-card px-3 py-2 has-[:checked]:border-primary has-[:checked]:bg-primary-soft"
                  >
                    <input
                      type="radio"
                      name="relationship"
                      value={r}
                      checked={value.relationship === r}
                      onChange={() => onChange({ relationship: r })}
                      className="size-4 accent-[var(--primary)]"
                    />
                    <span className="type-body text-foreground">{t(`relationship.${r}`)}</span>
                  </label>
                ))}
              </div>
            </FormField>
            <FormField
              label={t("household.message")}
              optional
              hint={t("household.messageHint")}
              error={errors.message ? t(errors.message) : undefined}
            >
              <TextArea
                id="household-message"
                rows={3}
                maxLength={500}
                value={value.message}
                onChange={(e) => onChange({ message: e.target.value })}
              />
            </FormField>
          </SurfaceCard>
          <Notice tone="info">{t("household.approvalNote")}</Notice>
          {error ? <Notice tone="danger">{error}</Notice> : null}
          <FormActions
            submitLabel={finalStep ? t("household.send") : t("common.continue")}
            submitting={busy}
            onBack={onBack}
            backLabel={t("common.back")}
          />
        </form>
      ) : null}

      {answer === "no" ? (
        <SurfaceCard className="flex flex-col gap-4 p-5 sm:p-6">
          {residentType === "owner" ? (
            <>
              <p className="type-body text-foreground">{t("household.noOwner")}</p>
              {error ? <Notice tone="danger">{error}</Notice> : null}
              <FormActions
                submitLabel={finalStep ? t("household.askSociety") : t("common.continue")}
                submitting={busy}
                onSubmit={onAskSociety}
                onBack={onBack}
                backLabel={t("household.otherFlat")}
              />
            </>
          ) : (
            <>
              <p className="type-body text-foreground">{t("household.noFamily")}</p>
              <Button
                type="button"
                variant="outline"
                size="touch"
                className="self-start"
                onClick={onBack}
              >
                {t("household.otherFlat")}
              </Button>
            </>
          )}
        </SurfaceCard>
      ) : null}

      {!answer ? (
        <Button type="button" variant="ghost" size="touch" className="self-start" onClick={onBack}>
          {t("common.back")}
        </Button>
      ) : null}
    </div>
  );
}
