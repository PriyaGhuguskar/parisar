"use client";

// Register Society. Prefilled from a connect request when one is given, or blank
// for "New society". Calls admin_register_society, which creates the society, its
// authorities (the request's numbers included) and its join code, grants the
// chosen features and closes the request. The result screen appears only after
// the server has answered.
//
// Mount it with a `key` per request so a new request starts a fresh form.

import {
  adminFeatureCatalogue,
  adminRegisterSociety,
  getSocietyRegistration,
} from "@parisar/api-client";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { FormActions, Notice, PageHeader } from "@/components/kit";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import {
  firstInvalidId,
  formFromRequest,
  hasErrors,
  SERVER_FIELD,
  toRegisterInput,
  validateRegisterForm,
} from "./lib/registerForm";
import { todayInIst } from "./lib/requestFormat";
import { errorText, settle } from "./lib/rpc";
import { RegisterAuthorities } from "./RegisterAuthorities";
import { RegisterFeatures } from "./RegisterFeatures";
import { AddressFields, SocietyFields } from "./RegisterFields";
import { RegisterResult } from "./RegisterResult";

const AUTHORITY_LIST_CODES = new Set(["AUTHORITY_REQUIRED", "DUPLICATE_AUTHORITY_PHONE"]);
const AUTHORITY_ROW_CODES = new Set(["INVALID_AUTHORITY_NAME", "INVALID_AUTHORITY_PHONE"]);
const NO_ERRORS = { fields: {}, authorities: [], authoritiesError: null };

function useCatalogue() {
  const [catalogue, setCatalogue] = useState({ data: null, loading: true, error: null });
  useEffect(() => {
    let alive = true;
    const supabase = createSupabaseBrowserClient();
    settle(() => adminFeatureCatalogue(supabase)).then((res) => {
      if (alive) setCatalogue({ data: res.data ?? null, loading: false, error: res.error ?? null });
    });
    return () => {
      alive = false;
    };
  }, []);
  return catalogue;
}

export function RegisterSocietySection({
  request = null,
  onRegistered,
  onOpenSociety,
  onBackToRequests,
  onRegisterAnother,
}) {
  const { t } = useTranslation("platform");
  const today = todayInIst();
  const [form, setForm] = useState(() => formFromRequest(request));
  const [errors, setErrors] = useState(NO_ERRORS);
  const [formError, setFormError] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState(null);
  const [selected, setSelected] = useState(() => new Set());
  const [focusId, setFocusId] = useState(null);
  const catalogue = useCatalogue();
  const topRef = useRef(null);

  useEffect(() => {
    if (!focusId) return;
    document.getElementById(focusId)?.focus();
    setFocusId(null);
  }, [focusId]);

  function setField(key, value) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function toggleFeature(key, on) {
    setSelected((current) => {
      const next = new Set(current);
      if (on) next.add(key);
      else next.delete(key);
      return next;
    });
  }

  function applyServerError(code) {
    if (SERVER_FIELD[code]) {
      setErrors({ ...NO_ERRORS, fields: { [SERVER_FIELD[code]]: code } });
      setFocusId(`reg-${SERVER_FIELD[code]}`);
      setFormError(t("register.fixErrors"));
      return;
    }
    if (AUTHORITY_LIST_CODES.has(code) || AUTHORITY_ROW_CODES.has(code)) {
      setErrors({ ...NO_ERRORS, authoritiesError: code });
      setFormError(t("register.fixErrors"));
      return;
    }
    setErrors(NO_ERRORS);
    setFormError(errorText(t, code));
    topRef.current?.scrollIntoView?.({ block: "start" });
  }

  async function submit(event) {
    event.preventDefault();
    const checked = validateRegisterForm(form, today);
    if (hasErrors(checked)) {
      setErrors(checked);
      setFormError(t("register.fixErrors"));
      setFocusId(firstInvalidId(checked));
      return;
    }
    setErrors(NO_ERRORS);
    setFormError(null);
    setSubmitting(true);
    const supabase = createSupabaseBrowserClient();
    const input = toRegisterInput(form, { requestId: request?.id, features: selected });
    const res = await settle(() => adminRegisterSociety(supabase, input));
    if (res.error) {
      setSubmitting(false);
      applyServerError(res.error);
      return;
    }
    // Best effort: the society exists either way; this only adds its status rows.
    const registration = await settle(() => getSocietyRegistration(supabase, res.data.society_id));
    const done = {
      ...res.data,
      name: input.name,
      requestCode: request?.request_code ?? null,
      registration: registration.data ?? null,
    };
    setSubmitting(false);
    setResult(done);
    onRegistered?.(done);
  }

  if (result) {
    return (
      <div className="mx-auto flex w-full max-w-2xl flex-col gap-6">
        <PageHeader title={t("register.title")} />
        <RegisterResult
          result={result}
          onOpenSociety={onOpenSociety}
          onBackToRequests={request ? onBackToRequests : undefined}
          onRegisterAnother={onRegisterAnother}
        />
      </div>
    );
  }

  return (
    <div ref={topRef} className="mx-auto flex w-full max-w-2xl flex-col gap-6">
      <PageHeader title={t("register.title")} description={t("register.description")} />
      {request ? (
        <Notice tone="info">
          {t("register.fromRequest", {
            code: request.request_code,
            society: request.society_name,
            contact: request.contact_name,
          })}
        </Notice>
      ) : null}
      {formError ? <Notice tone="danger">{formError}</Notice> : null}
      <form noValidate onSubmit={submit} className="flex flex-col gap-8">
        <SocietyFields form={form} errors={errors.fields} onChange={setField} today={today} />
        <AddressFields form={form} errors={errors.fields} onChange={setField} />
        <RegisterAuthorities
          authorities={form.authorities}
          errors={errors.authorities}
          listError={errors.authoritiesError}
          onChange={(authorities) => setField("authorities", authorities)}
        />
        <RegisterFeatures catalogue={catalogue} selected={selected} onToggle={toggleFeature} />
        <FormActions
          submitLabel={t("register.submit")}
          submittingLabel={t("register.submitting")}
          submitting={submitting}
          onBack={request ? onBackToRequests : undefined}
          backLabel={t("register.backToRequests")}
          sticky
        />
      </form>
    </div>
  );
}
