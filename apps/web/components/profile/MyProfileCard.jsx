"use client";

// MyProfileCard — the "Your details" surface. Name and emergency contact are
// editable inline; phone, flat and role are read-only here (phone changes need
// the OTP re-verify flow, role changes go through role-transfer).
//
// Name lives on profiles (keyed by user_id); emergency contact lives on the
// society_membership. Both are writable by the owner under RLS (self_update_profile
// and the tenant membership policy). After a successful save we router.refresh()
// so the server-rendered values re-read from the source of truth.

import { Check, Pencil, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { SurfaceCard } from "@/components/kit";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { getAvatarColor, initials } from "@/lib/avatar";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

const ROLE_KEY = {
  secretary: "profile.roleSecretary",
  co_secretary: "profile.roleCoSecretary",
  board_member: "profile.roleBoard",
  member: "profile.roleMember",
};

const FIELD =
  "h-11 w-full rounded-xl border border-[var(--color-neutral-200)] bg-[var(--color-neutral-0)] px-3.5 text-[15px] text-[var(--color-neutral-900)] outline-none transition-[border-color,box-shadow] duration-150 focus:border-[var(--color-brand-500)] focus:shadow-[0_0_0_4px_color-mix(in_srgb,var(--color-brand-500)_16%,transparent)]";

function Row({ label, children }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-2.5">
      <span className="shrink-0 text-[13px] font-semibold text-[var(--color-neutral-500)]">
        {label}
      </span>
      <span className="min-w-0 text-right text-[15px] font-medium text-[var(--color-neutral-900)]">
        {children}
      </span>
    </div>
  );
}

export function MyProfileCard({ userId, role, me }) {
  const { t } = useTranslation("auth");
  const router = useRouter();

  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(me.fullName ?? "");
  const [emergency, setEmergency] = useState(me.emergency ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  const displayName = me.fullName?.trim() || t("profile.roleMember");
  const colors = getAvatarColor(displayName);

  function startEdit() {
    setName(me.fullName ?? "");
    setEmergency(me.emergency ?? "");
    setError(null);
    setEditing(true);
  }

  async function onSave(e) {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) {
      setError(t("profile.nameRequired"));
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const supabase = createSupabaseBrowserClient();

      const { error: pErr } = await supabase
        .from("profiles")
        .update({ full_name: trimmed })
        .eq("user_id", userId);
      if (pErr) throw pErr;

      if (me.membershipId) {
        const { error: mErr } = await supabase
          .from("society_memberships")
          .update({ emergency_contact: emergency.trim() || null })
          .eq("id", me.membershipId);
        if (mErr) throw mErr;
      }

      setEditing(false);
      router.refresh();
    } catch {
      setError(t("profile.saveError"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <SurfaceCard className="p-5 sm:p-6">
      <div className="flex items-start justify-between gap-4">
        <div className="flex min-w-0 items-center gap-3.5">
          <Avatar className="h-14 w-14 text-[17px]">
            <AvatarFallback style={{ backgroundColor: colors.bg, color: colors.text }}>
              {initials(displayName)}
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0">
            <p className="truncate text-[19px] font-extrabold tracking-[-0.01em] text-[var(--color-neutral-900)]">
              {displayName}
            </p>
            <div className="mt-1 flex flex-wrap items-center gap-1.5">
              <span className="inline-flex items-center rounded-full bg-[var(--color-brand-50)] px-2.5 py-0.5 text-[12px] font-bold text-[var(--color-brand-600)]">
                {t(ROLE_KEY[role] ?? ROLE_KEY.member)}
              </span>
              {me.flatLabel ? (
                <span className="inline-flex items-center rounded-full bg-[var(--color-neutral-100)] px-2.5 py-0.5 text-[12px] font-semibold text-[var(--color-neutral-600)]">
                  {me.flatLabel}
                </span>
              ) : null}
            </div>
          </div>
        </div>

        {!editing ? (
          <button
            type="button"
            onClick={startEdit}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[13px] font-semibold text-[var(--color-brand-600)] hover:bg-[var(--color-brand-50)]"
          >
            <Pencil size={14} strokeWidth={2.2} aria-hidden="true" />
            {t("profile.edit")}
          </button>
        ) : null}
      </div>

      {!editing ? (
        <div className="mt-4 divide-y divide-[var(--color-neutral-100)] border-t border-[var(--color-neutral-100)] pt-1">
          <Row label={t("profile.phone")}>{me.phone ?? "—"}</Row>
          {me.flatLabel ? <Row label={t("profile.flat")}>{me.flatLabel}</Row> : null}
          <Row label={t("profile.emergency")}>
            {me.emergency ? (
              me.emergency
            ) : (
              <span className="text-[var(--color-neutral-400)]">{t("profile.emergencyNone")}</span>
            )}
          </Row>
        </div>
      ) : (
        <form
          onSubmit={onSave}
          className="mt-5 flex flex-col gap-4 border-t border-[var(--color-neutral-100)] pt-5"
        >
          <label className="flex flex-col gap-1.5">
            <span className="text-[13px] font-bold text-[var(--color-neutral-900)]">
              {t("profile.fullName")}
            </span>
            <input
              // biome-ignore lint/a11y/noAutofocus: first field of an explicitly-opened edit form
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={80}
              className={FIELD}
            />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-[13px] font-bold text-[var(--color-neutral-900)]">
              {t("profile.emergency")}
            </span>
            <input
              value={emergency}
              onChange={(e) => setEmergency(e.target.value)}
              inputMode="tel"
              maxLength={40}
              className={FIELD}
            />
          </label>
          {error ? (
            <p className="text-[13px] font-semibold text-[var(--color-danger)]">{error}</p>
          ) : null}
          <div className="flex items-center gap-2.5">
            <button
              type="submit"
              disabled={saving}
              className="inline-flex items-center gap-1.5 rounded-xl bg-[var(--color-brand-600)] px-4 py-2.5 text-[14px] font-bold text-white transition-opacity hover:opacity-90 disabled:opacity-60"
            >
              <Check size={15} strokeWidth={2.4} aria-hidden="true" />
              {saving ? t("profile.saving") : t("profile.save")}
            </button>
            <button
              type="button"
              onClick={() => setEditing(false)}
              disabled={saving}
              className="inline-flex items-center gap-1.5 rounded-xl px-3.5 py-2.5 text-[14px] font-semibold text-[var(--color-neutral-600)] hover:bg-[var(--color-neutral-100)] disabled:opacity-60"
            >
              <X size={15} strokeWidth={2.4} aria-hidden="true" />
              {t("profile.cancel")}
            </button>
          </div>
        </form>
      )}
    </SurfaceCard>
  );
}
