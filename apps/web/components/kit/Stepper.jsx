"use client";

// Multi-step progress. Phones get a compact "Step 2 of 5" line and a segmented bar;
// from md up, a full row of labelled steps. orientation="vertical" keeps the full list
// at every width, for a wizard's side rail.
//
//   <Stepper
//     steps={[{ id: "society", label: "Society" }, { id: "wings", label: "Wings" }]}
//     current={1}
//     onStepClick={(index, step) => goTo(step.id)}
//   />
//
// A step's state comes from `current`, or from step.status ("complete" | "current" |
// "upcoming" | "error") when progress is not linear. Only completed and errored steps
// become buttons, and only when onStepClick is passed.

import { AlertTriangle, Check } from "lucide-react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";

function stepState(step, index, current) {
  if (step.status) return step.status;
  if (index < current) return "complete";
  return index === current ? "current" : "upcoming";
}

const MARKER_CLASS = {
  complete: "border-primary bg-primary text-primary-foreground",
  current: "border-primary bg-card text-primary",
  upcoming: "border-input bg-card text-muted-foreground",
  error: "border-destructive bg-card text-destructive",
};

const STATE_LABEL_KEY = {
  complete: "stepper.completed",
  current: "stepper.current",
  upcoming: "stepper.upcoming",
  error: "stepper.error",
};

function StepMarker({ state, number }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "type-body-sm flex size-7 shrink-0 items-center justify-center rounded-full border font-semibold tabular-nums",
        MARKER_CLASS[state],
      )}
    >
      {state === "complete" ? <Check className="size-4" strokeWidth={2.5} /> : null}
      {state === "error" ? <AlertTriangle className="size-3.5" strokeWidth={2.5} /> : null}
      {state === "current" || state === "upcoming" ? number : null}
    </span>
  );
}

function StepItem({ step, index, state, onStepClick, showDescription, t }) {
  const clickable = Boolean(onStepClick) && (state === "complete" || state === "error");
  const content = (
    <>
      <StepMarker state={state} number={index + 1} />
      <span className="min-w-0 text-left">
        <span
          className={cn(
            "type-label block",
            state === "upcoming" ? "text-muted-foreground" : "text-foreground",
            state === "current" && "font-semibold",
          )}
        >
          {step.label}
        </span>
        {showDescription && step.description ? (
          <span className="type-caption block text-muted-foreground">{step.description}</span>
        ) : null}
        <span className="sr-only">{t(STATE_LABEL_KEY[state])}</span>
      </span>
    </>
  );
  const rowClass = "flex min-h-11 w-full items-center gap-2.5 py-1";
  if (!clickable) return <div className={rowClass}>{content}</div>;
  return (
    <button
      type="button"
      onClick={() => onStepClick(index, step)}
      className={cn(rowClass, "focus-ring cursor-pointer rounded-lg hover:opacity-80")}
    >
      {content}
    </button>
  );
}

function FullList({ steps, current, onStepClick, vertical, t }) {
  return (
    <ol className={cn("flex", vertical ? "flex-col gap-1" : "items-center gap-3")}>
      {steps.map((step, index) => {
        const state = stepState(step, index, current);
        const last = index === steps.length - 1;
        return (
          <li
            key={step.id}
            aria-current={state === "current" ? "step" : undefined}
            className={cn("flex min-w-0 items-center gap-3", !vertical && !last && "flex-1")}
          >
            <div className={cn("min-w-0", !vertical && "shrink-0")}>
              <StepItem
                step={step}
                index={index}
                state={state}
                onStepClick={onStepClick}
                showDescription={vertical}
                t={t}
              />
            </div>
            {!vertical && !last ? (
              <span
                aria-hidden="true"
                className={cn(
                  "h-px min-w-4 flex-1",
                  state === "complete" ? "bg-primary" : "bg-border",
                )}
              />
            ) : null}
          </li>
        );
      })}
    </ol>
  );
}

function CompactSummary({ steps, current, t }) {
  const index = Math.min(Math.max(current, 0), steps.length - 1);
  const step = steps[index];
  return (
    <div>
      <p className="type-caption text-muted-foreground">
        {t("stepper.stepOf", { current: index + 1, total: steps.length })}
      </p>
      <p aria-current="step" className="type-h3 mt-0.5 text-foreground">
        {step?.label}
      </p>
      <div aria-hidden="true" className="mt-2.5 flex gap-1">
        {steps.map((item, i) => {
          const state = stepState(item, i, current);
          const filled = state === "complete" || state === "current";
          return (
            <span
              key={item.id}
              className={cn(
                "h-1 flex-1 rounded-full",
                filled ? "bg-primary" : "bg-border",
                state === "error" && "bg-destructive",
              )}
            />
          );
        })}
      </div>
    </div>
  );
}

export function Stepper({
  steps = [],
  current = 0,
  onStepClick,
  orientation = "horizontal",
  label,
  className,
}) {
  const { t } = useTranslation("kit");
  const vertical = orientation === "vertical";
  if (steps.length === 0) return null;
  return (
    <nav aria-label={label ?? t("stepper.label")} className={className}>
      {vertical ? (
        <FullList steps={steps} current={current} onStepClick={onStepClick} vertical t={t} />
      ) : (
        <>
          <div className="md:hidden">
            <CompactSummary steps={steps} current={current} t={t} />
          </div>
          <div className="hidden md:block">
            <FullList steps={steps} current={current} onStepClick={onStepClick} t={t} />
          </div>
        </>
      )}
    </nav>
  );
}
