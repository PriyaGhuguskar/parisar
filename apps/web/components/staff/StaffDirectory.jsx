"use client";

// StaffDirectory — a shared contact list of local help. Any resident can add;
// everyone sees; the adder is attributed ("Added by Rahul · B-203", highlighted).
// A category filter narrows the list. Realtime keeps it fresh.

import { addStaff, deleteStaff } from "@parisar/api-client";
import { Phone, Plus, Trash2, UserRound, X } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { EmptyState, PageHeader, PageShell, SurfaceCard } from "@/components/kit";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

const CATS = ["maid", "driver", "cook", "electrician", "plumber", "gardener", "other"];
const MANAGER_ROLES = new Set(["secretary", "co_secretary"]);

const FIELD =
  "h-11 w-full rounded-xl border border-[var(--color-neutral-200)] bg-[var(--color-neutral-0)] px-3.5 text-[15px] outline-none focus:border-[var(--color-brand-500)] focus:shadow-[0_0_0_4px_color-mix(in_srgb,var(--color-brand-500)_16%,transparent)]";

function AddStaffDialog({ societyId, onClose, onAdded }) {
  const { t } = useTranslation("auth");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [category, setCategory] = useState("maid");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  async function submit(e) {
    e.preventDefault();
    setError(null);
    if (!name.trim()) return setError(t("staff.nameRequired"));
    setSaving(true);
    try {
      const supabase = createSupabaseBrowserClient();
      const res = await addStaff(supabase, { societyId, name: name.trim(), phone, category });
      if (res?.error) {
        setError(t("staff.saveError"));
        setSaving(false);
        return;
      }
      onAdded();
      onClose();
    } catch {
      setError(t("staff.saveError"));
      setSaving(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-[rgba(18,38,28,0.45)] p-0 sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-label={t("staff.add")}
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="w-full max-w-md rounded-t-[22px] bg-[var(--color-neutral-0)] p-6 sm:rounded-[22px]">
        <div className="mb-5 flex items-start justify-between gap-4">
          <h2 className="text-[20px] font-extrabold tracking-[-0.02em] text-[var(--color-neutral-900)]">
            {t("staff.add")}
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
              {t("staff.category")}
            </span>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className={FIELD}
            >
              {CATS.map((c) => (
                <option key={c} value={c}>
                  {t(`staff.${c}`)}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-[13px] font-bold text-[var(--color-neutral-900)]">
              {t("staff.name")}
            </span>
            <input
              // biome-ignore lint/a11y/noAutofocus: first field of an explicitly-opened dialog
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t("staff.namePh")}
              maxLength={60}
              className={FIELD}
            />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-[13px] font-bold text-[var(--color-neutral-900)]">
              {t("staff.phone")}
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
              {saving ? t("profile.saving") : t("staff.add")}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export function StaffDirectory({ societyId, userId, role }) {
  const { t } = useTranslation("auth");
  const { t: tNav } = useTranslation("dashboard");
  const [staff, setStaff] = useState([]);
  const [filter, setFilter] = useState("all");
  const [adding, setAdding] = useState(false);
  const canManage = MANAGER_ROLES.has(role);

  const load = useCallback(async () => {
    const supabase = createSupabaseBrowserClient();
    const { data } = await supabase
      .from("society_staff")
      .select("id, name, phone, category, added_by, added_by_name, added_by_flat")
      .eq("society_id", societyId)
      .order("created_at", { ascending: false });
    setStaff(Array.isArray(data) ? data : []);
  }, [societyId]);

  useEffect(() => {
    load();
    const supabase = createSupabaseBrowserClient();
    const channel = supabase
      .channel("staff")
      .on("postgres_changes", { event: "*", schema: "public", table: "society_staff" }, () =>
        load(),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [load]);

  async function remove(id) {
    const supabase = createSupabaseBrowserClient();
    await deleteStaff(supabase, id);
    await load();
  }

  const shown = filter === "all" ? staff : staff.filter((s) => s.category === filter);

  return (
    <PageShell>
      <PageHeader
        backHref="/dashboard"
        backLabel={tNav("nav.home")}
        title={t("staff.title")}
        description={t("staff.lead")}
        actions={
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="inline-flex items-center gap-1.5 rounded-xl bg-[var(--color-brand-600)] px-4 py-2.5 text-[14px] font-bold text-white transition-opacity hover:opacity-90"
          >
            <Plus size={16} strokeWidth={2.5} aria-hidden="true" />
            {t("staff.add")}
          </button>
        }
      />

      {/* Category filter */}
      <div className="mb-5 flex flex-wrap gap-2">
        {["all", ...CATS].map((c) => (
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
            {c === "all" ? t("staff.filterAll") : t(`staff.${c}`)}
          </button>
        ))}
      </div>

      {shown.length === 0 ? (
        <EmptyState
          icon={UserRound}
          title={t("staff.empty")}
          action={
            <button
              type="button"
              onClick={() => setAdding(true)}
              className="inline-flex items-center gap-1.5 rounded-xl bg-[var(--color-brand-600)] px-4 py-2.5 text-[14px] font-bold text-white transition-opacity hover:opacity-90"
            >
              <Plus size={16} strokeWidth={2.5} aria-hidden="true" />
              {t("staff.addFirst")}
            </button>
          }
        />
      ) : (
        <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {shown.map((s) => (
            <li key={s.id}>
              <SurfaceCard className="flex items-start justify-between gap-3 p-4">
                <div className="min-w-0">
                  <span className="inline-flex items-center rounded-full bg-[var(--color-brand-50)] px-2.5 py-0.5 text-[12px] font-bold text-[var(--color-brand-600)]">
                    {t(`staff.${s.category}`)}
                  </span>
                  <p className="mt-1.5 truncate text-[16px] font-bold text-[var(--color-neutral-900)]">
                    {s.name}
                  </p>
                  {s.phone ? (
                    <a
                      href={`tel:+91${s.phone}`}
                      className="mt-0.5 inline-flex items-center gap-1.5 text-[14px] font-semibold text-[var(--color-brand-600)] hover:underline"
                    >
                      <Phone size={13} strokeWidth={2.2} aria-hidden="true" />
                      +91 {s.phone}
                    </a>
                  ) : null}
                  {s.added_by_name ? (
                    <p className="mt-1 text-[12px] text-[var(--color-neutral-400)]">
                      {t("staff.addedBy", {
                        who: `${s.added_by_name}${s.added_by_flat ? ` · ${s.added_by_flat}` : ""}`,
                      })
                        .split(s.added_by_name)
                        .flatMap((part, i) =>
                          i === 0
                            ? [part]
                            : [
                                <span
                                  // biome-ignore lint/suspicious/noArrayIndexKey: split marker
                                  key={i}
                                  className="font-bold text-[var(--color-brand-600)]"
                                >
                                  {s.added_by_name}
                                </span>,
                                part,
                              ],
                        )}
                    </p>
                  ) : null}
                </div>
                {s.added_by === userId || canManage ? (
                  <button
                    type="button"
                    onClick={() => remove(s.id)}
                    aria-label={t("staff.remove")}
                    className="shrink-0 rounded-lg p-2 text-[var(--color-neutral-400)] hover:bg-[var(--color-neutral-100)] hover:text-[var(--color-danger)]"
                  >
                    <Trash2 size={16} strokeWidth={2} aria-hidden="true" />
                  </button>
                ) : null}
              </SurfaceCard>
            </li>
          ))}
        </ul>
      )}

      {adding ? (
        <AddStaffDialog societyId={societyId} onClose={() => setAdding(false)} onAdded={load} />
      ) : null}
    </PageShell>
  );
}
