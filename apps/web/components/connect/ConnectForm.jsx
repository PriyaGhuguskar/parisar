"use client";

// Connect With Us: the public request form at /connect.
//
// Submits through submit_connect_request (docs/onboarding/API.md section 3), which
// validates every field again, rate limits, and returns the request code. Success is
// shown only after the server returns that code: the result goes to sessionStorage and
// the visitor moves to /connect/success. On any failure everything typed stays put.

import { submitConnectRequest } from "@parisar/api-client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  FormActions,
  FormField,
  Notice,
  PhoneInput,
  SurfaceCard,
  TextArea,
  TextInput,
} from "@/components/kit";
import { buttonVariants } from "@/components/ui/button";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { AuthorityNumbersField } from "./AuthorityNumbersField";
import {
  addDaysToDateValue,
  buildConnectPayload,
  CONTACT_NAME_MAX,
  EMPTY_CONNECT_FORM,
  firstInvalidFieldId,
  istDateValue,
  MESSAGE_MAX,
  SOCIETY_NAME_MAX,
  serverErrorState,
  validateConnectForm,
} from "./lib/connectForm";
import { saveLastRequest } from "./lib/connectStorage";
import { ScheduleSection } from "./ScheduleSection";

// Editing a field clears its own error and any slot error it feeds.
const CLEARS = {
  preferredDate: ["preferredDate", "preferredSlot", "alternateSlot"],
  preferredTime: ["preferredTime", "preferredSlot", "alternateSlot"],
  alternateDate: ["alternateDate", "alternateSlot", "alternateTime"],
  alternateTime: ["alternateTime", "alternateSlot", "alternateDate"],
  when: [
    "preferredDate",
    "preferredTime",
    "preferredSlot",
    "alternateDate",
    "alternateTime",
    "alternateSlot",
  ],
};

function withoutKeys(object, keys) {
  const next = { ...object };
  for (const key of keys) delete next[key];
  return next;
}

function Section({ title, description, children }) {
  return (
    <SurfaceCard className="flex flex-col gap-5 p-5 sm:p-6">
      <div className="flex flex-col gap-1">
        <h2 className="type-h3 text-foreground">{title}</h2>
        {description ? <p className="type-body-sm text-muted-foreground">{description}</p> : null}
      </div>
      {children}
    </SurfaceCard>
  );
}

