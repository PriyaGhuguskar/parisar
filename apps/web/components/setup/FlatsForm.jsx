"use client";

import { bootstrapSocietyStructure, finalizeSocietySetup } from "@parisar/api-client";
import { X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useSetupState } from "../../lib/setup-state";
import { createSupabaseBrowserClient } from "../../lib/supabase/client";

/**
 * Step 3 — Flats form.
 *
 * Per-wing flat entry (individual chips + bulk range expander) + Secretary flat picker.
 * On submit:
 *   1. bootstrapSocietyStructure (batch-inserts wings + flats via RPC)
 *   2. finalizeSocietySetup (creates Secretary membership + refreshSession)
 *   → navigates to /setup/board
 */
export default function FlatsForm() {
  const { t } = useTranslation("auth");
  const router = useRouter();
  const setupStore = useSetupState();
  const wings = setupStore.wings ?? [];

  // flatsByWing: { [wingName]: string[] }
  const [flatsByWing, setFlatsByWing] = useState(() => {
    const initial = {};
    for (const wing of wings) initial[wing] = [];
    return initial;
  });

  // Per-wing input state
  const [inputByWing, setInputByWing] = useState(() => {
    const initial = {};
    for (const wing of wings) initial[wing] = "";
    return initial;
  });

  // Bulk range state per wing
  const [bulkByWing, setBulkByWing] = useState(() => {
    const initial = {};
    for (const wing of wings) initial[wing] = { open: false, from: "", to: "", preview: null };
    return initial;
  });

  // Secretary flat selection
  const [secretaryWing, setSecretaryWing] = useState("");
  const [secretaryFlat, setSecretaryFlat] = useState("");

  const [errors, setErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);

  // --- Flat management helpers ---

  function addFlat(wing) {
    const trimmed = (inputByWing[wing] ?? "").trim();
    if (!trimmed) return;
    setFlatsByWing((prev) => {
      const existing = prev[wing] ?? [];
      if (existing.includes(trimmed)) return prev;
      return { ...prev, [wing]: [...existing, trimmed] };
    });
    setInputByWing((prev) => ({ ...prev, [wing]: "" }));
  }

  function removeFlat(wing, flat) {
    setFlatsByWing((prev) => ({
      ...prev,
      [wing]: (prev[wing] ?? []).filter((f) => f !== flat),
    }));
    // If the removed flat was the secretary's selection, clear it
    if (secretaryWing === wing && secretaryFlat === flat) {
      setSecretaryFlat("");
    }
  }

  function handleFlatKeyDown(e, wing) {
    if (e.key === "Enter") {
      e.preventDefault();
      addFlat(wing);
    }
  }

  // --- Bulk range helpers ---

  function openBulk(wing) {
    setBulkByWing((prev) => ({
      ...prev,
      [wing]: { ...prev[wing], open: true, from: "", to: "", preview: null },
    }));
  }

  function updateBulk(wing, field, value) {
    setBulkByWing((prev) => ({
      ...prev,
      [wing]: { ...prev[wing], [field]: value, preview: null },
    }));
  }

  function previewBulk(wing) {
    const { from, to } = bulkByWing[wing] ?? {};
    const fromNum = parseInt(from, 10);
    const toNum = parseInt(to, 10);
    if (isNaN(fromNum) || isNaN(toNum) || fromNum > toNum) {
      setErrors((prev) => ({ ...prev, [`bulk_${wing}`]: "Enter a valid range (from ≤ to)." }));
      return;
    }
    const count = toNum - fromNum + 1;
    if (count > 50) {
      setErrors((prev) => ({
        ...prev,
        [`bulk_${wing}`]: "Maximum 50 flats per range. Please split into smaller ranges.",
      }));
      return;
    }
    setErrors((prev) => {
      const next = { ...prev };
      delete next[`bulk_${wing}`];
      return next;
    });
    const generated = [];
    for (let n = fromNum; n <= toNum; n++) generated.push(String(n));
    const previewStr = generated.slice(0, 3).join(", ") + (count > 3 ? ", …" : "");
    const previewMsg = t("setup.step3.bulkPreview")
      .replace("{{count}}", count)
      .replace("{{preview}}", previewStr);
    setBulkByWing((prev) => ({
      ...prev,
      [wing]: { ...prev[wing], preview: { generated, message: previewMsg } },
    }));
  }

  function confirmBulk(wing) {
    const { preview } = bulkByWing[wing] ?? {};
    if (!preview) return;
    setFlatsByWing((prev) => {
      const existing = new Set(prev[wing] ?? []);
      const toAdd = preview.generated.filter((f) => !existing.has(f));
      return { ...prev, [wing]: [...(prev[wing] ?? []), ...toAdd] };
    });
    setBulkByWing((prev) => ({
      ...prev,
      [wing]: { open: false, from: "", to: "", preview: null },
    }));
  }

  // --- Submit ---

  async function handleSubmit(e) {
    e.preventDefault();
    const errs = {};

    const totalFlats = Object.values(flatsByWing).reduce((sum, arr) => sum + arr.length, 0);
    if (totalFlats === 0) {
      errs.flats = "Please add at least one flat.";
    }
    if (!secretaryWing || !secretaryFlat) {
      errs.secretaryFlat = t("setup.step3.secretaryFlatRequired");
    }
    if (!setupStore.societyId) {
      errs.submit = "Society not found. Please go back to Step 1.";
    }

    setErrors(errs);
    if (Object.keys(errs).length > 0) return;

    setSubmitting(true);
    try {
      const supabase = createSupabaseBrowserClient();

      const wingsPayload = wings.map((name) => ({ name }));
      const flatsPayload = [];
      for (const [wingName, numbers] of Object.entries(flatsByWing)) {
        for (const n of numbers) {
          flatsPayload.push({ wing_name: wingName, number: n });
        }
      }

      const result = await bootstrapSocietyStructure(supabase, {
        societyId: setupStore.societyId,
        wings: wingsPayload,
        flats: flatsPayload,
      });

      // Find the secretary's flat from the bootstrap result
      const secretaryFlatObj = result.flats.find(
        (f) => f.wing_name === secretaryWing && f.number === secretaryFlat,
      );

      if (!secretaryFlatObj) {
        setErrors({ submit: "Could not locate your flat. Please try again." });
        return;
      }

      await finalizeSocietySetup(supabase, {
        societyId: setupStore.societyId,
        flatId: secretaryFlatObj.id,
      });

      setupStore.set({
        flats: result.flats,
        secretaryFlatId: secretaryFlatObj.id,
        wings: result.wings.map((w) => w.name),
      });

      router.push("/setup/board");
    } catch (err) {
      setErrors({ submit: t("auth.networkError") });
      console.error("[FlatsForm] submit error:", err);
    } finally {
      setSubmitting(false);
    }
  }

  // Flats available for secretary's selected wing
  const secretaryWingFlats = secretaryWing ? (flatsByWing[secretaryWing] ?? []) : [];

  return (
    <div className="bg-[var(--color-neutral-0)] rounded-2xl shadow-sm p-6 flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h2 className="text-xl font-semibold text-[var(--color-neutral-900)]">
          {t("setup.step3.title")}
        </h2>
        <p className="text-base text-[var(--color-neutral-600)]">{t("setup.step3.subtitle")}</p>
      </div>

      <form onSubmit={handleSubmit} className="flex flex-col gap-6">
        {/* Per-wing flat sections */}
        {wings.map((wing) => {
          const flats = flatsByWing[wing] ?? [];
          const bulk = bulkByWing[wing] ?? {};
          return (
            <div key={wing} className="flex flex-col gap-3">
              <h3 className="text-lg font-semibold text-[var(--color-neutral-900)]">Wing {wing}</h3>

              {/* Individual flat entry */}
              <div className="flex gap-2">
                <label htmlFor={`flat-number-${wing}`} className="sr-only">
                  {`Wing ${wing} — ${t("setup.step3.flatPlaceholder")}`}
                </label>
                <input
                  id={`flat-number-${wing}`}
                  type="text"
                  value={inputByWing[wing] ?? ""}
                  onChange={(e) => setInputByWing((prev) => ({ ...prev, [wing]: e.target.value }))}
                  onKeyDown={(e) => handleFlatKeyDown(e, wing)}
                  placeholder={t("setup.step3.flatPlaceholder")}
                  className="flex-1 h-10 px-3 rounded-lg border border-[var(--color-neutral-200)] bg-[var(--color-neutral-0)] text-base text-[var(--color-neutral-900)] placeholder:text-[var(--color-neutral-400)] outline-none focus:border-[var(--color-brand-700)] focus:ring-2 focus:ring-[var(--color-brand-700)]/20 transition-colors"
                />
                <button
                  type="button"
                  onClick={() => addFlat(wing)}
                  className="h-10 px-4 rounded-lg border border-[var(--color-brand-500)] text-[var(--color-brand-500)] text-sm font-medium hover:bg-[var(--color-brand-50,#f5f7ff)] transition-colors"
                >
                  Add
                </button>
              </div>

              {/* Flat chips */}
              {flats.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {flats.map((flat) => (
                    <span
                      key={flat}
                      className="flex items-center gap-1 px-3 py-1.5 rounded-full border border-[var(--color-neutral-200)] bg-[var(--color-neutral-100)] text-sm text-[var(--color-neutral-900)]"
                    >
                      {flat}
                      <button
                        type="button"
                        onClick={() => removeFlat(wing, flat)}
                        aria-label={`Remove flat ${flat}`}
                        className="p-1 hover:opacity-70 transition-opacity"
                      >
                        <X size={14} />
                      </button>
                    </span>
                  ))}
                </div>
              )}

              {/* Flat count */}
              {flats.length > 0 && (
                <p className="text-sm text-[var(--color-neutral-600)]">
                  {t("setup.step3.flatCount").replace("{{count}}", flats.length)}
                </p>
              )}

              {/* Bulk range toggle */}
              {!bulk.open && (
                <button
                  type="button"
                  onClick={() => openBulk(wing)}
                  className="self-start text-sm text-[var(--color-brand-500)] underline underline-offset-2"
                >
                  Add a range
                </button>
              )}

              {/* Bulk range expander */}
              {bulk.open && (
                <div className="flex flex-col gap-2 p-3 rounded-lg border border-[var(--color-neutral-200)] bg-[var(--color-neutral-50)]">
                  <div className="flex gap-2 items-center">
                    {/* PAR-063: wing-scoped ids so each bulk range input has its
                        own associated label (they repeat per wing). */}
                    <label htmlFor={`bulk-from-${wing}`} className="sr-only">
                      {`Wing ${wing} — flat number from`}
                    </label>
                    <input
                      id={`bulk-from-${wing}`}
                      type="number"
                      value={bulk.from}
                      onChange={(e) => updateBulk(wing, "from", e.target.value)}
                      placeholder="From"
                      className="w-24 h-9 px-2 rounded-lg border border-[var(--color-neutral-200)] text-base outline-none focus:border-[var(--color-brand-700)] transition-colors"
                    />
                    <span className="text-sm text-[var(--color-neutral-600)]">to</span>
                    <label htmlFor={`bulk-to-${wing}`} className="sr-only">
                      {`Wing ${wing} — flat number to`}
                    </label>
                    <input
                      id={`bulk-to-${wing}`}
                      type="number"
                      value={bulk.to}
                      onChange={(e) => updateBulk(wing, "to", e.target.value)}
                      placeholder="To"
                      className="w-24 h-9 px-2 rounded-lg border border-[var(--color-neutral-200)] text-base outline-none focus:border-[var(--color-brand-700)] transition-colors"
                    />
                    <button
                      type="button"
                      onClick={() => previewBulk(wing)}
                      className="h-9 px-3 rounded-lg border border-[var(--color-brand-500)] text-[var(--color-brand-500)] text-sm font-medium hover:bg-[var(--color-brand-50,#f5f7ff)] transition-colors"
                    >
                      Preview
                    </button>
                  </div>
                  {errors[`bulk_${wing}`] && (
                    <p className="text-sm text-[var(--color-danger-500)]">
                      {errors[`bulk_${wing}`]}
                    </p>
                  )}
                  {bulk.preview && (
                    <div className="flex flex-col gap-2">
                      <p className="text-sm text-[var(--color-neutral-700)]">
                        {bulk.preview.message}
                      </p>
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => confirmBulk(wing)}
                          className="h-8 px-3 rounded-lg bg-[var(--color-brand-500)] text-white text-sm font-medium hover:opacity-90 transition-opacity"
                        >
                          Confirm
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            setBulkByWing((prev) => ({
                              ...prev,
                              [wing]: { open: false, from: "", to: "", preview: null },
                            }))
                          }
                          className="h-8 px-3 rounded-lg border border-[var(--color-neutral-200)] text-sm text-[var(--color-neutral-600)] hover:bg-[var(--color-neutral-50)] transition-colors"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}

        {errors.flats && <p className="text-sm text-[var(--color-danger-500)]">{errors.flats}</p>}

        {/* Secretary flat selection */}
        <div className="flex flex-col gap-3 pt-2 border-t border-[var(--color-neutral-200)]">
          <div className="flex flex-col gap-1">
            <h3 className="text-lg font-semibold text-[var(--color-neutral-900)]">
              {t("setup.step3.secretaryFlatLabel")}
            </h3>
            <p className="text-sm text-[var(--color-neutral-600)]">
              {t("setup.step3.secretaryFlatHelper")}
            </p>
          </div>

          <div className="flex gap-3">
            {/* Wing selector */}
            <label htmlFor="secretary-wing" className="sr-only">
              Your wing
            </label>
            <select
              id="secretary-wing"
              value={secretaryWing}
              onChange={(e) => {
                setSecretaryWing(e.target.value);
                setSecretaryFlat("");
              }}
              className="flex-1 h-12 px-3 rounded-lg border border-[var(--color-neutral-200)] bg-[var(--color-neutral-0)] text-base text-[var(--color-neutral-900)] outline-none focus:border-[var(--color-brand-700)] transition-colors"
            >
              <option value="">Select wing</option>
              {wings.map((w) => (
                <option key={w} value={w}>
                  Wing {w}
                </option>
              ))}
            </select>

            {/* Flat selector */}
            <label htmlFor="secretary-flat" className="sr-only">
              Your flat
            </label>
            <select
              id="secretary-flat"
              value={secretaryFlat}
              onChange={(e) => setSecretaryFlat(e.target.value)}
              disabled={!secretaryWing || secretaryWingFlats.length === 0}
              className="flex-1 h-12 px-3 rounded-lg border border-[var(--color-neutral-200)] bg-[var(--color-neutral-0)] text-base text-[var(--color-neutral-900)] outline-none focus:border-[var(--color-brand-700)] transition-colors disabled:bg-[var(--color-neutral-100)] disabled:text-[var(--color-neutral-400)]"
            >
              <option value="">{secretaryWing ? "Select flat" : "Select a wing first"}</option>
              {secretaryWingFlats.map((f) => (
                <option key={f} value={f}>
                  {f}
                </option>
              ))}
            </select>
          </div>

          {errors.secretaryFlat && (
            <p className="text-sm text-[var(--color-danger-500)]">{errors.secretaryFlat}</p>
          )}
        </div>

        {errors.submit && <p className="text-sm text-[var(--color-danger-500)]">{errors.submit}</p>}

        {/* Navigation */}
        <div className="flex gap-3 pt-2">
          <button
            type="button"
            onClick={() => router.push("/setup/wings")}
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
