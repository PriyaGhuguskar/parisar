"use client";

import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * WizardProgress — 6-step progress indicator for the Secretary setup wizard.
 *
 * Props:
 *   currentStep  {number}   1-indexed step the user is currently on
 *   totalSteps   {number}   total number of steps (default 6)
 *   stepLabels   {string[]} optional labels shown below each circle on wide viewports
 */
export function WizardProgress({ currentStep, totalSteps = 6, stepLabels = [] }) {
  const steps = Array.from({ length: totalSteps }, (_, i) => i + 1);

  return (
    <div className="flex w-full items-center p-4">
      {steps.map((step, idx) => {
        const isCompleted = step < currentStep;
        const isActive = step === currentStep;
        const state = isCompleted ? "completed" : isActive ? "active" : "inactive";

        const circleClass = cn(
          "flex h-7 w-7 items-center justify-center rounded-full text-sm font-semibold shrink-0",
          state === "inactive" && "bg-neutral-200 text-neutral-600",
          state === "active" && "bg-[var(--color-brand-500)] text-white",
          state === "completed" && "bg-[var(--color-success)] text-white",
        );

        return (
          <div key={step} className="flex flex-1 items-center">
            <div className="flex flex-col items-center gap-1 shrink-0">
              <div
                className={circleClass}
                role="img"
                aria-label={
                  `Step ${step}` +
                  (state === "completed" ? " completed" : state === "active" ? " current" : "")
                }
              >
                {isCompleted ? <Check size={14} /> : step}
              </div>
              {stepLabels[idx] && (
                <span className="hidden text-xs text-neutral-600 truncate md:block max-w-[56px]">
                  {stepLabels[idx]}
                </span>
              )}
            </div>
            {idx < totalSteps - 1 && (
              <div
                className={cn(
                  "h-0.5 flex-1 mx-1",
                  isCompleted ? "bg-[var(--color-success)]" : "bg-neutral-200",
                )}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}
