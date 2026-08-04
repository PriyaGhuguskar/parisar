"use client";

// AmenitiesSection — secretary manages the society's amenities and each one's
// status: Working, or Closed (with an optional "closed till <date>"). Residents
// see the same statuses elsewhere; here they're editable. Rendered on the
// Society profile page.

import { deleteAmenity, upsertAmenity } from "@parisar/api-client";
import { Dumbbell, Pencil, Plus, Trash2, X } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { SurfaceCard } from "@/components/kit";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

const FIELD =
  "h-11 w-full rounded-xl border border-[var(--color-neutral-200)] bg-[var(--color-neutral-0)] px-3.5 text-[15px] outline-none focus:border-[var(--color-brand-500)] focus:shadow-[0_0_0_4px_color-mix(in_srgb,var(--color-brand-500)_16%,transparent)]";

function fmtDate(d) {
  try {
    return new Date(d).toLocaleDateString(undefined, {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  } catch {
    return d;
  }
}

function AmenityDialog({ societyId, editing, onClose, onSaved }) {
  const { t } = useTranslation("auth");
  const [name, setName] = useState(editing?.name ?? "");
  const [status, setStatus] = useState(editing?.status ?? "working");
  const [closedUntil, setClosedUntil] = useState(editing?.closed_until ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  async function submit(e) {
    e.preventDefault();
    setError(null);
    if (!name.trim()) return setError(t("profile.amenityNameRequired"));
    setSaving(true);
    try {
      const supabase = createSupabaseBrowserClient();
      const res = await upsertAmenity(supabase, {
        societyId,
        id: editing?.id ?? null,
        name: name.trim(),
        status,
        closedUntil: status === "closed" ? closedUntil || null : null,
      });
      if (res?.error) {
        setError(t("profile.amenitySaveError"));
        setSaving(false);
        return;
      }
      onSaved();
      onClose();
    } catch {
      setError(t("profile.amenitySaveError"));
      setSaving(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-[rgba(18,38,28,0.45)] p-0 sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-label={t("profile.addAmenity")}
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="w-full max-w-md rounded-t-[22px] bg-[var(--color-neutral-0)] p-6 sm:rounded-[22px]">
        <div className="mb-5 flex items-start justify-between gap-4">
          <h2 className="text-[20px] font-extrabold tracking-[-0.02em] text-[var(--color-neutral-900)]">
            {t("profile.addAmenity")}
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
              {t("profile.amenityName")}
            </span>
            <input
              // biome-ignore lint/a11y/noAutofocus: first field of an explicitly-opened dialog
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t("profile.amenityNamePh")}
              maxLength={50}
              className={FIELD}
            />
          </label>
          <div className="flex flex-col gap-1.5">
            <span className="text-[13px] font-bold text-[var(--color-neutral-900)]">
              {t("profile.amenityStatus")}
            </span>
            <div className="grid grid-cols-2 gap-2">
              {[
                ["working", t("profile.statusWorking")],
                ["closed", t("profile.statusClosed")],
              ].map(([v, lbl]) => {
                const on = status === v;
                return (
                  <button
                    key={v}
                    type="button"
                    onClick={() => setStatus(v)}
                    className="rounded-xl border px-4 py-2.5 text-[14px] font-bold transition-colors"
                    style={{
                      borderColor: on ? "var(--color-brand-500)" : "var(--color-neutral-200)",
                      backgroundColor: on ? "var(--color-brand-50)" : "#fff",
                      color: on ? "var(--color-brand-700)" : "var(--color-neutral-600)",
                    }}
                  >
                    {lbl}
                  </button>
                );
              })}
            </div>
          </div>
          {status === "closed" ? (
            <label className="flex flex-col gap-1.5">
              <span className="text-[13px] font-bold text-[var(--color-neutral-900)]">
                {t("profile.closedTill")}
              </span>
              <input
                type="date"
                value={closedUntil ?? ""}
                onChange={(e) => setClosedUntil(e.target.value)}
                className={FIELD}
              />
            </label>
          ) : null}
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
              {saving ? t("profile.saving") : t("profile.save")}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export function AmenitiesSection({ societyId }) {
  const { t } = useTranslation("auth");
  const [amenities, setAmenities] = useState([]);
  const [dialog, setDialog] = useState(null); // null | { editing?: amenity }

  const load = useCallback(async () => {
    const supabase = createSupabaseBrowserClient();
    const { data } = await supabase
      .from("amenities")
      .select("id, name, status, closed_until")
      .eq("society_id", societyId)
      .order("name", { ascending: true });
    setAmenities(Array.isArray(data) ? data : []);
  }, [societyId]);

  useEffect(() => {
    load();
  }, [load]);

  async function remove(id) {
    const supabase = createSupabaseBrowserClient();
    await deleteAmenity(supabase, id);
    await load();
  }

  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-end justify-between gap-3">
        <div>
          <h2 className="text-[20px] font-extrabold tracking-[-0.02em] text-[var(--color-neutral-900)]">
            {t("profile.amenitiesTitle")}
          </h2>
          <p className="mt-0.5 text-[14px] text-[var(--color-neutral-600)]">
            {t("profile.amenitiesLead")}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setDialog({})}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-xl bg-[var(--color-brand-600)] px-4 py-2.5 text-[14px] font-bold text-white transition-opacity hover:opacity-90"
        >
          <Plus size={16} strokeWidth={2.5} aria-hidden="true" />
          {t("profile.addAmenity")}
        </button>
      </div>

      {amenities.length === 0 ? (
        <SurfaceCard className="px-5 py-6 text-center text-[14px] text-[var(--color-neutral-400)]">
          {t("profile.noAmenities")}
        </SurfaceCard>
      ) : (
        <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {amenities.map((a) => {
            const closed = a.status === "closed";
            return (
              <li key={a.id}>
                <SurfaceCard className="flex items-center gap-3 px-4 py-3">
                  <span
                    className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl"
                    style={{
                      backgroundColor: closed ? "#FCE9E6" : "var(--color-brand-50)",
                      color: closed ? "var(--color-danger)" : "var(--color-brand-600)",
                    }}
                  >
                    <Dumbbell size={17} strokeWidth={2.1} aria-hidden="true" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[15px] font-bold text-[var(--color-neutral-900)]">
                      {a.name}
                    </p>
                    <span
                      className={`inline-flex items-center gap-1 text-[12px] font-bold ${
                        closed ? "text-[var(--color-danger)]" : "text-[var(--color-brand-600)]"
                      }`}
                    >
                      {closed
                        ? a.closed_until
                          ? `${t("profile.statusClosed")} · ${t("profile.closedTillShort", { date: fmtDate(a.closed_until) })}`
                          : t("profile.statusClosed")
                        : t("profile.statusWorking")}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setDialog({ editing: a })}
                    aria-label={t("profile.edit")}
                    className="shrink-0 rounded-lg p-2 text-[var(--color-neutral-400)] hover:bg-[var(--color-neutral-100)] hover:text-[var(--color-brand-600)]"
                  >
                    <Pencil size={15} strokeWidth={2} aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    onClick={() => remove(a.id)}
                    aria-label={t("profile.amenityRemove")}
                    className="shrink-0 rounded-lg p-2 text-[var(--color-neutral-400)] hover:bg-[var(--color-neutral-100)] hover:text-[var(--color-danger)]"
                  >
                    <Trash2 size={15} strokeWidth={2} aria-hidden="true" />
                  </button>
                </SurfaceCard>
              </li>
            );
          })}
        </ul>
      )}

      {dialog ? (
        <AmenityDialog
          societyId={societyId}
          editing={dialog.editing}
          onClose={() => setDialog(null)}
          onSaved={load}
        />
      ) : null}
    </section>
  );
}
