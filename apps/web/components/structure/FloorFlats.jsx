"use client";

// FloorFlats — controlled floor-by-floor flat builder. The parent owns the
// `floors` array (see lib/flats/floors.js) and gets every edit via onChange;
// it derives the flat numbers with buildFlats(). Used by both the chairman's
// first-run setup and the Add-wing dialog so the two behave identically.
//
// showPreview toggles the chips panel — the dialog shows it; the multi-wing
// setup screen hides it per wing to stay compact.

import { Plus, Trash2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { buildFlats, nextFloor } from "@/lib/flats/floors";

const NUM =
  "h-10 w-full rounded-lg border border-[var(--color-neutral-200)] bg-[var(--color-neutral-0)] px-3 text-center text-[15px] font-semibold text-[var(--color-neutral-900)] outline-none focus:border-[var(--color-brand-500)]";

export function FloorFlats({ floors, onChange, showPreview = true }) {
  const { t } = useTranslation("auth");
  const { perFloor, all } = buildFlats(floors);

  const update = (id, patch) => onChange(floors.map((f) => (f.id === id ? { ...f, ...patch } : f)));
  const remove = (id) => onChange(floors.length > 1 ? floors.filter((f) => f.id !== id) : floors);
  const add = () => onChange([...floors, nextFloor(floors)]);

  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-[13px] font-bold text-[var(--color-neutral-900)]">
          {t("profile.floorsLabel")}
        </span>
        <span className="text-[12px] text-[var(--color-neutral-400)]">
          {t("profile.floorHint")}
        </span>
      </div>

      {floors.map((f) => {
        const row = perFloor.find((p) => p.id === f.id);
        return (
          <div
            key={f.id}
            className="rounded-xl border border-[var(--color-neutral-200)] bg-[var(--color-neutral-50)] p-3"
          >
            <div className="flex items-center gap-2">
              <span className="flex items-center gap-1.5 text-[13px] font-bold text-[var(--color-neutral-700)]">
                {t("profile.floorWord")}
                <input
                  value={f.level}
                  onChange={(e) =>
                    update(f.id, {
                      level: Number.parseInt(e.target.value.replace(/\D/g, ""), 10) || 0,
                    })
                  }
                  inputMode="numeric"
                  aria-label={t("profile.floorWord")}
                  className="h-8 w-12 rounded-md border border-[var(--color-neutral-200)] bg-[var(--color-neutral-0)] text-center text-[13px] font-bold outline-none focus:border-[var(--color-brand-500)]"
                />
              </span>
              <div className="flex flex-1 items-center gap-2">
                <input
                  value={f.from}
                  onChange={(e) => update(f.id, { from: e.target.value.replace(/\D/g, "") })}
                  inputMode="numeric"
                  placeholder={t("profile.fromLabel")}
                  aria-label={`${t("profile.floorWord")} ${f.level} — ${t("profile.fromLabel")}`}
                  className={NUM}
                />
                <span className="text-[var(--color-neutral-400)]">–</span>
                <input
                  value={f.to}
                  onChange={(e) => update(f.id, { to: e.target.value.replace(/\D/g, "") })}
                  inputMode="numeric"
                  placeholder={t("profile.toLabel")}
                  aria-label={`${t("profile.floorWord")} ${f.level} — ${t("profile.toLabel")}`}
                  className={NUM}
                />
              </div>
              <button
                type="button"
                onClick={() => remove(f.id)}
                disabled={floors.length === 1}
                aria-label={t("profile.removeFloor")}
                className="shrink-0 rounded-lg p-2 text-[var(--color-neutral-400)] hover:bg-[var(--color-neutral-100)] hover:text-[var(--color-danger)] disabled:opacity-40"
              >
                <Trash2 size={16} strokeWidth={2} aria-hidden="true" />
              </button>
            </div>
            <p className="mt-1.5 pl-1 text-[12px]">
              {row?.invalid ? (
                <span className="font-semibold text-[var(--color-danger)]">
                  {t("profile.rangeInvalid")}
                </span>
              ) : row?.numbers.length ? (
                <span className="text-[var(--color-neutral-500)]">
                  {row.numbers[0]}–{row.numbers[row.numbers.length - 1]} · {row.numbers.length}{" "}
                  {t("profile.flatsSuffix")}
                </span>
              ) : (
                <span className="text-[var(--color-neutral-400)]">{t("profile.floorEmpty")}</span>
              )}
            </p>
          </div>
        );
      })}

      <button
        type="button"
        onClick={add}
        className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-dashed border-[var(--color-brand-500)]/50 py-2.5 text-[14px] font-bold text-[var(--color-brand-600)] hover:bg-[var(--color-brand-50)]"
      >
        <Plus size={16} strokeWidth={2.5} aria-hidden="true" />
        {t("profile.addFloor")}
      </button>

      {showPreview ? (
        <div className="mt-1 flex flex-col gap-2">
          <div className="flex items-baseline justify-between">
            <span className="text-[13px] font-bold text-[var(--color-neutral-900)]">
              {t("profile.previewLabel")}
            </span>
            {all.length ? (
              <span className="text-[12px] font-semibold text-[var(--color-brand-600)]">
                {all.length} {t("profile.flatsSuffix")}
              </span>
            ) : null}
          </div>
          {all.length ? (
            <div className="flex flex-wrap gap-1.5 rounded-xl border border-[var(--color-neutral-200)] bg-[var(--color-neutral-50)] p-3">
              {all.map((n) => (
                <span
                  key={n}
                  className="inline-flex items-center rounded-md bg-[var(--color-neutral-0)] px-2 py-0.5 text-[12px] font-semibold text-[var(--color-neutral-700)] ring-1 ring-[var(--color-neutral-200)]"
                >
                  {n}
                </span>
              ))}
            </div>
          ) : (
            <p className="rounded-xl border border-dashed border-[var(--color-neutral-200)] px-3 py-4 text-[13px] text-[var(--color-neutral-400)]">
              {t("profile.previewEmpty")}
            </p>
          )}
        </div>
      ) : null}
    </div>
  );
}
