"use client";

// AddWingDialog — secretary-only modal to add a wing to a live society.
//
// Flats are built floor by floor via the shared FloorFlats component: each
// floor has a From–To range (Floor 2 → 201..206) and the numbers between are
// generated. A blank floor makes no flats (a ground floor). "Add floor"
// continues the series. See lib/flats/floors.js for the generation rules.
//
// Calls addWing() (secretary_add_wing RPC), which enforces the secretary check,
// rejects duplicate wing names, and de-dupes flat numbers server-side.

import { addWing } from "@parisar/api-client";
import { X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { FloorFlats } from "@/components/structure/FloorFlats";
import { buildFlats, initialFloors } from "@/lib/flats/floors";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

const FIELD =
  "h-11 w-full rounded-xl border border-[var(--color-neutral-200)] bg-[var(--color-neutral-0)] px-3.5 text-[15px] text-[var(--color-neutral-900)] outline-none transition-[border-color,box-shadow] duration-150 focus:border-[var(--color-brand-500)] focus:shadow-[0_0_0_4px_color-mix(in_srgb,var(--color-brand-500)_16%,transparent)]";

const ERROR_KEY = {
  WING_EXISTS: "profile.wingExists",
  INVALID_WING_NAME: "profile.wingNameRequired",
};

export function AddWingDialog({ societyId, onClose }) {
  const { t } = useTranslation("auth");
  const router = useRouter();

  const [wingName, setWingName] = useState("");
  const [floors, setFloors] = useState(initialFloors);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  const { all: allFlats, anyInvalid } = buildFlats(floors);

  async function onSubmit(e) {
    e.preventDefault();
    const name = wingName.trim();
    if (!name) {
      setError(t("profile.wingNameRequired"));
      return;
    }
    if (anyInvalid) {
      setError(t("profile.rangeInvalid"));
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const supabase = createSupabaseBrowserClient();
      const res = await addWing(supabase, { societyId, wingName: name, flatNumbers: allFlats });
      if (res?.error) {
        setError(t(ERROR_KEY[res.error] ?? "profile.addWingError"));
        setSaving(false);
        return;
      }
      onClose();
      router.refresh();
    } catch {
      setError(t("profile.addWingError"));
      setSaving(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-[rgba(18,38,28,0.45)] p-0 sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-label={t("profile.addWingTitle")}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="flex max-h-[92vh] w-full max-w-lg flex-col rounded-t-[22px] bg-[var(--color-neutral-0)] sm:rounded-[22px]">
        {/* Header */}
        <div className="flex items-start justify-between gap-4 p-6 pb-4">
          <div>
            <h2 className="text-[20px] font-extrabold tracking-[-0.02em] text-[var(--color-neutral-900)]">
              {t("profile.addWingTitle")}
            </h2>
            <p className="mt-1 text-[14px] leading-relaxed text-[var(--color-neutral-600)]">
              {t("profile.addWingLead")}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={t("profile.cancel")}
            className="shrink-0 rounded-lg p-1.5 text-[var(--color-neutral-500)] hover:bg-[var(--color-neutral-100)]"
          >
            <X size={18} strokeWidth={2.2} aria-hidden="true" />
          </button>
        </div>

        {/* Scrollable body */}
        <form onSubmit={onSubmit} className="flex min-h-0 flex-1 flex-col">
          <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto px-6">
            <label className="flex flex-col gap-1.5">
              <span className="text-[13px] font-bold text-[var(--color-neutral-900)]">
                {t("profile.wingNameLabel")}
              </span>
              <input
                // biome-ignore lint/a11y/noAutofocus: first field of an explicitly-opened dialog
                autoFocus
                value={wingName}
                onChange={(e) => setWingName(e.target.value)}
                placeholder={t("profile.wingNamePlaceholder")}
                maxLength={40}
                className={FIELD}
              />
            </label>

            <FloorFlats floors={floors} onChange={setFloors} />
          </div>

          {/* Footer */}
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
                type="submit"
                disabled={saving || anyInvalid}
                className="rounded-xl bg-[var(--color-brand-600)] px-5 py-2.5 text-[14px] font-bold text-white transition-opacity hover:opacity-90 disabled:opacity-60"
              >
                {saving ? t("profile.saving") : t("profile.addWing")}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
