"use client";

// AuthoritiesSection — the society's authority list + "Add authority", shown on
// the Society Dashboard. Loads via RLS (society_authorities_read: the society's
// own authorities) and adds via add_society_authority. Adding a phone that
// already belongs to a resident gives them authority powers immediately;
// otherwise on their first sign-in. Same dialog pattern as GuardsSection.

import {
  addSocietyAuthority,
  isValidAuthorityPhone,
  listSocietyAuthorities,
} from "@parisar/api-client";
import { Plus, ShieldCheck, X } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { StatusPill, SurfaceCard } from "@/components/kit";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

const FIELD =
  "h-11 w-full rounded-xl border border-[var(--color-neutral-200)] bg-[var(--color-neutral-0)] px-3.5 text-[15px] outline-none focus:border-[var(--color-brand-500)] focus:shadow-[0_0_0_4px_color-mix(in_srgb,var(--color-brand-500)_16%,transparent)]";

const ERROR_KEY = {
  INVALID_NAME: "authority.errName",
  INVALID_PHONE: "authority.errPhone",
  ALREADY_AUTHORITY: "authority.errExists",
};

function AddAuthorityDialog({ societyId, onClose, onAdded }) {
  const { t } = useTranslation("auth");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  async function submit(e) {
    e.preventDefault();
    setError(null);
    if (name.trim().length < 2) return setError(t("authority.errName"));
    if (!isValidAuthorityPhone(phone)) return setError(t("authority.errPhone"));
    setSaving(true);
    try {
      const res = await addSocietyAuthority(createSupabaseBrowserClient(), {
        societyId,
        name,
        phone,
      });
      if (res?.error) {
        setError(t(ERROR_KEY[res.error] ?? "authority.errGeneric"));
        setSaving(false);
        return;
      }
      onAdded(res.linked);
      onClose();
    } catch {
      setError(t("authority.errGeneric"));
      setSaving(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-[rgba(18,38,28,0.45)] p-0 sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-label={t("authority.addAuthority")}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-md rounded-t-[22px] bg-[var(--color-neutral-0)] p-6 sm:rounded-[22px]">
        <div className="mb-5 flex items-start justify-between gap-4">
          <h2 className="text-[20px] font-extrabold tracking-[-0.02em] text-[var(--color-neutral-900)]">
            {t("authority.addAuthority")}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label={t("authority.cancel")}
            className="rounded-lg p-1.5 text-[var(--color-neutral-500)] hover:bg-[var(--color-neutral-100)]"
          >
            <X size={18} strokeWidth={2.2} aria-hidden="true" />
          </button>
        </div>
        <form onSubmit={submit} className="flex flex-col gap-4">
          <label className="flex flex-col gap-1.5">
            <span className="text-[13px] font-bold text-[var(--color-neutral-900)]">
              {t("authority.name")}
            </span>
            <input
              // biome-ignore lint/a11y/noAutofocus: first field of an explicitly-opened dialog
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t("authority.namePh")}
              maxLength={80}
              className={FIELD}
            />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-[13px] font-bold text-[var(--color-neutral-900)]">
              {t("authority.phone")}
            </span>
            <input
              value={phone}
              onChange={(e) => setPhone(e.target.value.replace(/\D/g, "").slice(0, 10))}
              inputMode="tel"
              placeholder="9876543210"
              className={FIELD}
            />
          </label>
          {error ? (
            <p className="text-[13px] font-semibold text-[var(--color-danger)]" role="alert">
              {error}
            </p>
          ) : null}
          <div className="flex items-center justify-end gap-2.5">
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className="rounded-xl px-4 py-2.5 text-[14px] font-semibold text-[var(--color-neutral-600)] hover:bg-[var(--color-neutral-100)] disabled:opacity-60"
            >
              {t("authority.cancel")}
            </button>
            <button
              type="submit"
              disabled={saving}
              className="rounded-xl bg-[var(--color-brand-600)] px-5 py-2.5 text-[14px] font-bold text-white transition-opacity hover:opacity-90 disabled:opacity-60"
            >
              {saving ? t("authority.adding") : t("authority.add")}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export function AuthoritiesSection({ societyId, userId }) {
  const { t } = useTranslation("auth");
  const [rows, setRows] = useState([]);
  const [loadFailed, setLoadFailed] = useState(false);
  const [adding, setAdding] = useState(false);
  const [notice, setNotice] = useState(null);

  const load = useCallback(async () => {
    try {
      setRows(await listSocietyAuthorities(createSupabaseBrowserClient(), societyId));
      setLoadFailed(false);
    } catch {
      setLoadFailed(true);
    }
  }, [societyId]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <section className="flex flex-col gap-3" data-testid="authorities-section">
      <div className="flex items-end justify-between gap-3">
        <div>
          <h2 className="text-[20px] font-extrabold tracking-[-0.02em] text-[var(--color-neutral-900)]">
            {t("authority.authoritiesTitle")}
          </h2>
          <p className="mt-0.5 text-[14px] text-[var(--color-neutral-600)]">
            {t("authority.authoritiesLead")}
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            setNotice(null);
            setAdding(true);
          }}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-xl bg-[var(--color-brand-600)] px-4 py-2.5 text-[14px] font-bold text-white transition-opacity hover:opacity-90"
        >
          <Plus size={16} strokeWidth={2.5} aria-hidden="true" />
          {t("authority.addAuthority")}
        </button>
      </div>

      {notice ? (
        <output className="block text-[13px] font-semibold text-[var(--color-brand-600)]">
          {notice}
        </output>
      ) : null}

      {loadFailed ? (
        <SurfaceCard className="px-5 py-6 text-center text-[14px] text-[var(--color-danger)]">
          {t("authority.loadError")}
        </SurfaceCard>
      ) : (
        <ul className="flex flex-col gap-2">
          {rows.map((a) => (
            <li key={a.id}>
              <SurfaceCard className="flex items-center gap-3 px-4 py-3">
                <span
                  className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl"
                  style={{
                    backgroundColor: "var(--color-brand-50)",
                    color: "var(--color-brand-600)",
                  }}
                >
                  <ShieldCheck size={17} strokeWidth={2.1} aria-hidden="true" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[15px] font-bold text-[var(--color-neutral-900)]">
                    {a.full_name}
                    {a.user_id && a.user_id === userId ? ` (${t("authority.you")})` : ""}
                  </p>
                  <p className="text-[13px] text-[var(--color-neutral-500)]">+91 {a.phone}</p>
                </div>
                <StatusPill tone={a.user_id ? "done" : "neutral"}>
                  {a.user_id ? t("authority.statusJoined") : t("authority.statusInvited")}
                </StatusPill>
              </SurfaceCard>
            </li>
          ))}
        </ul>
      )}

      {adding ? (
        <AddAuthorityDialog
          societyId={societyId}
          onClose={() => setAdding(false)}
          onAdded={(linked) => {
            setNotice(linked ? t("authority.addedLinked") : t("authority.added"));
            load();
          }}
        />
      ) : null}
    </section>
  );
}
