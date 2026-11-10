"use client";

// One tenant registration, as the tenant sees it: the approval chain, the details
// (editable while it is open or active), required documents, and moving in once
// the society has approved and the agreement has started.

import { tenantActivate, tenantSaveMyDetails } from "@parisar/api-client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { FormActions, formatDateValue, Notice, SurfaceCard } from "@/components/kit";
import { Button } from "@/components/ui/button";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { errorMessage } from "./lib/errors";
import { firstError, todayIst } from "./lib/validation";
import { ProofList } from "./ProofList";
import { StateBadge } from "./StateBadge";
import { TenantChain } from "./TenantChain";
import { TenantFields, validateTenant } from "./wizard/TenantStep";

export const TENANT_DOCS = ["rent_agreement", "id_proof", "police_verification", "photo", "other"];
export const TENANT_REQUIRED_DOCS = ["rent_agreement", "id_proof"];

function toForm(r) {
  return {
    agreementStart: r.agreement_start ?? "",
    agreementEnd: r.agreement_end ?? "",
    ownerName: r.owner_name ?? "",
    ownerPhone: r.owner_phone ?? "",
    policeStatus: r.police_status === "submitted" ? "submitted" : "not_submitted",
    policeReference: r.police_reference ?? "",
  };
}

export function TenantRegistrationCard({ registration, userId, onChanged }) {
  const { t, i18n } = useTranslation("resident-onboarding");
  const day = (iso) => (iso ? formatDateValue(String(iso).slice(0, 10), i18n.language) : iso);
  const router = useRouter();
  const r = registration;
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState(() => toForm(r));
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(null);

  const editable = r.status !== "rejected";
  const canMoveIn =
    r.status === "admin_approved" && r.agreement_start && r.agreement_start <= todayIst();
  const policeLocked = r.police_status === "verified" || r.police_status === "rejected";

  async function save(e) {
    e.preventDefault();
    const next = validateTenant(form);
    setErrors(next);
    const first = firstError(next, ["start", "end", "ownerName", "ownerPhone", "policeReference"]);
    if (first) {
      document.getElementById(`tenant-${first}`)?.focus();
      return;
    }
    setBusy(true);
    setMessage(null);
    try {
      const res = await tenantSaveMyDetails(createSupabaseBrowserClient(), {
        societyId: r.society_id,
        fullName: r.full_name,
        agreementStart: form.agreementStart || null,
        agreementEnd: form.agreementEnd || null,
        ownerName: form.ownerName.trim() || null,
        ownerPhone: form.ownerPhone || null,
        policeStatus: policeLocked ? r.police_status : form.policeStatus,
        policeReference: form.policeReference.trim() || null,
      });
      if (res?.error) {
        setMessage({ tone: "danger", text: errorMessage(t, res) });
        return;
      }
      setEditing(false);
      setMessage({ tone: "success", text: t("tenantCard.saved") });
      await onChanged?.();
    } catch {
      setMessage({ tone: "danger", text: t("errors.generic") });
    } finally {
      setBusy(false);
    }
  }

  async function moveIn() {
    setBusy(true);
    setMessage(null);
    try {
      const supabase = createSupabaseBrowserClient();
      const res = await tenantActivate(supabase, r.id);
      if (res?.error) {
        setMessage({ tone: "danger", text: errorMessage(t, res) });
        return;
      }
      if (res.refresh_required) await supabase.auth.refreshSession();
      router.push("/dashboard");
    } catch {
      setMessage({ tone: "danger", text: t("errors.generic") });
    } finally {
      setBusy(false);
    }
  }

  return (
    <SurfaceCard className="flex flex-col gap-6 p-5 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="type-h3 text-foreground">
            {t("tenantCard.title", { flat: r.flat_label, society: r.society_name ?? "" })}
          </h2>
          <p className="type-body-sm mt-1 text-muted-foreground">{t("tenantCard.sub")}</p>
        </div>
        <StateBadge kind="tenant" status={r.status} />
      </div>

      <TenantChain tenant={r} />

      {r.status === "rejected" ? (
        <Notice tone="danger" title={t("tenantCard.rejectedTitle")}>
          {r.rejected_reason || t("tenantCard.rejectedNoReason")}
        </Notice>
      ) : null}
      {r.status === "admin_approved" && !canMoveIn ? (
        <Notice tone="info">{t("tenantCard.waitStart")}</Notice>
      ) : null}
      {message ? <Notice tone={message.tone}>{message.text}</Notice> : null}

      {canMoveIn ? (
        <Button type="button" size="touch" className="self-start" disabled={busy} onClick={moveIn}>
          {t("tenantCard.moveIn")}
        </Button>
      ) : null}

      <section className="flex flex-col gap-4">
        <h3 className="type-h3 text-foreground">{t("tenantCard.details")}</h3>
        {editing ? (
          <form onSubmit={save} className="flex flex-col gap-5" noValidate>
            <TenantFields
              value={form}
              onChange={(p) => setForm((f) => ({ ...f, ...p }))}
              errors={errors}
              t={t}
            />
            {policeLocked ? (
              <p className="type-body-sm text-muted-foreground">{t("tenantCard.policeLocked")}</p>
            ) : null}
            <FormActions
              submitLabel={t("common.save")}
              submitting={busy}
              onCancel={() => {
                setEditing(false);
                setForm(toForm(r));
                setErrors({});
              }}
              cancelLabel={t("common.cancel")}
            />
          </form>
        ) : (
          <>
            <dl className="grid gap-3 sm:grid-cols-2">
              <Detail label={t("tenant.start")} value={day(r.agreement_start)} />
              <Detail label={t("tenant.end")} value={day(r.agreement_end)} />
              <Detail label={t("tenant.ownerName")} value={r.owner_name} />
              <Detail label={t("tenant.police")} value={t(`status.police.${r.police_status}`)} />
            </dl>
            {editable ? (
              <Button
                type="button"
                variant="outline"
                size="touch"
                className="self-start"
                onClick={() => setEditing(true)}
              >
                {t("tenantCard.edit")}
              </Button>
            ) : null}
          </>
        )}
      </section>

      <section className="flex flex-col gap-4">
        <div>
          <h3 className="type-h3 text-foreground">{t("tenantCard.docs")}</h3>
          <p className="type-body-sm mt-1 text-muted-foreground">{t("tenantCard.docsHint")}</p>
        </div>
        <ProofList
          subjectKind="tenant"
          subjectId={r.id}
          societyId={r.society_id}
          userId={userId}
          docTypes={TENANT_DOCS}
          required={TENANT_REQUIRED_DOCS}
          canUpload={editable}
        />
      </section>
    </SurfaceCard>
  );
}

function Detail({ label, value }) {
  const { t } = useTranslation("resident-onboarding");
  return (
    <div>
      <dt className="type-caption text-muted-foreground">{label}</dt>
      <dd className="type-body text-foreground">{value || t("common.notGiven")}</dd>
    </div>
  );
}
