"use client";

import { normalizePhoneForCoSec } from "@parisar/api-client";
import { Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useSetupState } from "../../lib/setup-state";
import { createSupabaseBrowserClient } from "../../lib/supabase/client";

/**
 * Step 4 — Board Members form.
 *
 * IMPORTANT: Does NOT add a Co-Secretary placeholder row.
 * The Co-Secretary is auto-elevated server-side when they redeem the society code (Plan 01).
 *
 * Features:
 * - Info Alert at top explaining auto-elevation of co-sec
 * - Co-sec phone guard: if entered phone matches coSecPhone, shows warning + disables Add
 * - Looks up profiles.user_id by phone; skips unregistered phones with inline error
 * - Successful rows inserted into society_memberships with role='board_member', status='active'
 * - Skip link
 */
export default function BoardForm() {
  const { t } = useTranslation("auth");
  const router = useRouter();
  const setupStore = useSetupState();
  const wings = setupStore.wings ?? [];
  const flats = setupStore.flats ?? [];

  // Row form state
  const [rowName, setRowName] = useState("");
  const [rowWing, setRowWing] = useState("");
  const [rowFlat, setRowFlat] = useState("");
  const [rowPhone, setRowPhone] = useState("");
  const [rowError, setRowError] = useState("");
  const [coSecWarning, setCoSecWarning] = useState(false);

  // Added board members (local only — inserted on "Save & Continue")
  const [boardMembers, setBoardMembers] = useState([]);

  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");

  // Flats for the selected wing
  const wingFlats = rowWing
    ? flats.filter((f) => f.wing_name === rowWing).map((f) => f.number)
    : [];

  function handlePhoneChange(val) {
    setRowPhone(val);
    setRowError("");
    const normalized = normalizePhoneForCoSec(val);
    const coSecNorm = normalizePhoneForCoSec(setupStore.coSecPhone ?? "");
    setCoSecWarning(!!normalized && !!coSecNorm && normalized === coSecNorm);
  }

  function handleAddMember() {
    setRowError("");

    if (!rowName.trim() || rowName.trim().length < 2) {
      setRowError("Name must be at least 2 characters.");
      return;
    }
    if (!rowWing || !rowFlat) {
      setRowError("Please select a wing and flat.");
      return;
    }
    const normalizedPhone = normalizePhoneForCoSec(rowPhone);
    if (
      !normalizedPhone ||
      normalizedPhone.length !== 10 ||
      !/^[6-9]\d{9}$/.test(normalizedPhone)
    ) {
      setRowError("Please enter a valid 10-digit mobile number.");
      return;
    }
    if (coSecWarning) {
      setRowError(
        "This number is your Co-Secretary — they will be auto-elevated on join. Skip adding here.",
      );
      return;
    }
    // Check for duplicate phone in already-added members
    const isDuplicate = boardMembers.some(
      (m) => normalizePhoneForCoSec(m.phone) === normalizedPhone,
    );
    if (isDuplicate) {
      setRowError(t("setup.step4.duplicateMobile"));
      return;
    }

    setBoardMembers((prev) => [
      ...prev,
      {
        name: rowName.trim(),
        wing: rowWing,
        flat: rowFlat,
        phone: normalizedPhone,
      },
    ]);

    // Reset row fields
    setRowName("");
    setRowWing("");
    setRowFlat("");
    setRowPhone("");
    setCoSecWarning(false);
  }

  function removeMember(idx) {
    setBoardMembers((prev) => prev.filter((_, i) => i !== idx));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setSubmitError("");

    if (!setupStore.societyId) {
      setSubmitError("Society not found. Please restart setup.");
      return;
    }

    setSubmitting(true);
    try {
      const supabase = createSupabaseBrowserClient();
      // PAR-107: separate BENIGN skips (member not registered yet / flat not found
      // — an intentional, documented skip) from REAL insert failures. Previously
      // both were pooled and only surfaced when EVERY insert failed, so a partial
      // board setup was reported as success.
      const skipped = [];
      const failures = [];

      for (const member of boardMembers) {
        // Lookup user_id by phone (try both +91 prefix and bare)
        const { data: profile } = await supabase
          .from("profiles")
          .select("user_id")
          .or(`phone.eq.+91${member.phone},phone.eq.${member.phone}`)
          .maybeSingle();

        if (!profile) {
          skipped.push(`${member.name} (${member.phone}) is not yet registered — skipped.`);
          continue;
        }

        // Find flat_id from store
        const flatObj = flats.find((f) => f.wing_name === member.wing && f.number === member.flat);
        if (!flatObj) {
          skipped.push(`Flat ${member.flat} in Wing ${member.wing} not found — skipped.`);
          continue;
        }

        const { error: insErr } = await supabase.from("society_memberships").insert({
          society_id: setupStore.societyId,
          user_id: profile.user_id,
          flat_id: flatObj.id,
          role: "board_member",
          status: "active",
        });

        if (insErr) {
          // PAR-111: don't surface the raw PG error text to the user.
          failures.push(`Could not add ${member.name}.`);
        }
      }

      // Store board members in Zustand (informational)
      setupStore.set({ boardMembers });

      if (failures.length > 0) {
        // PAR-107: a REAL insert failure is not success — surface it and STAY on
        // this step so the Secretary can retry instead of silently continuing
        // with a partially-configured board.
        setSubmitError([...failures, ...skipped].join(" "));
        return;
      }

      if (skipped.length > 0) {
        // Benign, informational — the skip is the documented behaviour, so we
        // still advance the wizard.
        setSubmitError(skipped.join(" "));
      }

      router.push("/setup/amenities");
    } catch (err) {
      setSubmitError(t("auth.networkError"));
      console.error("[BoardForm] submit error:", err);
    } finally {
      setSubmitting(false);
    }
  }

  // Masked phone display: first 3 + XXXX + last 2
  function maskPhone(phone) {
    if (!phone || phone.length < 5) return phone;
    const p = String(phone);
    return p.slice(0, 3) + "XXXX" + p.slice(-2);
  }

  // Avatar initials (2 chars)
  function initials(name) {
    return name.trim().slice(0, 2).toUpperCase();
  }

  return (
    <div className="bg-[var(--color-neutral-0)] rounded-2xl shadow-sm p-6 flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h2 className="text-xl font-semibold text-[var(--color-neutral-900)]">
          {t("setup.step4.title")}
        </h2>
      </div>

      {/* Info Alert — Co-Sec auto-elevation explanation */}
      <div className="flex gap-3 p-4 rounded-xl bg-[var(--color-brand-50,#f5f7ff)] border border-[var(--color-brand-200,#c7d0ff)]">
        <div className="text-sm text-[var(--color-brand-700,#3730a3)] leading-relaxed flex-1">
          {t("setup.step4.subtitle")}{" "}
          <span className="block mt-1 text-[var(--color-brand-600,#4f46e5)]">
            The Co-Secretary is auto-elevated when they join via the Society Code — no need to add
            them here.
          </span>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="flex flex-col gap-6">
        {/* Add board member row */}
        <div className="flex flex-col gap-3 p-4 rounded-xl border border-[var(--color-neutral-200)]">
          <h3 className="text-sm font-medium text-[var(--color-neutral-700)]">
            Add a board member
          </h3>

          <div className="flex flex-col gap-3 sm:grid sm:grid-cols-2">
            {/* Name — PAR-063: every control needs an associated accessible name. */}
            <label htmlFor="board-member-name" className="sr-only">
              Full name
            </label>
            <input
              id="board-member-name"
              type="text"
              value={rowName}
              onChange={(e) => setRowName(e.target.value)}
              placeholder="Full name"
              maxLength={60}
              className="h-12 px-3 rounded-lg border border-[var(--color-neutral-200)] bg-[var(--color-neutral-0)] text-base text-[var(--color-neutral-900)] placeholder:text-[var(--color-neutral-400)] outline-none focus:border-[var(--color-brand-700)] transition-colors"
            />

            {/* Mobile */}
            <label htmlFor="board-member-phone" className="sr-only">
              Mobile number
            </label>
            <input
              id="board-member-phone"
              type="tel"
              value={rowPhone}
              onChange={(e) => handlePhoneChange(e.target.value)}
              placeholder="98765 43210"
              maxLength={10}
              inputMode="numeric"
              className={[
                "h-12 px-3 rounded-lg border text-base text-[var(--color-neutral-900)] placeholder:text-[var(--color-neutral-400)] outline-none transition-colors",
                coSecWarning
                  ? "border-[var(--color-warning-500,#f59e0b)] bg-amber-50"
                  : "border-[var(--color-neutral-200)] bg-[var(--color-neutral-0)] focus:border-[var(--color-brand-700)]",
              ].join(" ")}
            />

            {/* Wing selector */}
            <label htmlFor="board-member-wing" className="sr-only">
              Wing
            </label>
            <select
              id="board-member-wing"
              value={rowWing}
              onChange={(e) => {
                setRowWing(e.target.value);
                setRowFlat("");
              }}
              className="h-12 px-3 rounded-lg border border-[var(--color-neutral-200)] bg-[var(--color-neutral-0)] text-base text-[var(--color-neutral-900)] outline-none focus:border-[var(--color-brand-700)] transition-colors"
            >
              <option value="">Select wing</option>
              {wings.map((w) => (
                <option key={w} value={w}>
                  Wing {w}
                </option>
              ))}
            </select>

            {/* Flat selector */}
            <label htmlFor="board-member-flat" className="sr-only">
              Flat
            </label>
            <select
              id="board-member-flat"
              value={rowFlat}
              onChange={(e) => setRowFlat(e.target.value)}
              disabled={!rowWing || wingFlats.length === 0}
              className="h-12 px-3 rounded-lg border border-[var(--color-neutral-200)] bg-[var(--color-neutral-0)] text-base text-[var(--color-neutral-900)] outline-none focus:border-[var(--color-brand-700)] transition-colors disabled:bg-[var(--color-neutral-100)] disabled:text-[var(--color-neutral-400)]"
            >
              <option value="">{rowWing ? "Select flat" : "Select wing first"}</option>
              {wingFlats.map((f) => (
                <option key={f} value={f}>
                  {f}
                </option>
              ))}
            </select>
          </div>

          {/* Co-sec warning */}
          {coSecWarning && (
            <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
              This number is your Co-Secretary — they will be auto-elevated on join. No need to add
              them here.
            </p>
          )}

          {rowError && <p className="text-sm text-[var(--color-danger-500)]">{rowError}</p>}

          <button
            type="button"
            onClick={handleAddMember}
            disabled={coSecWarning}
            className="self-start h-10 px-4 rounded-lg border border-[var(--color-neutral-200)] text-[var(--color-neutral-900)] text-sm font-medium hover:bg-[var(--color-neutral-50)] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Add Member
          </button>
        </div>

        {/* Added board members list */}
        {boardMembers.length > 0 && (
          <div className="flex flex-col gap-2">
            {boardMembers.map((member, idx) => (
              <div
                key={idx}
                className="flex items-center gap-3 p-3 rounded-xl border border-[var(--color-neutral-200)]"
              >
                {/* Avatar */}
                <div className="w-9 h-9 rounded-full bg-[var(--color-brand-50,#f5f7ff)] flex items-center justify-center text-sm font-semibold text-[var(--color-brand-500)] shrink-0">
                  {initials(member.name)}
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <p className="text-base font-medium text-[var(--color-neutral-900)] truncate">
                    {member.name}
                  </p>
                  <p className="text-sm text-[var(--color-neutral-600)]">
                    Wing {member.wing} · {member.flat} · {maskPhone(member.phone)}
                  </p>
                </div>

                {/* Role chip */}
                <span className="shrink-0 text-xs px-2 py-1 rounded-full bg-[var(--color-neutral-100)] text-[var(--color-neutral-600)]">
                  Board Member
                </span>

                {/* Remove */}
                <button
                  type="button"
                  onClick={() => removeMember(idx)}
                  aria-label={`Remove ${member.name}`}
                  className="shrink-0 p-2 hover:opacity-70 transition-opacity text-[var(--color-danger-500)]"
                >
                  <Trash2 size={20} />
                </button>
              </div>
            ))}
          </div>
        )}

        {submitError && <p className="text-sm text-[var(--color-danger-500)]">{submitError}</p>}

        {/* Skip link */}
        <button
          type="button"
          onClick={() => router.push("/setup/amenities")}
          className="self-center text-sm text-[var(--color-brand-500)] underline underline-offset-2"
        >
          {t("setup.step4.skip")}
        </button>

        {/* Navigation */}
        <div className="flex gap-3 pt-2">
          <button
            type="button"
            onClick={() => router.push("/setup/flats")}
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
