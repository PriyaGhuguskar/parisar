"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { WizardProgress } from "../../../components/setup/WizardProgress";
import { useSetupState } from "../../../lib/setup-state";
import { createSupabaseBrowserClient } from "../../../lib/supabase/client";

// Map URL segments to 1-indexed step numbers
const STEP_MAP = {
  society: 1,
  wings: 2,
  flats: 3,
  board: 4,
  amenities: 5,
  code: 6,
};

const STEP_LABELS = ["Society", "Wings", "Flats", "Board", "Amenities", "Code"];

/**
 * Shared layout for the 6-step Secretary setup wizard.
 * Renders a header with WizardProgress, then the current step page as children.
 *
 * Mount-time audit_log resume: if the Zustand store is empty AND
 * supabase has an audit_log row for 'society.created', repopulate
 * societyId from the audit_log so child pages can resume correctly.
 */
export default function SetupLayout({ children }) {
  const { t } = useTranslation("auth");
  const pathname = usePathname();

  // Derive step number from the last URL segment
  const segment = pathname ? pathname.split("/").pop() : "";
  const currentStep = STEP_MAP[segment] ?? 0;

  const setupStore = useSetupState();

  useEffect(() => {
    // Resume detection: if store is empty but the user has a society in audit_log,
    // load the societyId so layout children can detect where to resume.
    if (setupStore.societyId) return; // already populated

    async function attemptResume() {
      try {
        const supabase = createSupabaseBrowserClient();
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (!user) return;

        // Check audit_log for 'society.created' action by this user
        const { data: logRows } = await supabase
          .from("audit_log")
          .select("society_id")
          .eq("actor_id", user.id)
          .eq("action", "society.created")
          .order("created_at", { ascending: false })
          .limit(1);

        if (!logRows || logRows.length === 0) return;
        const societyId = logRows[0].society_id;
        if (!societyId) return;

        // Also fetch the society code so CodeShare has it
        const { data: codeRow } = await supabase
          .from("society_codes")
          .select("code")
          .eq("society_id", societyId)
          .is("revoked_at", null)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        setupStore.set({
          societyId,
          code: codeRow?.code ?? null,
        });
      } catch {
        // Non-critical — user can re-enter values
      }
    }

    attemptResume();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="min-h-screen bg-[var(--color-neutral-50)]">
      {/* Wizard header */}
      <header className="bg-[var(--color-neutral-0)] border-b border-[var(--color-neutral-200)] px-4 h-14 flex items-center">
        <span className="text-base font-semibold text-[var(--color-brand-500)]">
          {t("common.appName")}
        </span>
      </header>

      {/* Progress indicator — only shown on steps 1–6 */}
      {currentStep > 0 && (
        <div className="bg-[var(--color-neutral-0)] border-b border-[var(--color-neutral-200)]">
          <div className="max-w-[560px] mx-auto">
            <WizardProgress currentStep={currentStep} totalSteps={6} stepLabels={STEP_LABELS} />
          </div>
        </div>
      )}

      {/* Step content — max-width 560px, centred */}
      <main className="flex justify-center px-4 py-8">
        <div className="w-full max-w-[560px]">{children}</div>
      </main>
    </div>
  );
}
