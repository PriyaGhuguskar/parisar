"use client";

// Accept a family invite: the person has already proved their phone by OTP.
// 1. preview (society, flat, who invited them, masked)  2. accept -> linked to
// the flat as a family member, one membership, no duplicate family row
// 3. complete profile (their own name)  4. PIN if they have none  5. the app.

import { familyInviteAccept, familyInvitePreview, upsertMyProfile } from "@parisar/api-client";
import { MailOpen } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { setMyPin } from "@/app/actions/codeLogin";
import {
  EmptyState,
  ErrorState,
  FormActions,
  FormField,
  formatDateValue,
  LoadingState,
  Notice,
  PageHeader,
  PageShell,
  Stepper,
  SurfaceCard,
  TextInput,
} from "@/components/kit";
import { errorMessage } from "@/components/onboarding/lib/errors";
import { checkName } from "@/components/onboarding/lib/validation";
import { PinSetup, pinErrorMessage } from "@/components/onboarding/PinSetup";
import { buttonVariants } from "@/components/ui/button";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

const DEAD_LINK = new Set([
  "INVITE_NOT_FOUND",
  "INVITE_REVOKED",
  "INVITE_USED",
  "INVITE_EXPIRED",
  "INVITE_PHONE_MISMATCH",
]);

export function InviteAccept({ token, pinSet }) {
  const { t, i18n } = useTranslation("resident-onboarding");
  const router = useRouter();
  const [stage, setStage] = useState("loading"); // loading | failed | dead | preview | profile | pin
  const [preview, setPreview] = useState(null);
  const [dead, setDead] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [name, setName] = useState("");
  const [nameError, setNameError] = useState(null);

  const load = useCallback(async () => {
    setStage("loading");
    try {
      const res = await familyInvitePreview(createSupabaseBrowserClient(), token);
      if (res?.error) {
        setDead(res.error);
        setStage(DEAD_LINK.has(res.error) ? "dead" : "failed");
        return;
      }
      setPreview(res);
      setName(res.full_name ?? "");
      setStage("preview");
    } catch {
      setStage("failed");
    }
  }, [token]);

  useEffect(() => {
    load();
  }, [load]);

  async function accept() {
    setBusy(true);
    setError(null);
    try {
      const supabase = createSupabaseBrowserClient();
      const res = await familyInviteAccept(supabase, token);
      if (res?.error) {
        setError(errorMessage(t, res));
        return;
      }
      if (res.refresh_required) await supabase.auth.refreshSession();
      setStage("profile");
    } catch {
      setError(t("errors.generic"));
    } finally {
      setBusy(false);
    }
  }

  async function saveProfile(e) {
    e.preventDefault();
    const problem = checkName(name);
    setNameError(problem);
    if (problem) {
      document.getElementById("accept-name")?.focus();
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await upsertMyProfile(createSupabaseBrowserClient(), name);
      if (res?.error) {
        setError(errorMessage(t, res));
        return;
      }
      if (pinSet) router.push("/dashboard");
      else setStage("pin");
    } catch {
      setError(t("errors.generic"));
    } finally {
      setBusy(false);
    }
  }

  async function savePin(pin) {
    const res = await setMyPin(pin);
    if (res?.error) return pinErrorMessage(t, res.error);
    router.push("/dashboard");
    return null;
  }

  const steps = [
    { id: "check", label: t("acceptPage.stepCheckShort") },
    { id: "profile", label: t("acceptPage.stepProfileShort") },
    ...(pinSet ? [] : [{ id: "pin", label: t("steps.pin") }]),
  ];
  const current = { preview: 0, profile: 1, pin: 2 }[stage] ?? 0;

  let body = null;
  if (stage === "loading") body = <LoadingState variant="page" />;
  if (stage === "failed") body = <ErrorState description={errorMessage(t, dead)} onRetry={load} />;
  if (stage === "dead") {
    body = (
      <EmptyState
        icon={MailOpen}
        title={t("acceptPage.deadTitle")}
        description={errorMessage(t, dead)}
        action={
          <Link
            href="/onboarding?manual=1"
            className={buttonVariants({ variant: "outline", size: "touch" })}
          >
            {t("statusPage.joinWithCode")}
          </Link>
        }
      />
    );
  }
  if (stage === "preview") {
    body = (
      <div className="flex flex-col gap-6">
        <SurfaceCard className="flex flex-col gap-4 p-5 sm:p-6">
          <h2 className="type-h3 text-foreground">
            {t("acceptPage.previewTitle", {
              flat: preview.flat_label,
              society: preview.society_name,
            })}
          </h2>
          <dl className="grid gap-3 sm:grid-cols-2">
            <Fact label={t("acceptPage.invitedBy")} value={preview.invited_by} />
            <Fact
              label={t("acceptPage.invitedAs")}
              value={`${preview.full_name} · ${t(`relationship.${preview.relationship}`)}`}
            />
            <Fact
              label={t("acceptPage.expires")}
              value={formatDateValue(String(preview.expires_at ?? "").slice(0, 10), i18n.language)}
            />
          </dl>
          <p className="type-body-sm text-muted-foreground">{t("acceptPage.notYou")}</p>
        </SurfaceCard>
        {error ? <Notice tone="danger">{error}</Notice> : null}
        <FormActions submitLabel={t("acceptPage.accept")} submitting={busy} onSubmit={accept} />
      </div>
    );
  }
  if (stage === "profile") {
    body = (
      <form onSubmit={saveProfile} className="flex flex-col gap-6" noValidate>
        <Notice tone="success" title={t("acceptPage.linkedTitle")}>
          {t("acceptPage.linkedBody", { flat: preview.flat_label, society: preview.society_name })}
        </Notice>
        <SurfaceCard className="flex flex-col gap-5 p-5 sm:p-6">
          <h2 className="type-h3 text-foreground">{t("acceptPage.profileTitle")}</h2>
          <FormField
            label={t("details.name")}
            required
            error={nameError ? t(nameError) : undefined}
          >
            <TextInput
              id="accept-name"
              autoComplete="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </FormField>
        </SurfaceCard>
        {error ? <Notice tone="danger">{error}</Notice> : null}
        <FormActions
          submitLabel={pinSet ? t("common.finish") : t("common.continue")}
          submitting={busy}
        />
      </form>
    );
  }
  if (stage === "pin") body = <PinSetup onSubmit={savePin} submitLabel={t("pin.saveAndOpen")} />;

  return (
    <PageShell width="narrow">
      <PageHeader title={t("acceptPage.title")} description={t("acceptPage.sub")} />
      {["preview", "profile", "pin"].includes(stage) ? (
        <Stepper steps={steps} current={current} className="mb-8" />
      ) : null}
      {body}
    </PageShell>
  );
}

function Fact({ label, value }) {
  return (
    <div>
      <dt className="type-caption text-muted-foreground">{label}</dt>
      <dd className="type-body text-foreground">{value}</dd>
    </div>
  );
}
