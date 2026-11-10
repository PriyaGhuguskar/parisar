"use client";

// Check a Connect With Us request with its ID and the mobile number that sent it,
// through get_connect_request_status. A wrong pair and a missing code give the same
// answer, by design, so the message never says which part was wrong.

import { getConnectRequestStatus } from "@parisar/api-client";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { FormActions, FormField, Notice, PhoneInput, TextInput } from "@/components/kit";
import { isValidIndianMobile, toE164 } from "@/components/kit/lib/phone";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { isValidRequestCode, normalizeRequestCode } from "./lib/connectForm";

const RESULT_ERRORS = {
  REQUEST_NOT_FOUND: { tone: "warning", key: "lookup.errors.notFound" },
  RATE_LIMITED: { tone: "warning", key: "lookup.errors.rateLimited" },
};

export function StatusLookupForm({ initialCode = "", onFound, lookup = getConnectRequestStatus }) {
  const { t } = useTranslation("connect");
  const [code, setCode] = useState(initialCode);
  const [phone, setPhone] = useState("");
  const [errors, setErrors] = useState({});
  const [failure, setFailure] = useState(null);
  const [checking, setChecking] = useState(false);

  async function onSubmit(event) {
    event.preventDefault();
    if (checking) return;
    setFailure(null);
    const next = {};
    if (!isValidRequestCode(code)) next.code = "lookup.errors.code";
    if (!isValidIndianMobile(phone)) next.phone = "lookup.errors.phone";
    setErrors(next);
    if (next.code || next.phone) {
      document.getElementById(next.code ? "lookup-code" : "lookup-phone")?.focus();
      return;
    }

    setChecking(true);
    let result;
    try {
      result = await lookup(createSupabaseBrowserClient(), {
        requestCode: normalizeRequestCode(code),
        phone: toE164(phone),
      });
    } catch {
      result = { error: "UNEXPECTED" };
    }
    setChecking(false);

    if (result && typeof result.request_code === "string" && !result.error) {
      onFound(result);
      return;
    }
    const code_ = String(result?.error ?? "");
    const known =
      RESULT_ERRORS[code_] ?? (code_.endsWith("_RATE_LIMITED") ? RESULT_ERRORS.RATE_LIMITED : null);
    setFailure(known ?? { tone: "danger", key: "lookup.errors.generic" });
  }

  return (
    <form
      onSubmit={onSubmit}
      noValidate
      className="flex flex-col gap-5"
      aria-busy={checking || undefined}
    >
      {failure ? <Notice tone={failure.tone}>{t(failure.key)}</Notice> : null}
      <div className="grid gap-5 sm:grid-cols-2">
        <FormField label={t("lookup.code")} required error={errors.code && t(errors.code)}>
          <TextInput
            id="lookup-code"
            value={code}
            autoComplete="off"
            autoCapitalize="characters"
            spellCheck={false}
            maxLength={20}
            placeholder={t("lookup.codePh")}
            disabled={checking}
            className="uppercase tabular-nums"
            onChange={(e) => {
              setCode(e.target.value);
              setErrors((current) => ({ ...current, code: undefined }));
            }}
          />
        </FormField>
        <FormField label={t("lookup.phone")} required error={errors.phone && t(errors.phone)}>
          <PhoneInput
            id="lookup-phone"
            value={phone}
            disabled={checking}
            onChange={(digits) => {
              setPhone(digits);
              setErrors((current) => ({ ...current, phone: undefined }));
            }}
          />
        </FormField>
      </div>
      <FormActions
        submitLabel={t("lookup.submit")}
        submittingLabel={t("lookup.submitting")}
        submitting={checking}
      />
    </form>
  );
}
