"use client";

// Owners of this flat (several are allowed, at most one primary) and, for an owner,
// their own details and ownership proofs. Self-declared until a manager verifies.
// No phone numbers are shown here.

import { listFlatOwners, ownerSaveMyDetails } from "@parisar/api-client";
import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  DatePicker,
  ErrorState,
  FormActions,
  FormField,
  LoadingState,
  Notice,
  StatusPill,
  SurfaceCard,
  TextInput,
} from "@/components/kit";
import { errorMessage } from "@/components/onboarding/lib/errors";
import {
  checkName,
  checkOptionalText,
  firstError,
  todayIst,
} from "@/components/onboarding/lib/validation";
import { ProofList } from "@/components/onboarding/ProofList";
import { StateBadge } from "@/components/onboarding/StateBadge";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

export const OWNER_DOCS = [
  "ownership_proof",
  "sale_deed",
  "share_certificate",
  "id_proof",
  "address_proof",
  "other",
];

export function OwnerSection({ societyId, flatId, userId, isOwner }) {
  const { t } = useTranslation("resident-onboarding");
  const [owners, setOwners] = useState(null);
  const [failed, setFailed] = useState(false);

  const load = useCallback(async () => {
    setFailed(false);
    try {
      const res = await listFlatOwners(createSupabaseBrowserClient(), flatId);
      if (res?.error) throw new Error(res.error);
      setOwners(Array.isArray(res) ? res : []);
    } catch {
      setFailed(true);
    }
  }, [flatId]);

  useEffect(() => {
    load();
  }, [load]);

  if (failed) return <ErrorState description={t("owners.loadError")} onRetry={load} />;
  if (!owners) return <LoadingState variant="list" rows={2} />;
  const mine = owners.find((o) => o.user_id === userId) ?? null;

  return (
    <div className="flex flex-col gap-6">
      <SurfaceCard className="flex flex-col gap-4 p-5 sm:p-6">
        <h2 className="type-h3 text-foreground">{t("owners.title")}</h2>
        {owners.length ? (
          <ul className="flex flex-col divide-y divide-border">
            {owners.map((o) => (
              <li key={o.id} className="flex flex-wrap items-center justify-between gap-2 py-3">
                <span className="type-body text-foreground">
                  {o.full_name}
                  {o.user_id === userId ? ` (${t("owners.you")})` : ""}
                </span>
                <span className="flex flex-wrap gap-2">
                  {o.is_primary ? <StatusPill tone="info">{t("owners.primary")}</StatusPill> : null}
                  <StateBadge kind="owner" status={o.verified ? "verified" : "unverified"} />
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="type-body-sm text-muted-foreground">{t("owners.none")}</p>
        )}
        <p className="type-body-sm text-muted-foreground">{t("owners.coOwnerHint")}</p>
      </SurfaceCard>
      {isOwner ? <MyOwnerDetails flatId={flatId} mine={mine} onSaved={load} /> : null}
      {isOwner && mine ? (
        <SurfaceCard className="flex flex-col gap-4 p-5 sm:p-6">
          <div>
            <h2 className="type-h3 text-foreground">{t("owners.proofsTitle")}</h2>
            <p className="type-body-sm mt-1 text-muted-foreground">{t("owners.proofsHint")}</p>
          </div>
          <ProofList
            subjectKind="owner"
            subjectId={mine.id}
            societyId={societyId}
            userId={userId}
            docTypes={OWNER_DOCS}
            required={["ownership_proof"]}
          />
        </SurfaceCard>
      ) : null}
    </div>
  );
}

function MyOwnerDetails({ flatId, mine, onSaved }) {
  const { t } = useTranslation("resident-onboarding");
  const [form, setForm] = useState({
    fullName: mine?.full_name ?? "",
    isPrimary: Boolean(mine?.is_primary),
    startDate: mine?.ownership_start_date ?? "",
    membershipNumber: mine?.membership_number ?? "",
  });
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(null);
  const set = (p) => setForm((f) => ({ ...f, ...p }));

  async function submit(e) {
    e.preventDefault();
    const next = {
      fullName: checkName(form.fullName),
      startDate: form.startDate && form.startDate > todayIst() ? "validation.futureDate" : null,
      membershipNumber: checkOptionalText(form.membershipNumber, 40),
    };
    setErrors(next);
    const first = firstError(next, ["fullName", "startDate", "membershipNumber"]);
    if (first) {
      document.getElementById(`owner-${first}`)?.focus();
      return;
    }
    setBusy(true);
    setMessage(null);
    try {
      const res = await ownerSaveMyDetails(createSupabaseBrowserClient(), {
        flatId,
        fullName: form.fullName.trim(),
        isPrimary: form.isPrimary,
        startDate: form.startDate || null,
        membershipNumber: form.membershipNumber.trim() || null,
      });
      if (res?.error) {
        setMessage({ tone: "danger", text: errorMessage(t, res) });
        return;
      }
      setMessage({ tone: "success", text: t("owners.saved") });
      await onSaved();
    } catch {
      setMessage({ tone: "danger", text: t("errors.generic") });
    } finally {
      setBusy(false);
    }
  }

  const err = (k) => (errors[k] ? t(errors[k]) : undefined);
  return (
    <form onSubmit={submit} className="flex flex-col gap-5" noValidate>
      <SurfaceCard className="flex flex-col gap-5 p-5 sm:p-6">
        <div>
          <h2 className="type-h3 text-foreground">{t("owners.myTitle")}</h2>
          <p className="type-body-sm mt-1 text-muted-foreground">{t("owners.myHint")}</p>
        </div>
        <FormField label={t("owners.name")} required error={err("fullName")}>
          <TextInput
            id="owner-fullName"
            value={form.fullName}
            onChange={(e) => set({ fullName: e.target.value })}
          />
        </FormField>
        <div className="grid gap-5 sm:grid-cols-2">
          <FormField label={t("owners.startDate")} optional error={err("startDate")}>
            <DatePicker
              id="owner-startDate"
              value={form.startDate}
              max={todayIst()}
              captionLayout="dropdown"
              clearable
              onChange={(v) => set({ startDate: v })}
            />
          </FormField>
          <FormField
            label={t("owners.membershipNumber")}
            optional
            hint={t("owners.membershipHint")}
            error={err("membershipNumber")}
          >
            <TextInput
              id="owner-membershipNumber"
              maxLength={40}
              value={form.membershipNumber}
              onChange={(e) => set({ membershipNumber: e.target.value })}
            />
          </FormField>
        </div>
        <label className="flex min-h-11 cursor-pointer items-center gap-3">
          <input
            type="checkbox"
            checked={form.isPrimary}
            onChange={(e) => set({ isPrimary: e.target.checked })}
            className="size-5 accent-[var(--primary)]"
          />
          <span className="type-body text-foreground">{t("owners.isPrimary")}</span>
        </label>
      </SurfaceCard>
      {message ? <Notice tone={message.tone}>{message.text}</Notice> : null}
      <FormActions submitLabel={mine ? t("common.save") : t("owners.add")} submitting={busy} />
    </form>
  );
}
