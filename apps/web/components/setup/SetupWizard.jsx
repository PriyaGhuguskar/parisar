"use client";

// /setup: the society authority's first-run wizard.
//
//   1 Society details (prefilled, read-only: Parisar registered them)
//   2 Wings   (name, code, number of floors; several at once)   required
//   3 Floors  (number, name, planned flat count, per wing)      required
//   4 Flats   (bulk generation by floor, then per-flat details)  required
//   5 Optional (amenities inline; staff, guards, authorities, residents
//     import offered as "Complete later" with links to their real screens)
//
// Every step reads and writes through the setup RPCs (docs/onboarding/API.md
// section 6). Progress lives on the server, so a closed tab resumes on the first
// unfinished step. A step is shown as done only after the server confirms it.

import { getSocietyRegistration, setupGetState } from "@parisar/api-client";
import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { ErrorState, LoadingState, PageHeader, PageShell, Stepper } from "@/components/kit";
import { callRpc } from "./lib/rpc";
import { errorText, resumeIndex, stepperSteps, WIZARD_STEPS } from "./lib/setupModel";
import { SetupDone } from "./SetupDone";
import { DetailsStep } from "./steps/DetailsStep";
import { FlatsStep } from "./steps/FlatsStep";
import { FloorsStep } from "./steps/FloorsStep";
import { OptionalStep } from "./steps/OptionalStep";
import { WingsStep } from "./steps/WingsStep";

const STEP_COMPONENTS = {
  details: DetailsStep,
  wings: WingsStep,
  floors: FloorsStep,
  flats: FlatsStep,
  optional: OptionalStep,
};

export function SetupWizard({ societyId }) {
  const { t } = useTranslation("setup-wizard");
  const [phase, setPhase] = useState("loading"); // loading | error | wizard | done
  const [loadError, setLoadError] = useState(null);
  const [state, setState] = useState(null);
  const [registration, setRegistration] = useState(null);
  const [index, setIndex] = useState(0);
  const [completion, setCompletion] = useState(null);
  const topRef = useRef(null);

  const load = useCallback(async () => {
    setPhase("loading");
    setLoadError(null);
    const [s, r] = await Promise.all([
      callRpc((sb) => setupGetState(sb, societyId)),
      callRpc((sb) => getSocietyRegistration(sb, societyId)),
    ]);
    if (s.error) {
      setLoadError(s.error);
      setPhase("error");
      return;
    }
    setState(s.data);
    setRegistration(r.error ? null : r.data);
    setIndex(resumeIndex(s.data));
    setPhase(s.data?.society?.setup_completed_at ? "done" : "wizard");
  }, [societyId]);

  useEffect(() => {
    load();
  }, [load]);

  /** Re-read progress after a write. Returns an error code, or null. */
  const reload = useCallback(async () => {
    const s = await callRpc((sb) => setupGetState(sb, societyId));
    if (s.error) return s.error;
    setState(s.data);
    return null;
  }, [societyId]);

  function goTo(next) {
    setIndex(Math.max(0, Math.min(WIZARD_STEPS.length - 1, next)));
    topRef.current?.focus();
    if (typeof window !== "undefined" && window.scrollTo) window.scrollTo({ top: 0 });
  }

  if (phase === "loading") {
    return (
      <PageShell>
        <LoadingState label={t("loading")} />
      </PageShell>
    );
  }

  if (phase === "error") {
    return (
      <PageShell>
        <ErrorState
          title={t("loadErrorTitle")}
          description={
            loadError === "NOT_SOCIETY_MANAGER" ? t("errors.NOT_SOCIETY_MANAGER") : t("loadError")
          }
          onRetry={loadError === "NOT_SOCIETY_MANAGER" ? undefined : load}
        />
      </PageShell>
    );
  }

  if (phase === "done") {
    return (
      <SetupDone
        societyId={societyId}
        state={state}
        completion={completion}
        onReview={() => {
          setCompletion(null);
          setPhase("wizard");
          goTo(1);
        }}
      />
    );
  }

  const labels = Object.fromEntries(WIZARD_STEPS.map((s) => [s.id, t(`steps.${s.id}`)]));
  const steps = stepperSteps(labels, state, index);
  const Step = STEP_COMPONENTS[WIZARD_STEPS[index].id];

  return (
    <PageShell>
      <div ref={topRef} tabIndex={-1} className="outline-none">
        <PageHeader
          title={t("title")}
          description={t("lead", { name: state?.society?.name ?? "" })}
        />
      </div>
      <Stepper
        steps={steps}
        current={index}
        onStepClick={(i) => goTo(i)}
        label={t("stepperLabel")}
        className="mb-8"
      />
      <Step
        key={WIZARD_STEPS[index].id}
        societyId={societyId}
        state={state}
        registration={registration}
        reload={reload}
        errorText={(code) => errorText(t, code)}
        onNext={() => goTo(index + 1)}
        onBack={index > 0 ? () => goTo(index - 1) : undefined}
        onCompleted={(result) => {
          setCompletion(result);
          reload();
          setPhase("done");
        }}
      />
    </PageShell>
  );
}
