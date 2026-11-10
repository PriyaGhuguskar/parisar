"use client";

// New-resident onboarding after OTP: society code -> your details (Wing, Floor,
// Flat, resident type) -> one branch -> PIN.
//
//   owner on a free flat, or an authority  -> family -> onboard_resident (as before)
//   tenant                                 -> tenancy -> tenant_register (owner, then society approve)
//   flat already has residents             -> "Are you already part of this household?"
//        yes -> household_request_access (an owner/tenant of the flat or the society approves)
//        no  -> owner: onboard_resident, which lands in the society's pending_review queue
//
// Nothing here grants access to an occupied flat by itself. The join RPC is not
// idempotent, so once it succeeds a retry after a failed PIN save only retries the PIN.
// Society authorities arrive with their code pre-filled and keep the old path.

import {
  householdLookup,
  householdRequestAccess,
  onboardResident,
  onboardStructureForCode,
  tenantRegister,
  upsertMyProfile,
} from "@parisar/api-client";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { setMyPin } from "@/app/actions/codeLogin";
import { PageShell, Stepper } from "@/components/kit";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { errorMessage } from "./lib/errors";
import { findFlat, findWing, lookupKeys } from "./lib/structure";
import { PinSetup, pinErrorMessage } from "./PinSetup";
import { CodeStep, normaliseCode } from "./wizard/CodeStep";
import { DetailsStep } from "./wizard/DetailsStep";
import { FamilyStep } from "./wizard/FamilyStep";
import { HouseholdStep } from "./wizard/HouseholdStep";
import { TenantStep } from "./wizard/TenantStep";

const EXTRA_STEP = { join: "family", pending: "family", tenant: "tenant", household: "household" };
const EMPTY_TENANT = {
  agreementStart: "",
  agreementEnd: "",
  ownerName: "",
  ownerPhone: "",
  policeStatus: "not_submitted",
  policeReference: "",
};

