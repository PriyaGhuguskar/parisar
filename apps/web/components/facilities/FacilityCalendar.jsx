"use client";

// FacilityCalendar — society-ops schedule (water shutdown, lift maintenance,
// events, garbage). Secretary/co-sec schedule; everyone browses by category.
// The next upcoming event also surfaces on the home highlights strip.

import { addFacilityEvent, deleteFacilityEvent } from "@parisar/api-client";
import { CalendarDays, Plus, Trash2, X } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { EmptyState, PageHeader, PageShell, SurfaceCard } from "@/components/kit";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

const FCATS = [
  "water_shutdown",
  "lift_maintenance",
  "society_event",
  "garbage_collection",
  "other",
];
const MANAGER_ROLES = new Set(["secretary", "co_secretary"]);

const FIELD =
  "h-11 w-full rounded-xl border border-[var(--color-neutral-200)] bg-[var(--color-neutral-0)] px-3.5 text-[15px] outline-none focus:border-[var(--color-brand-500)] focus:shadow-[0_0_0_4px_color-mix(in_srgb,var(--color-brand-500)_16%,transparent)]";

function fmt(iso) {
  try {
    return new Date(iso).toLocaleString(undefined, {
      weekday: "short",
      day: "numeric",
      month: "short",
      hour: "numeric",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

function AddFacilityDialog({ societyId, onClose, onAdded }) {
  const { t } = useTranslation("auth");
  const [category, setCategory] = useState("water_shutdown");
  const [title, setTitle] = useState("");
  const [note, setNote] = useState("");
  const [when, setWhen] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  async function submit(e) {
    e.preventDefault();
    setError(null);
    if (!title.trim()) return setError(t("facility.titleRequired"));
    if (!when) return setError(t("facility.timeRequired"));
    setSaving(true);
    try {
      const supabase = createSupabaseBrowserClient();
      const res = await addFacilityEvent(supabase, {
        societyId,
        category,
        title: title.trim(),
        note,
        startsAt: new Date(when).toISOString(),
      });
      if (res?.error) {
        setError(t("facility.saveError"));
        setSaving(false);
        return;
      }
      onAdded();
      onClose();
    } catch {
      setError(t("facility.saveError"));
      setSaving(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-[rgba(18,38,28,0.45)] p-0 sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-label={t("facility.add")}
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="w-full max-w-md rounded-t-[22px] bg-[var(--color-neutral-0)] p-6 sm:rounded-[22px]">
        <div className="mb-5 flex items-start justify-between gap-4">
          <h2 className="text-[20px] font-extrabold tracking-[-0.02em] text-[var(--color-neutral-900)]">
            {t("facility.add")}
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
              {t("facility.category")}
            </span>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className={FIELD}
            >
              {FCATS.map((c) => (
                <option key={c} value={c}>
                  {t(`facility.${c}`)}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-[13px] font-bold text-[var(--color-neutral-900)]">
              {t("facility.eventTitle")}
            </span>
            <input
              // biome-ignore lint/a11y/noAutofocus: first text field of an explicitly-opened dialog
              autoFocus
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={t("facility.eventTitlePh")}
              maxLength={80}
              className={FIELD}
            />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-[13px] font-bold text-[var(--color-neutral-900)]">
              {t("facility.when")}
            </span>
            <input
              type="datetime-local"
              value={when}
              onChange={(e) => setWhen(e.target.value)}
              className={FIELD}
            />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-[13px] font-bold text-[var(--color-neutral-900)]">
              {t("facility.note")}
            </span>
            <input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              maxLength={120}
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
              {saving ? t("facility.saving") : t("facility.save")}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export function FacilityCalendar({ societyId, role }) {
  const { t } = useTranslation("auth");
  const { t: tNav } = useTranslation("dashboard");
  const [events, setEvents] = useState([]);
  const [filter, setFilter] = useState("all");
  const [adding, setAdding] = useState(false);
  const canManage = MANAGER_ROLES.has(role);

  const load = useCallback(async () => {
    const supabase = createSupabaseBrowserClient();
    const { data } = await supabase
      .from("facility_events")
      .select("id, category, title, note, starts_at")
      .eq("society_id", societyId)
      .order("starts_at", { ascending: true });
    setEvents(Array.isArray(data) ? data : []);
  }, [societyId]);

  useEffect(() => {
    load();
    const supabase = createSupabaseBrowserClient();
    const channel = supabase
      .channel("facilities")
      .on("postgres_changes", { event: "*", schema: "public", table: "facility_events" }, () =>
        load(),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [load]);

  async function remove(id) {
    const supabase = createSupabaseBrowserClient();
    await deleteFacilityEvent(supabase, id);
    await load();
  }

  const now = Date.now();
  const filtered = filter === "all" ? events : events.filter((e) => e.category === filter);
  const upcoming = filtered.filter((e) => new Date(e.starts_at).getTime() >= now);
  const past = filtered.filter((e) => new Date(e.starts_at).getTime() < now).reverse();

  const Row = ({ e }) => (
    <SurfaceCard className="flex items-start justify-between gap-3 p-4">
      <div className="min-w-0">
        <span className="inline-flex items-center rounded-full bg-[var(--color-brand-50)] px-2.5 py-0.5 text-[12px] font-bold text-[var(--color-brand-600)]">
          {t(`facility.${e.category}`)}
        </span>
        <p className="mt-1.5 truncate text-[16px] font-bold text-[var(--color-neutral-900)]">
          {e.title}
        </p>
        <p className="text-[13px] font-semibold text-[var(--color-neutral-600)]">
          {fmt(e.starts_at)}
        </p>
        {e.note ? (
          <p className="mt-0.5 text-[13px] text-[var(--color-neutral-500)]">{e.note}</p>
        ) : null}
      </div>
      {canManage ? (
        <button
          type="button"
          onClick={() => remove(e.id)}
          aria-label={t("facility.remove")}
          className="shrink-0 rounded-lg p-2 text-[var(--color-neutral-400)] hover:bg-[var(--color-neutral-100)] hover:text-[var(--color-danger)]"
        >
          <Trash2 size={16} strokeWidth={2} aria-hidden="true" />
        </button>
      ) : null}
    </SurfaceCard>
  );

  return (
    <PageShell>
      <PageHeader
        backHref="/dashboard"
        backLabel={tNav("nav.home")}
        title={t("facility.title")}
        description={t("facility.lead")}
        actions={
          canManage ? (
            <button
              type="button"
              onClick={() => setAdding(true)}
              className="inline-flex items-center gap-1.5 rounded-xl bg-[var(--color-brand-600)] px-4 py-2.5 text-[14px] font-bold text-white transition-opacity hover:opacity-90"
            >
              <Plus size={16} strokeWidth={2.5} aria-hidden="true" />
              {t("facility.add")}
            </button>
          ) : null
        }
      />

      <div className="mb-5 flex flex-wrap gap-2">
        {["all", ...FCATS].map((c) => (
          <button
            key={c}
            type="button"
            onClick={() => setFilter(c)}
            className={`rounded-full px-3.5 py-1.5 text-[13px] font-semibold ${
              filter === c
                ? "bg-[var(--color-brand-600)] text-white"
                : "bg-[var(--color-neutral-100)] text-[var(--color-neutral-600)] hover:bg-[var(--color-neutral-200)]"
            }`}
          >
            {c === "all" ? t("facility.filterAll") : t(`facility.${c}`)}
          </button>
        ))}
      </div>

      {upcoming.length === 0 && past.length === 0 ? (
        <EmptyState
          icon={CalendarDays}
          title={t("facility.empty")}
          action={
            canManage ? (
              <button
                type="button"
                onClick={() => setAdding(true)}
                className="inline-flex items-center gap-1.5 rounded-xl bg-[var(--color-brand-600)] px-4 py-2.5 text-[14px] font-bold text-white transition-opacity hover:opacity-90"
              >
                <Plus size={16} strokeWidth={2.5} aria-hidden="true" />
                {t("facility.addFirst")}
              </button>
            ) : null
          }
        />
      ) : (
        <div className="flex flex-col gap-6">
          {upcoming.length ? (
            <section className="flex flex-col gap-2">
              <p className="text-[13px] font-bold uppercase tracking-[0.08em] text-[var(--color-neutral-400)]">
                {t("facility.upcoming")}
              </p>
              {upcoming.map((e) => (
                <Row key={e.id} e={e} />
              ))}
            </section>
          ) : null}
          {past.length ? (
            <section className="flex flex-col gap-2">
              <p className="text-[13px] font-bold uppercase tracking-[0.08em] text-[var(--color-neutral-400)]">
                {t("facility.past")}
              </p>
              {past.map((e) => (
                <Row key={e.id} e={e} />
              ))}
            </section>
          ) : null}
        </div>
      )}

      {adding ? (
        <AddFacilityDialog societyId={societyId} onClose={() => setAdding(false)} onAdded={load} />
      ) : null}
    </PageShell>
  );
}
