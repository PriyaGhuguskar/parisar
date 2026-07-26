"use client";

import { Baby, Building, Check, Star, Waves, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useSetupState } from "../../lib/setup-state";
import { createSupabaseBrowserClient } from "../../lib/supabase/client";

/**
 * Step 5 — Amenities form.
 *
 * 4 default amenity checkbox cards + custom chip-list input.
 * On submit: bulk INSERTs into amenities table → navigates to /setup/code.
 */

const DEFAULT_AMENITIES = [
  { key: "swimmingPool", icon: Waves },
  { key: "temple", icon: Star },
  { key: "kidsArea", icon: Baby },
  { key: "clubhouse", icon: Building },
];

export default function AmenitiesForm() {
  const { t } = useTranslation("auth");
  const router = useRouter();
  const setupStore = useSetupState();

  const [selected, setSelected] = useState(new Set());
  const [customInput, setCustomInput] = useState("");
  const [customChips, setCustomChips] = useState([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  function toggleDefault(key) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function addCustom() {
    const trimmed = customInput.trim();
    if (!trimmed) return;
    if (trimmed.length > 40) {
      setError("Amenity name must be 40 characters or fewer.");
      return;
    }
    if (customChips.includes(trimmed)) return;
    setCustomChips((prev) => [...prev, trimmed]);
    setCustomInput("");
    setError("");
  }

  function removeCustom(name) {
    setCustomChips((prev) => prev.filter((c) => c !== name));
  }

  function handleCustomKeyDown(e) {
    if (e.key === "Enter") {
      e.preventDefault();
      addCustom();
    }
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");

    if (!setupStore.societyId) {
      setError("Society not found. Please restart setup.");
      return;
    }

    setSubmitting(true);
    try {
      const supabase = createSupabaseBrowserClient();

      const allAmenities = [
        ...[...selected].map((key) => ({ name: t("amenity")[key] ?? key })),
        ...customChips.map((name) => ({ name })),
      ];

      if (allAmenities.length > 0) {
        const rows = allAmenities.map((a) => ({
          society_id: setupStore.societyId,
          name: a.name,
        }));

        const { error: insErr } = await supabase.from("amenities").insert(rows);
        if (insErr) {
          console.error("[AmenitiesForm] insert error:", insErr);
          // Non-blocking — continue to next step even if amenities insert fails
        }
      }

      setupStore.set({ amenities: allAmenities.map((a) => a.name) });
      router.push("/setup/code");
    } catch (err) {
      setError(t("auth.networkError"));
      console.error("[AmenitiesForm] submit error:", err);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="bg-[var(--color-neutral-0)] rounded-2xl shadow-sm p-6 flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h2 className="text-xl font-semibold text-[var(--color-neutral-900)]">
          {t("setup.step5.title")}
        </h2>
        <p className="text-base text-[var(--color-neutral-600)]">{t("setup.step5.subtitle")}</p>
      </div>

      <form onSubmit={handleSubmit} className="flex flex-col gap-6">
        {/* Default amenity cards — 2-column grid */}
        <div className="grid grid-cols-2 gap-4">
          {DEFAULT_AMENITIES.map(({ key, icon: Icon }) => {
            const isSelected = selected.has(key);
            return (
              <button
                key={key}
                type="button"
                onClick={() => toggleDefault(key)}
                className={[
                  "relative flex flex-col items-start gap-2 p-4 rounded-xl border-[1.5px] min-h-[80px] transition-all text-left",
                  isSelected
                    ? "border-[var(--color-brand-500)] bg-[var(--color-brand-50,#f5f7ff)]"
                    : "border-[var(--color-neutral-200)] bg-[var(--color-neutral-0)] hover:border-[var(--color-neutral-300)]",
                ].join(" ")}
              >
                {/* Selected check — top right */}
                {isSelected && (
                  <span className="absolute top-2 right-2">
                    <Check size={16} className="text-[var(--color-brand-500)]" />
                  </span>
                )}
                <Icon
                  size={24}
                  className={
                    isSelected ? "text-[var(--color-brand-500)]" : "text-[var(--color-neutral-600)]"
                  }
                />
                <span
                  className={[
                    "text-sm font-medium",
                    isSelected
                      ? "text-[var(--color-brand-500)]"
                      : "text-[var(--color-neutral-900)]",
                  ].join(" ")}
                >
                  {t("amenity")[key]}
                </span>
              </button>
            );
          })}
        </div>

        {/* Custom amenity input */}
        <div className="flex flex-col gap-2">
          <label htmlFor="setup-custom-amenity" className="text-sm text-[var(--color-neutral-600)]">
            Custom amenities
          </label>
          <div className="flex gap-2">
            <input
              id="setup-custom-amenity"
              type="text"
              value={customInput}
              onChange={(e) => setCustomInput(e.target.value)}
              onKeyDown={handleCustomKeyDown}
              placeholder={t("setup.step5.customPlaceholder")}
              maxLength={40}
              className="flex-1 h-10 px-3 rounded-lg border border-[var(--color-neutral-200)] bg-[var(--color-neutral-0)] text-base text-[var(--color-neutral-900)] placeholder:text-[var(--color-neutral-400)] outline-none focus:border-[var(--color-brand-700)] focus:ring-2 focus:ring-[var(--color-brand-700)]/20 transition-colors"
            />
            <button
              type="button"
              onClick={addCustom}
              className="h-10 px-4 rounded-lg border border-[var(--color-neutral-200)] text-[var(--color-neutral-600)] text-sm font-medium hover:bg-[var(--color-neutral-50)] transition-colors"
            >
              Add
            </button>
          </div>

          {/* Custom chips */}
          {customChips.length > 0 && (
            <div className="flex flex-wrap gap-2 mt-1">
              {customChips.map((chip) => (
                <span
                  key={chip}
                  className="flex items-center gap-1 px-3 py-1.5 rounded-full border border-[var(--color-neutral-200)] bg-[var(--color-neutral-100)] text-sm text-[var(--color-neutral-600)]"
                >
                  {chip}
                  <button
                    type="button"
                    onClick={() => removeCustom(chip)}
                    aria-label={`Remove ${chip}`}
                    className="p-1 hover:opacity-70 transition-opacity"
                  >
                    <X size={14} />
                  </button>
                </span>
              ))}
            </div>
          )}

          {error && <p className="text-sm text-[var(--color-danger-500)]">{error}</p>}
        </div>

        {/* Skip link */}
        <button
          type="button"
          onClick={() => router.push("/setup/code")}
          className="self-center text-sm text-[var(--color-brand-500)] underline underline-offset-2"
        >
          {t("setup.step5.skip")}
        </button>

        {/* Navigation */}
        <div className="flex gap-3 pt-2">
          <button
            type="button"
            onClick={() => router.push("/setup/board")}
            className="flex-1 h-12 rounded-xl border border-[var(--color-neutral-200)] text-[var(--color-neutral-900)] text-base font-medium hover:bg-[var(--color-neutral-50)] transition-colors"
          >
            Back
          </button>
          <button
            type="submit"
            disabled={submitting}
            className="flex-1 h-12 rounded-xl bg-[var(--color-brand-500)] text-white text-base font-semibold hover:opacity-90 transition-opacity disabled:opacity-50"
          >
            {submitting ? "Saving..." : "Save & Continue"}
          </button>
        </div>
      </form>
    </div>
  );
}
