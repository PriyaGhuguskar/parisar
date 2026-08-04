"use client";

// GuardsSection — secretary's list of gate guards + "Add guard". Self-contained:
// it loads its own guards (RLS society_guards_secretary scopes to the caller's
// society) and adds via the secretary_add_guard RPC. Rendered inside SocietyOverview.

import { addGuard } from "@parisar/api-client";
import { Plus, ShieldCheck, X } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { SurfaceCard } from "@/components/kit";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

const FIELD =
  "h-11 w-full rounded-xl border border-[var(--color-neutral-200)] bg-[var(--color-neutral-0)] px-3.5 text-[15px] outline-none focus:border-[var(--color-brand-500)] focus:shadow-[0_0_0_4px_color-mix(in_srgb,var(--color-brand-500)_16%,transparent)]";

const ERROR_KEY = {
  GUARD_EXISTS: "visitor.guardExists",
  INVALID_PHONE: "visitor.guardInvalidPhone",
};

function AddGuardDialog({ societyId, onClose, onAdded }) {
  const { t } = useTranslation("auth");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  async function submit(e) {
    e.preventDefault();
    setError(null);
    if (!name.trim()) return setError(t("visitor.guardName"));
    if (!/^[6-9]\d{9}$/.test(phone)) return setError(t("visitor.guardInvalidPhone"));
    setSaving(true);
    try {
      const supabase = createSupabaseBrowserClient();
      const res = await addGuard(supabase, { societyId, name: name.trim(), phone });
      if (res?.error) {
        setError(t(ERROR_KEY[res.error] ?? "visitor.guardAddError"));
        setSaving(false);
        return;
      }
      onAdded();
      onClose();
    } catch {
      setError(t("visitor.guardAddError"));
      setSaving(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-[rgba(18,38,28,0.45)] p-0 sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-label={t("visitor.addGuard")}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-md rounded-t-[22px] bg-[var(--color-neutral-0)] p-6 sm:rounded-[22px]">
        <div className="mb-5 flex items-start justify-between gap-4">
          <h2 className="text-[20px] font-extrabold tracking-[-0.02em] text-[var(--color-neutral-900)]">
            {t("visitor.addGuard")}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label={t("profile.cancel")}
            className="rounded-lg p-1.5 text-[var(--color-neutral-500)] hover:bg-[var(--color-neutral-100)]"
          >
            <X size={18} strokeWidth={2.2} aria-hidden="true" />
          </button>
        </div>
        <form onSubmit={submit} className="flex flex-col gap-4">
          <label className="flex flex-col gap-1.5">
            <span className="text-[13px] font-bold text-[var(--color-neutral-900)]">
              {t("visitor.guardName")}
            </span>
            <input
              // biome-ignore lint/a11y/noAutofocus: first field of an explicitly-opened dialog
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t("visitor.guardNamePh")}
              maxLength={60}
              className={FIELD}
            />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-[13px] font-bold text-[var(--color-neutral-900)]">
              {t("visitor.guardPhone")}
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
            <p className="text-[13px] font-semibold text-[var(--color-danger)]">{error}</p>
          ) : null}
          <div className="flex items-center justify-end gap-2.5">
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className="rounded-xl px-4 py-2.5 text-[14px] font-semibold text-[var(--color-neutral-600)] hover:bg-[var(--color-neutral-100)] disabled:opacity-60"
            >
              {t("profile.cancel")}
            </button>
            <button
              type="submit"
              disabled={saving}
              className="rounded-xl bg-[var(--color-brand-600)] px-5 py-2.5 text-[14px] font-bold text-white transition-opacity hover:opacity-90 disabled:opacity-60"
            >
              {saving ? t("profile.saving") : t("visitor.addGuard")}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export function GuardsSection({ societyId }) {
  const { t } = useTranslation("auth");
  const [guards, setGuards] = useState([]);
  const [adding, setAdding] = useState(false);

  const load = useCallback(async () => {
    const supabase = createSupabaseBrowserClient();
    const { data } = await supabase
      .from("society_guards")
      .select("id, name, phone, user_id")
      .eq("society_id", societyId)
      .eq("status", "active")
      .order("created_at", { ascending: true });
    setGuards(Array.isArray(data) ? data : []);
  }, [societyId]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-end justify-between gap-3">
        <div>
          <h2 className="text-[20px] font-extrabold tracking-[-0.02em] text-[var(--color-neutral-900)]">
            {t("visitor.guardsTitle")}
          </h2>
          <p className="mt-0.5 text-[14px] text-[var(--color-neutral-600)]">
            {t("visitor.guardsLead")}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setAdding(true)}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-xl bg-[var(--color-brand-600)] px-4 py-2.5 text-[14px] font-bold text-white transition-opacity hover:opacity-90"
        >
          <Plus size={16} strokeWidth={2.5} aria-hidden="true" />
          {t("visitor.addGuard")}
        </button>
      </div>

      {guards.length === 0 ? (
        <SurfaceCard className="px-5 py-6 text-center text-[14px] text-[var(--color-neutral-400)]">
          {t("visitor.noGuards")}
        </SurfaceCard>
      ) : (
        <ul className="flex flex-col gap-2">
          {guards.map((g) => (
            <li key={g.id}>
              <SurfaceCard className="flex items-center gap-3 px-4 py-3">
                <span
                  className="inline-flex h-9 w-9 items-center justify-center rounded-xl"
                  style={{
                    backgroundColor: "var(--color-brand-50)",
                    color: "var(--color-brand-600)",
                  }}
                >
                  <ShieldCheck size={17} strokeWidth={2.1} aria-hidden="true" />
                </span>
                <div className="min-w-0">
                  <p className="truncate text-[15px] font-bold text-[var(--color-neutral-900)]">
                    {g.name}
                  </p>
                  <p className="text-[13px] text-[var(--color-neutral-500)]">+91 {g.phone}</p>
                </div>
              </SurfaceCard>
            </li>
          ))}
        </ul>
      )}

      {adding ? (
        <AddGuardDialog societyId={societyId} onClose={() => setAdding(false)} onAdded={load} />
      ) : null}
    </section>
  );
}
