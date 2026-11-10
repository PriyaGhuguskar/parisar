"use client";

// An owner or tenant adds a family member: an invite record plus a one-time link.
// Nothing is sent to anyone. The link is shown once (only its hash is stored),
// so the screen says plainly to copy and share it themselves.

import { familyInviteCreate, familyInviteList, familyInviteRevoke } from "@parisar/api-client";
import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  ConfirmDialog,
  CopyButton,
  ErrorState,
  FormActions,
  FormField,
  LoadingState,
  Notice,
  PhoneInput,
  SurfaceCard,
  TextInput,
} from "@/components/kit";
import { errorMessage } from "@/components/onboarding/lib/errors";
import { checkMobile, checkName, firstError } from "@/components/onboarding/lib/validation";
import { StateBadge } from "@/components/onboarding/StateBadge";
import { RELATIONSHIPS } from "@/components/onboarding/wizard/HouseholdStep";
import { Button } from "@/components/ui/button";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

export function inviteUrl(origin, token) {
  return `${origin}/invite/${encodeURIComponent(token)}`;
}

const EMPTY = { fullName: "", relationship: "", phone: "" };

export function FamilyInvites({ societyId }) {
  const { t } = useTranslation("resident-onboarding");
  const [invites, setInvites] = useState(null);
  const [failed, setFailed] = useState(false);
  const [form, setForm] = useState(EMPTY);
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);
  const [serverError, setServerError] = useState(null);
  const [created, setCreated] = useState(null);
  const [revoking, setRevoking] = useState(null);
  const [revokeError, setRevokeError] = useState(null);
  const set = (p) => setForm((f) => ({ ...f, ...p }));

  const load = useCallback(async () => {
    setFailed(false);
    try {
      const res = await familyInviteList(createSupabaseBrowserClient(), societyId);
      if (res?.error) throw new Error(res.error);
      setInvites(Array.isArray(res) ? res : []);
    } catch {
      setFailed(true);
    }
  }, [societyId]);

  useEffect(() => {
    load();
  }, [load]);

  async function submit(e) {
    e.preventDefault();
    const next = {
      fullName: checkName(form.fullName),
      relationship: form.relationship ? null : "validation.relationshipRequired",
      phone: checkMobile(form.phone),
    };
    setErrors(next);
    const first = firstError(next, ["fullName", "relationship", "phone"]);
    if (first) {
      document.getElementById(`invite-${first}`)?.focus();
      return;
    }
    setBusy(true);
    setServerError(null);
    try {
      const res = await familyInviteCreate(createSupabaseBrowserClient(), {
        societyId,
        fullName: form.fullName.trim(),
        relationship: form.relationship,
        phone: form.phone || null,
      });
      if (res?.error) {
        setServerError(errorMessage(t, res));
        return;
      }
      setCreated({
        ...res,
        full_name: form.fullName.trim(),
        url: inviteUrl(window.location.origin, res.token),
      });
      setForm(EMPTY);
      await load();
    } catch {
      setServerError(t("errors.generic"));
    } finally {
      setBusy(false);
    }
  }

  async function confirmRevoke() {
    const res = await familyInviteRevoke(createSupabaseBrowserClient(), revoking.id);
    if (res?.error) {
      setRevokeError(errorMessage(t, res));
      throw new Error(res.error);
    }
    setRevoking(null);
    await load();
  }

  const err = (k) => (errors[k] ? t(errors[k]) : undefined);

  return (
    <div className="flex flex-col gap-6">
      {created ? (
        <SurfaceCard className="flex flex-col gap-4 p-5 sm:p-6">
          <h2 className="type-h3 text-foreground">
            {t("family.createdTitle", { name: created.full_name })}
          </h2>
          <Notice tone="warning" title={t("invite.notSentTitle")}>
            {t("family.notSentBody")}
          </Notice>
          <p className="type-body rounded-lg bg-muted p-3 font-mono text-foreground break-all">
            {created.url}
          </p>
          <p className="type-body-sm text-muted-foreground">{t("family.linkOnce")}</p>
          <div className="flex flex-col gap-2 sm:flex-row">
            <CopyButton value={created.url} label={t("family.copyLink")} />
            <CopyButton
              value={t("family.message", { name: created.full_name, url: created.url })}
              label={t("invite.copyMessage")}
              variant="ghost"
            />
            <Button type="button" variant="ghost" size="touch" onClick={() => setCreated(null)}>
              {t("common.close")}
            </Button>
          </div>
        </SurfaceCard>
      ) : null}

      <form onSubmit={submit} className="flex flex-col gap-5" noValidate>
        <SurfaceCard className="flex flex-col gap-5 p-5 sm:p-6">
          <div>
            <h2 className="type-h3 text-foreground">{t("family.inviteTitle")}</h2>
            <p className="type-body-sm mt-1 text-muted-foreground">{t("family.inviteHint")}</p>
          </div>
          <FormField label={t("family.name")} required error={err("fullName")}>
            <TextInput
              id="invite-fullName"
              value={form.fullName}
              onChange={(e) => set({ fullName: e.target.value })}
            />
          </FormField>
          <FormField label={t("family.relationship")} required group error={err("relationship")}>
            <div
              id="invite-relationship"
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
                    name="invite-relationship"
                    value={r}
                    checked={form.relationship === r}
                    onChange={() => set({ relationship: r })}
                    className="size-4 accent-[var(--primary)]"
                  />
                  <span className="type-body text-foreground">{t(`relationship.${r}`)}</span>
                </label>
              ))}
            </div>
          </FormField>
          <FormField
            label={t("family.phone")}
            optional
            hint={t("family.invitePhoneHint")}
            error={err("phone")}
          >
            <PhoneInput
              id="invite-phone"
              value={form.phone}
              onChange={(digits) => set({ phone: digits })}
            />
          </FormField>
        </SurfaceCard>
        {serverError ? <Notice tone="danger">{serverError}</Notice> : null}
        <FormActions submitLabel={t("family.createInvite")} submitting={busy} />
      </form>

      <SurfaceCard className="flex flex-col gap-4 p-5 sm:p-6">
        <h2 className="type-h3 text-foreground">{t("family.listTitle")}</h2>
        {failed ? <ErrorState description={t("family.loadError")} onRetry={load} /> : null}
        {!failed && !invites ? <LoadingState variant="list" rows={2} /> : null}
        {invites && invites.length === 0 ? (
          <p className="type-body-sm text-muted-foreground">{t("family.listEmpty")}</p>
        ) : null}
        {invites?.length ? (
          <ul className="flex flex-col divide-y divide-border">
            {invites.map((i) => (
              <li key={i.id} className="flex flex-wrap items-center justify-between gap-2 py-3">
                <div className="min-w-0">
                  <p className="type-body text-foreground">{i.full_name}</p>
                  <p className="type-body-sm text-muted-foreground">
                    {t(`relationship.${i.relationship}`)}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <StateBadge kind="invite" status={i.status} />
                  {i.status === "pending" ? (
                    <Button
                      type="button"
                      variant="ghost"
                      size="touch"
                      onClick={() => {
                        setRevokeError(null);
                        setRevoking(i);
                      }}
                    >
                      {t("family.revoke")}
                    </Button>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        ) : null}
      </SurfaceCard>

      <ConfirmDialog
        open={Boolean(revoking)}
        onOpenChange={(o) => !o && setRevoking(null)}
        title={t("family.revokeTitle")}
        description={t("family.revokeBody", { name: revoking?.full_name ?? "" })}
        confirmLabel={t("family.revokeConfirm")}
        errorMessage={revokeError ?? undefined}
        onConfirm={confirmRevoke}
      />
    </div>
  );
}
