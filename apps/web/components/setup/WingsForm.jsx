"use client";

import { X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useSetupState } from "../../lib/setup-state";

/**
 * Step 2 — Wings form.
 *
 * Chip list + "no wings" toggle.
 * On submit: updates Zustand store with wings array → navigates to /setup/flats.
 * NO DB writes — wings ride in store until Step 3 bootstrapSocietyStructure call.
 */
export default function WingsForm() {
  const { t } = useTranslation("auth");
  const router = useRouter();
  const setupStore = useSetupState();

  const [wings, setWings] = useState(setupStore.wings ?? []);
  const [inputValue, setInputValue] = useState("");
  const [noWings, setNoWings] = useState(false);
  const [error, setError] = useState("");

  function addWing() {
    const trimmed = inputValue.trim();
    if (!trimmed) return;
    if (trimmed.length > 20) {
      setError("Wing name must be 20 characters or fewer.");
      return;
    }
    const duplicate = wings.some((w) => w.toLowerCase() === trimmed.toLowerCase());
    if (duplicate) {
      setError(t("setup.step2.wingDuplicate").replace("{{name}}", trimmed));
      return;
    }
    setWings((prev) => [...prev, trimmed]);
    setInputValue("");
    setError("");
  }

  function removeWing(name) {
    setWings((prev) => prev.filter((w) => w !== name));
  }

  function handleKeyDown(e) {
    if (e.key === "Enter") {
      e.preventDefault();
      addWing();
    }
  }

  function handleSubmit(e) {
    e.preventDefault();
    setError("");

    if (!noWings && wings.length === 0) {
      setError(t("setup.step2.wingsRequired"));
      return;
    }

    const finalWings = noWings ? ["Main"] : wings;
    setupStore.set({ wings: finalWings });
    router.push("/setup/flats");
  }

  return (
    <div className="bg-[var(--color-neutral-0)] rounded-2xl shadow-sm p-6 flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h2 className="text-xl font-semibold text-[var(--color-neutral-900)]">
          {t("setup.step2.title")}
        </h2>
        <p className="text-base text-[var(--color-neutral-600)]">{t("setup.step2.subtitle")}</p>
      </div>

      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        {/* Wing input row */}
        {!noWings && (
          <div className="flex gap-2">
            {/* PAR-063: associated label (visually hidden — the placeholder alone
                is not an accessible name). */}
            <label htmlFor="setup-wing-name" className="sr-only">
              {t("setup.step2.wingPlaceholder")}
            </label>
            <input
              id="setup-wing-name"
              type="text"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={handleKeyDown}
              maxLength={20}
              placeholder={t("setup.step2.wingPlaceholder")}
              className="flex-1 h-10 px-3 rounded-lg border border-[var(--color-neutral-200)] bg-[var(--color-neutral-0)] text-base text-[var(--color-neutral-900)] placeholder:text-[var(--color-neutral-400)] outline-none focus:border-[var(--color-brand-700)] focus:ring-2 focus:ring-[var(--color-brand-700)]/20 transition-colors"
            />
            <button
              type="button"
              onClick={addWing}
              className="h-10 px-4 rounded-lg border border-[var(--color-brand-500)] text-[var(--color-brand-500)] text-sm font-medium hover:bg-[var(--color-brand-50,#f5f7ff)] transition-colors"
            >
              Add
            </button>
          </div>
        )}

        {/* Wing chips */}
        {!noWings && wings.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {wings.map((wing) => (
              <span
                key={wing}
                className="flex items-center gap-1 px-3 py-1.5 rounded-full border-[1.5px] border-[var(--color-brand-500)] bg-[var(--color-brand-50,#f5f7ff)] text-sm text-[var(--color-brand-500)]"
              >
                Wing {wing}
                <button
                  type="button"
                  onClick={() => removeWing(wing)}
                  aria-label={`Remove wing ${wing}`}
                  className="p-1 hover:opacity-70 transition-opacity"
                >
                  <X size={14} />
                </button>
              </span>
            ))}
          </div>
        )}

        {/* No wings toggle */}
        <label className="flex items-center gap-3 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={noWings}
            onChange={(e) => {
              setNoWings(e.target.checked);
              setError("");
            }}
            className="w-4 h-4 rounded accent-[var(--color-brand-500)]"
          />
          <span className="text-base text-[var(--color-neutral-700)]">
            {t("setup.step2.noWings")}
          </span>
        </label>

        {noWings && (
          <p className="text-sm text-[var(--color-neutral-600)]">
            All flats will be under one block.
          </p>
        )}

        {error && <p className="text-sm text-[var(--color-danger-500)]">{error}</p>}

        {/* Navigation */}
        <div className="flex gap-3 pt-2">
          <button
            type="button"
            onClick={() => router.push("/setup/society")}
            className="flex-1 h-12 rounded-xl border border-[var(--color-neutral-200)] text-[var(--color-neutral-900)] text-base font-medium hover:bg-[var(--color-neutral-50)] transition-colors"
          >
            Back
          </button>
          <button
            type="submit"
            className="flex-1 h-12 rounded-xl bg-[var(--color-brand-500)] text-white text-base font-semibold hover:opacity-90 transition-opacity"
          >
            Save &amp; Continue
          </button>
        </div>
      </form>
    </div>
  );
}