export function OnboardingWizard({
  phone,
  initialName = "",
  initialCode = "",
  pinAlreadySet = false,
  authorityMode = false,
}) {
  const { t } = useTranslation("resident-onboarding");
  const router = useRouter();
  const phoneDisplay = phone ? `+91 ${phone.replace(/\D/g, "").slice(-10)}` : "";

  const [step, setStep] = useState("code");
  const [path, setPath] = useState("join");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [code, setCode] = useState(normaliseCode(initialCode));
  const [structure, setStructure] = useState(null);
  const [form, setForm] = useState({
    name: initialName,
    wingId: "",
    floorId: "",
    flatId: "",
    residentType: "owner",
    alt: "",
  });
  const [family, setFamily] = useState([]);
  const [tenant, setTenant] = useState(EMPTY_TENANT);
  const [lookup, setLookup] = useState(null);
  const [household, setHousehold] = useState({ answer: null, relationship: "", message: "" });
  const committed = useRef(null);

  async function lookupCode(raw) {
    setError(null);
    setBusy(true);
    try {
      const res = await onboardStructureForCode(createSupabaseBrowserClient(), normaliseCode(raw));
      if (res?.error) {
        setError(errorMessage(t, res));
        return;
      }
      setStructure({ ...res, code: normaliseCode(raw) });
      setStep("details");
    } catch {
      setError(t("errors.generic"));
    } finally {
      setBusy(false);
    }
  }

  // biome-ignore lint/correctness/useExhaustiveDependencies: run once for a pre-filled code
  useEffect(() => {
    if (initialCode) lookupCode(initialCode);
  }, []);

  async function afterDetails() {
    setError(null);
    const wing = findWing(structure, form.wingId);
    const flat = findFlat(wing, form.flatId);
    if (authorityMode || (!flat.taken && form.residentType === "owner")) {
      setPath("join");
      setStep("extra");
      return;
    }
    if (form.residentType === "tenant") {
      setPath("tenant");
      setStep("extra");
      return;
    }
    setBusy(true);
    try {
      const res = await householdLookup(createSupabaseBrowserClient(), {
        code: structure.code,
        ...lookupKeys(wing, flat),
      });
      if (res?.error) {
        setError(errorMessage(t, res));
        return;
      }
      setLookup(res);
      setHousehold({ answer: null, relationship: "", message: "" });
      setPath("household");
      setStep("extra");
    } catch {
      setError(t("errors.generic"));
    } finally {
      setBusy(false);
    }
  }

  async function runPath(supabase, p) {
    const base = { code: structure.code, flatId: form.flatId, fullName: form.name.trim() };
    if (p === "join" || p === "pending") {
      return onboardResident(supabase, {
        ...base,
        residency: form.residentType === "tenant" ? "tenant" : "owner",
        altPhone: form.alt,
        family: p === "join" ? familyPayload(family) : [],
      });
    }
    const profile = await upsertMyProfile(supabase, base.fullName);
    if (profile?.error) return profile;
    if (p === "tenant") {
      return tenantRegister(supabase, {
        ...base,
        agreementStart: tenant.agreementStart || null,
        agreementEnd: tenant.agreementEnd || null,
        ownerName: tenant.ownerName.trim() || null,
        ownerPhone: tenant.ownerPhone || null,
        policeStatus: tenant.policeStatus,
        policeReference: tenant.policeReference.trim() || null,
      });
    }
    return householdRequestAccess(supabase, {
      ...base,
      relationship: household.relationship,
      residentType: form.residentType === "owner" ? "owner" : "family_member",
      message: household.message.trim() || null,
    });
  }

  /** Join (once), then the PIN, then on. Resolves to an error message or null. */
  async function commit(pin, p = path) {
    const supabase = createSupabaseBrowserClient();
    if (!committed.current) {
      const res = await runPath(supabase, p);
      if (res?.error) return errorMessage(t, res);
      committed.current = { path: p, res };
    }
    if (pin) {
      const pinRes = await setMyPin(pin);
      if (pinRes?.error) return pinErrorMessage(t, pinRes.error);
    }
    const done = committed.current.path;
    if (done === "join" || done === "pending") {
      // The membership was created after this JWT was minted; re-mint it so the
      // Auth Hook injects society_id/role before the dashboard's RLS reads.
      await supabase.auth.refreshSession();
      router.push("/dashboard");
    } else {
      router.push("/onboarding/status");
    }
    return null;
  }

  /** The last content step: on to the PIN, or commit now when a PIN exists. */
  async function finishOrPin(nextPath) {
    const p = nextPath ?? path;
    setPath(p);
    if (!pinAlreadySet) {
      setStep("pin");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const message = await commit(null, p);
      if (message) setError(message);
    } catch {
      setError(t("errors.generic"));
    } finally {
      setBusy(false);
    }
  }

  const extraKey = EXTRA_STEP[path];
  const steps = [
    { id: "code", label: t("steps.code") },
    { id: "details", label: t("steps.details") },
    { id: "extra", label: t(`steps.${extraKey}`) },
    ...(pinAlreadySet ? [] : [{ id: "pin", label: t("steps.pin") }]),
  ];
  const current = Math.max(
    0,
    steps.findIndex((s) => s.id === step),
  );
  const finalStep = pinAlreadySet;

  return (
    <div className="min-h-screen bg-background">
      <PageShell width="narrow">
        <div className="mb-6 flex items-center gap-3">
          <Image src="/parisar-mark-96.png" alt="" aria-hidden="true" width={40} height={40} />
          <span className="type-body-sm font-medium text-muted-foreground">
            {t("wizard.brand")}
          </span>
        </div>
        <h1 className="type-h1 text-foreground">
          {t(`wizard.title.${step === "extra" ? extraKey : step}`)}
        </h1>
        <p className="type-body mt-1 mb-6 text-muted-foreground">
          {step === "code"
            ? t("wizard.sub.code")
            : t("wizard.sub.other", { society: structure?.society_name ?? "" })}
        </p>
        <Stepper steps={steps} current={current} className="mb-8" />

        {step === "code" ? (
          <CodeStep code={code} onCode={setCode} onSubmit={lookupCode} busy={busy} error={error} />
        ) : null}

        {step === "details" ? (
          <>
            <DetailsStep
              structure={structure}
              form={form}
              onChange={(patch) => setForm((f) => ({ ...f, ...patch }))}
              phoneDisplay={phoneDisplay}
              authorityMode={authorityMode}
              onBack={authorityMode ? undefined : () => setStep("code")}
              onNext={afterDetails}
            />
            {error ? (
              <p role="alert" className="type-body-sm mt-4 text-destructive">
                {error}
              </p>
            ) : null}
          </>
        ) : null}

        {step === "extra" && (path === "join" || path === "pending") ? (
          <FamilyStep
            family={family}
            onChange={setFamily}
            onBack={() => setStep("details")}
            onNext={() => finishOrPin()}
            busy={busy}
            error={error}
            finalStep={finalStep}
          />
        ) : null}

        {step === "extra" && path === "tenant" ? (
          <TenantStep
            value={tenant}
            onChange={(patch) => setTenant((v) => ({ ...v, ...patch }))}
            onBack={() => setStep("details")}
            onNext={() => finishOrPin()}
            busy={busy}
            error={error}
            finalStep={finalStep}
          />
        ) : null}

        {step === "extra" && path === "household" && lookup ? (
          <HouseholdStep
            lookup={lookup}
            residentType={form.residentType}
            value={household}
            onChange={(patch) => setHousehold((v) => ({ ...v, ...patch }))}
            onBack={() => setStep("details")}
            onRequest={() => finishOrPin()}
            onAskSociety={() => finishOrPin("pending")}
            busy={busy}
            error={error}
            finalStep={finalStep}
          />
        ) : null}

        {step === "pin" ? (
          <PinSetup
            onSubmit={(pin) => commit(pin)}
            submitLabel={t("common.finish")}
            onBack={committed.current ? undefined : () => setStep("extra")}
          />
        ) : null}
      </PageShell>
    </div>
  );
}

function familyPayload(family) {
  return family
    .filter((m) => m.name.trim())
    .map((m) => ({
      name: m.name.trim(),
      relation: m.relation.trim(),
      phone: m.phone || null,
      is_resident: true,
    }));
}