export function ConnectForm({ submit = submitConnectRequest }) {
  const { t } = useTranslation("connect");
  const router = useRouter();
  const [form, setForm] = useState(EMPTY_CONNECT_FORM);
  const [errors, setErrors] = useState({});
  const [notice, setNotice] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const nextRowId = useRef(1);
  const noticeRef = useRef(null);

  const today = useMemo(() => istDateValue(), []);
  const maxDate = useMemo(() => addDaysToDateValue(today, 89), [today]);

  function update(patch) {
    setForm((current) => ({ ...current, ...patch }));
    const keys = Object.keys(patch).flatMap((key) => CLEARS[key] ?? [key]);
    setErrors((current) => withoutKeys(current, keys));
  }

  function addAuthority() {
    const id = `a${nextRowId.current++}`;
    setForm((current) => ({
      ...current,
      authorities: [...current.authorities, { id, name: "", phone: "" }],
    }));
    setErrors((current) => withoutKeys(current, ["authorityList"]));
    return id;
  }

  function removeAuthority(id) {
    setForm((current) => ({
      ...current,
      authorities: current.authorities.filter((row) => row.id !== id),
    }));
    setErrors((current) => {
      if (!current.authorities?.[id]) return current;
      const rest = { ...current.authorities };
      delete rest[id];
      return { ...current, authorities: rest };
    });
  }

  function changeAuthority(id, patch) {
    setForm((current) => ({
      ...current,
      authorities: current.authorities.map((row) => (row.id === id ? { ...row, ...patch } : row)),
    }));
    setErrors((current) => {
      const rowErrors = current.authorities?.[id];
      if (!rowErrors) return withoutKeys(current, ["authorityList"]);
      const nextRow = withoutKeys(rowErrors, Object.keys(patch));
      return {
        ...withoutKeys(current, ["authorityList"]),
        authorities: { ...current.authorities, [id]: nextRow },
      };
    });
  }

  function showErrors(next) {
    setErrors(next);
    const id = firstInvalidFieldId(next, form.authorities);
    if (id) requestAnimationFrame(() => document.getElementById(id)?.focus());
  }

  function showNotice(next) {
    setNotice(next);
    requestAnimationFrame(() => noticeRef.current?.focus());
  }

  async function onSubmit(event) {
    event.preventDefault();
    if (submitting) return;
    setNotice(null);
    const found = validateConnectForm(form);
    if (Object.keys(found).length > 0) {
      showErrors(found);
      return;
    }

    setSubmitting(true);
    let result;
    try {
      result = await submit(createSupabaseBrowserClient(), buildConnectPayload(form));
    } catch {
      result = { error: "UNEXPECTED" };
    }

    if (result && typeof result.request_code === "string" && !result.error) {
      saveLastRequest(result, form.societyName.trim());
      router.push(`/connect/success?code=${encodeURIComponent(result.request_code)}`);
      return;
    }

    setSubmitting(false);
    const state = serverErrorState(result?.error);
    if (state.notice) showNotice(state.notice);
    else showErrors(state.fields);
  }

  const messageLength = form.message.trim().length;

  return (
    <form
      onSubmit={onSubmit}
      noValidate
      className="flex flex-col gap-8"
      aria-busy={submitting || undefined}
    >
      <p className="type-body-sm text-muted-foreground">{t("page.requiredNote")}</p>

      {notice ? (
        <div ref={noticeRef} tabIndex={-1} className="outline-none">
          <Notice
            tone={notice.tone}
            title={t(`notice.${notice.key}Title`)}
            onDismiss={() => setNotice(null)}
            action={
              notice.key === "alreadyOpen" ? (
                <Link
                  href="/connect/success"
                  className={buttonVariants({ variant: "outline", size: "touch" })}
                >
                  {t("notice.alreadyOpenAction")}
                </Link>
              ) : null
            }
          >
            {t(`notice.${notice.key}`)}
          </Notice>
        </div>
      ) : null}

      <Section title={t("form.societySection")}>
        <FormField
          label={t("form.societyName")}
          required
          error={errors.societyName && t(errors.societyName)}
        >
          <TextInput
            id="connect-society"
            value={form.societyName}
            maxLength={SOCIETY_NAME_MAX}
            autoComplete="organization"
            placeholder={t("form.societyNamePh")}
            disabled={submitting}
            onChange={(e) => update({ societyName: e.target.value })}
          />
        </FormField>
      </Section>

      <Section title={t("form.contactSection")}>
        <div className="grid gap-5 sm:grid-cols-2">
          <FormField
            label={t("form.contactName")}
            required
            error={errors.contactName && t(errors.contactName)}
          >
            <TextInput
              id="connect-contact"
              value={form.contactName}
              maxLength={CONTACT_NAME_MAX}
              autoComplete="name"
              placeholder={t("form.contactNamePh")}
              disabled={submitting}
              onChange={(e) => update({ contactName: e.target.value })}
            />
          </FormField>
          <FormField
            label={t("form.phone")}
            required
            hint={t("form.phoneHint")}
            error={errors.phone && t(errors.phone)}
          >
            <PhoneInput
              id="connect-phone"
              value={form.phone}
              disabled={submitting}
              onChange={(digits) => update({ phone: digits })}
            />
          </FormField>
        </div>
        <FormField label={t("form.email")} optional error={errors.email && t(errors.email)}>
          <TextInput
            id="connect-email"
            type="email"
            inputMode="email"
            autoComplete="email"
            value={form.email}
            placeholder={t("form.emailPh")}
            disabled={submitting}
            onChange={(e) => update({ email: e.target.value })}
          />
        </FormField>
      </Section>

      <Section title={t("form.authoritySection")} description={t("form.authorityLead")}>
        <AuthorityNumbersField
          contactName={form.contactName}
          contactPhone={form.phone}
          rows={form.authorities}
          errors={errors.authorities}
          listError={errors.authorityList}
          disabled={submitting}
          onAdd={addAuthority}
          onRemove={removeAuthority}
          onRowChange={changeAuthority}
        />
      </Section>

      <Section title={t("form.scheduleSection")}>
        <ScheduleSection
          form={form}
          errors={errors}
          min={today}
          max={maxDate}
          disabled={submitting}
          onChange={update}
        />
      </Section>

      <Section title={t("form.messageSection")}>
        <FormField
          label={t("form.message")}
          optional
          hint={t("form.messageCount", { count: messageLength, max: MESSAGE_MAX })}
          error={errors.message && t(errors.message)}
        >
          <TextArea
            id="connect-message"
            value={form.message}
            rows={4}
            placeholder={t("form.messagePh")}
            disabled={submitting}
            onChange={(e) => update({ message: e.target.value })}
          />
        </FormField>
      </Section>

      <div className="flex flex-col gap-3">
        <FormActions
          submitLabel={t("form.submit")}
          submittingLabel={t("form.submitting")}
          submitting={submitting}
        />
        <p className="type-body-sm text-muted-foreground">{t("form.privacy")}</p>
      </div>
    </form>
  );
}
