"use client";

// Step 1: the society's registered details, prefilled from get_society_registration.
// Parisar staff entered them at registration and no RPC lets an authority change
// them (admin_update_society_registration is staff-only), so this step is a
// read-only review: confirming it marks society_details completed.

import { setupCompleteStep } from "@parisar/api-client";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { FormActions, Notice, SurfaceCard } from "@/components/kit";
import { callRpc } from "../lib/rpc";

function Row({ label, value, empty }) {
  return (
    <div className="flex flex-col gap-0.5 sm:flex-row sm:gap-4">
      <dt className="type-body-sm text-muted-foreground sm:w-48 sm:shrink-0">{label}</dt>
      <dd className="type-body min-w-0 break-words text-foreground">
        {value || <span className="text-muted-foreground">{empty}</span>}
      </dd>
    </div>
  );
}

function formatDate(value, lang) {
  if (!value) return "";
  try {
    return new Intl.DateTimeFormat(`${String(lang || "en").slice(0, 2)}-IN-u-nu-latn`, {
      day: "numeric",
      month: "long",
      year: "numeric",
    }).format(new Date(`${value}T00:00:00`));
  } catch {
    return value;
  }
}

export function DetailsStep({ societyId, state, registration, reload, errorText, onNext }) {
  const { t, i18n } = useTranslation("setup-wizard");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const reg = registration ?? {};
  const empty = t("details.notProvided");

  const address = [reg.address_line, reg.landmark, reg.city, reg.state, reg.pincode, reg.country]
    .filter(Boolean)
    .join(", ");

  async function confirm(e) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    const res = await callRpc((sb) =>
      setupCompleteStep(sb, { societyId, step: "society_details" }),
    );
    if (res.error) {
      setError(errorText(res.error));
      setSaving(false);
      return;
    }
    await reload();
    setSaving(false);
    onNext();
  }

  return (
    <form onSubmit={confirm} className="flex flex-col gap-8" noValidate>
      <SurfaceCard className="flex flex-col gap-5 p-5 sm:p-6">
        <div>
          <h2 className="type-h3 text-foreground">{t("details.title")}</h2>
          <p className="type-body-sm mt-1 text-muted-foreground">{t("details.lead")}</p>
        </div>
        {registration ? null : (
          <Notice tone="warning" title={t("details.unavailableTitle")}>
            {t("details.unavailable")}
          </Notice>
        )}
        <dl className="flex flex-col gap-3">
          <Row label={t("details.name")} value={reg.name ?? state?.society?.name} empty={empty} />
          <Row label={t("details.code")} value={reg.code ?? state?.society?.code} empty={empty} />
          <Row
            label={t("details.registrationNumber")}
            value={reg.registration_number}
            empty={empty}
          />
          <Row
            label={t("details.societyType")}
            value={reg.society_type ? t(`societyType.${reg.society_type}`) : ""}
            empty={empty}
          />
          <Row
            label={t("details.registrationDate")}
            value={formatDate(reg.registration_date, i18n?.language)}
            empty={empty}
          />
          <Row label={t("details.officialEmail")} value={reg.official_email} empty={empty} />
          <Row label={t("details.officialPhone")} value={reg.official_phone} empty={empty} />
          <Row label={t("details.address")} value={address} empty={empty} />
        </dl>
        <Notice tone="info">{t("details.changeNote")}</Notice>
      </SurfaceCard>
      {error ? <Notice tone="danger">{error}</Notice> : null}
      <FormActions
        submitLabel={t("details.confirm")}
        submittingLabel={t("saving")}
        submitting={saving}
        sticky
      />
    </form>
  );
}
