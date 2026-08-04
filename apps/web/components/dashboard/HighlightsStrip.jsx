"use client";

// HighlightsStrip — the pinned cards at the top of home. Residents see up to 4
// secretary-set highlights (water timing, an update, a notice…), refreshed live
// via realtime. The secretary gets an Edit control that opens the manager; saving
// notifies residents on any add/change (handled server-side by the RPC).

import { setHighlights } from "@parisar/api-client";
import { CalendarClock, Pin, Plus, Trash2, X } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

const MANAGER_ROLES = new Set(["secretary", "co_secretary"]);
const MAX = 4;

// The next upcoming facility event auto-surfaces here; format its time compactly.
function fmtEvent(iso) {
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

const FIELD =
  "h-11 w-full rounded-xl border border-[var(--color-neutral-200)] bg-[var(--color-neutral-0)] px-3.5 text-[15px] outline-none focus:border-[var(--color-brand-500)] focus:shadow-[0_0_0_4px_color-mix(in_srgb,var(--color-brand-500)_16%,transparent)]";

function Manager({ societyId, initial, onClose, onSaved }) {
  const { t } = useTranslation("auth");
  const [items, setItems] = useState(() =>
    initial.length
      ? initial.map((h) => ({ title: h.title, body: h.body }))
      : [{ title: "", body: "" }],
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  const set = (i, patch) =>
    setItems((xs) => xs.map((x, idx) => (idx === i ? { ...x, ...patch } : x)));
  const remove = (i) => setItems((xs) => xs.filter((_, idx) => idx !== i));
  const add = () => setItems((xs) => (xs.length < MAX ? [...xs, { title: "", body: "" }] : xs));

  async function save() {
    setError(null);
    const clean = items
      .map((x) => ({ title: x.title.trim(), body: x.body.trim() }))
      .filter((x) => x.title && x.body);
    setSaving(true);
    try {
      const supabase = createSupabaseBrowserClient();
      const res = await setHighlights(supabase, { societyId, items: clean });
      if (res?.error) {
        setError(t(res.error === "TOO_MANY" ? "highlights.max" : "highlights.saveError"));
        setSaving(false);
        return;
      }
      onSaved(res.highlights);
      onClose();
    } catch {
      setError(t("highlights.saveError"));
      setSaving(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-[rgba(18,38,28,0.45)] p-0 sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-label={t("highlights.manageTitle")}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="flex max-h-[92vh] w-full max-w-lg flex-col rounded-t-[22px] bg-[var(--color-neutral-0)] sm:rounded-[22px]">
        <div className="flex items-start justify-between gap-4 p-6 pb-4">
          <div>
            <h2 className="text-[20px] font-extrabold tracking-[-0.02em] text-[var(--color-neutral-900)]">
              {t("highlights.manageTitle")}
            </h2>
            <p className="mt-1 text-[14px] leading-relaxed text-[var(--color-neutral-600)]">
              {t("highlights.manageLead")}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={t("profile.cancel")}
            className="rounded-lg p-1.5 text-[var(--color-neutral-500)] hover:bg-[var(--color-neutral-100)]"
          >
            <X size={18} strokeWidth={2.2} aria-hidden="true" />
          </button>
        </div>

        <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-6">
          {items.map((it, i) => (
            <div
              // biome-ignore lint/suspicious/noArrayIndexKey: positional rows, no stable id
              key={i}
              className="rounded-xl border border-[var(--color-neutral-200)] bg-[var(--color-neutral-50)] p-3"
            >
              <div className="flex items-center justify-between">
                <span className="text-[12px] font-bold uppercase tracking-[0.08em] text-[var(--color-neutral-400)]">
                  {i + 1}
                </span>
                <button
                  type="button"
                  onClick={() => remove(i)}
                  aria-label={t("highlights.remove")}
                  className="rounded-lg p-1.5 text-[var(--color-neutral-400)] hover:bg-[var(--color-neutral-100)] hover:text-[var(--color-danger)]"
                >
                  <Trash2 size={15} strokeWidth={2} aria-hidden="true" />
                </button>
              </div>
              <input
                value={it.title}
                onChange={(e) => set(i, { title: e.target.value })}
                placeholder={t("highlights.cardTitlePh")}
                maxLength={40}
                className={`${FIELD} mb-2`}
                aria-label={t("highlights.cardTitle")}
              />
              <input
                value={it.body}
                onChange={(e) => set(i, { body: e.target.value })}
                placeholder={t("highlights.cardBodyPh")}
                maxLength={80}
                className={FIELD}
                aria-label={t("highlights.cardBody")}
              />
            </div>
          ))}

          {items.length < MAX ? (
            <button
              type="button"
              onClick={add}
              className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-dashed border-[var(--color-brand-500)]/50 py-2.5 text-[14px] font-bold text-[var(--color-brand-600)] hover:bg-[var(--color-brand-50)]"
            >
              <Plus size={16} strokeWidth={2.5} aria-hidden="true" />
              {t("highlights.add")}
            </button>
          ) : (
            <p className="text-center text-[12px] text-[var(--color-neutral-400)]">
              {t("highlights.max")}
            </p>
          )}
        </div>

        <div className="flex flex-col gap-2 border-t border-[var(--color-neutral-100)] p-6 pt-4">
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
              type="button"
              onClick={save}
              disabled={saving}
              className="rounded-xl bg-[var(--color-brand-600)] px-5 py-2.5 text-[14px] font-bold text-white transition-opacity hover:opacity-90 disabled:opacity-60"
            >
              {saving ? t("highlights.saving") : t("highlights.save")}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export function HighlightsStrip({ societyId, role }) {
  const { t } = useTranslation("auth");
  const [highlights, setList] = useState([]);
  const [nextEvent, setNextEvent] = useState(null);
  const [managing, setManaging] = useState(false);
  const canManage = MANAGER_ROLES.has(role);

  const load = useCallback(async () => {
    if (!societyId) return;
    const supabase = createSupabaseBrowserClient();
    const [{ data: hs }, { data: ev }] = await Promise.all([
      supabase
        .from("society_highlights")
        .select("id, title, body, position")
        .eq("society_id", societyId)
        .order("position", { ascending: true }),
      // The soonest upcoming facility event auto-shows as a highlight card.
      supabase
        .from("facility_events")
        .select("id, category, title, starts_at")
        .eq("society_id", societyId)
        .gte("starts_at", new Date().toISOString())
        .order("starts_at", { ascending: true })
        .limit(1),
    ]);
    setList(Array.isArray(hs) ? hs : []);
    setNextEvent(Array.isArray(ev) && ev.length ? ev[0] : null);
  }, [societyId]);

  useEffect(() => {
    if (!societyId) return undefined;
    load();
    const supabase = createSupabaseBrowserClient();
    const channel = supabase
      .channel("highlights")
      .on("postgres_changes", { event: "*", schema: "public", table: "society_highlights" }, () =>
        load(),
      )
      .on("postgres_changes", { event: "*", schema: "public", table: "facility_events" }, () =>
        load(),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [societyId, load]);

  // Nothing to show and can't edit → render nothing.
  if (highlights.length === 0 && !nextEvent && !canManage) return null;

  return (
    <section className="mb-6">
      <div className="mb-2 flex items-center justify-between">
        <span className="inline-flex items-center gap-1.5 text-[12px] font-bold uppercase tracking-[0.1em] text-[var(--color-brand-600)]">
          <Pin size={13} strokeWidth={2.4} aria-hidden="true" />
          {t("highlights.manageTitle")}
        </span>
        {canManage ? (
          <button
            type="button"
            onClick={() => setManaging(true)}
            className="text-[13px] font-semibold text-[var(--color-brand-600)] hover:underline"
          >
            {highlights.length ? t("highlights.edit") : t("highlights.addFirst")}
          </button>
        ) : null}
      </div>

      {highlights.length || nextEvent ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {nextEvent ? (
            <a
              href="/facilities"
              className="rounded-[16px] border border-[var(--color-neutral-200)] bg-white p-4"
              style={{
                boxShadow: "0 1px 2px rgba(18,38,28,.05)",
                borderLeft: "4px solid var(--color-warning)",
              }}
            >
              <p className="inline-flex items-center gap-1 text-[12px] font-bold uppercase tracking-[0.06em] text-[var(--color-warning)]">
                <CalendarClock size={12} strokeWidth={2.4} aria-hidden="true" />
                {t(`facility.${nextEvent.category}`)}
              </p>
              <p className="mt-1 text-[16px] font-extrabold leading-tight tracking-[-0.01em] text-[var(--color-neutral-900)]">
                {nextEvent.title}
              </p>
              <p className="text-[13px] font-semibold text-[var(--color-neutral-500)]">
                {fmtEvent(nextEvent.starts_at)}
              </p>
            </a>
          ) : null}
          {highlights.map((h) => (
            <div
              key={h.id}
              className="rounded-[16px] border border-[var(--color-neutral-200)] bg-white p-4"
              style={{
                boxShadow: "0 1px 2px rgba(18,38,28,.05)",
                borderLeft: "4px solid var(--color-brand-500)",
              }}
            >
              <p className="text-[12px] font-bold uppercase tracking-[0.06em] text-[var(--color-neutral-500)]">
                {h.title}
              </p>
              <p className="mt-1 text-[18px] font-extrabold leading-tight tracking-[-0.01em] text-[var(--color-neutral-900)]">
                {h.body}
              </p>
            </div>
          ))}
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setManaging(true)}
          className="flex w-full items-center justify-center gap-1.5 rounded-[16px] border border-dashed border-[var(--color-neutral-200)] py-5 text-[14px] font-semibold text-[var(--color-brand-600)] hover:border-[var(--color-brand-500)]"
        >
          <Plus size={16} strokeWidth={2.5} aria-hidden="true" />
          {t("highlights.addFirst")}
        </button>
      )}

      {managing ? (
        <Manager
          societyId={societyId}
          initial={highlights}
          onClose={() => setManaging(false)}
          onSaved={setList}
        />
      ) : null}
    </section>
  );
}
