"use client";

// Status chip. Tone is carried by BOTH colour and a leading dot, because colour
// alone is not an accessible signal — a colour-blind board member still needs to
// tell "open" from "resolved" at a glance.
//
// For onboarding statuses use StatusBadge, which picks the tone and label for you.

const TONE_CLASS = {
  success: "bg-status-success-bg text-status-success-fg",
  warning: "bg-status-warning-bg text-status-warning-fg",
  danger: "bg-status-danger-bg text-status-danger-fg",
  info: "bg-status-info-bg text-status-info-fg",
  neutral: "bg-status-neutral-bg text-status-neutral-fg",
};

const DOT_CLASS = {
  success: "bg-status-success-solid",
  warning: "bg-status-warning-solid",
  danger: "bg-status-danger-solid",
  info: "bg-status-info-solid",
  neutral: "bg-status-neutral-solid",
};

// Older names, still used by existing screens.
const ALIASES = { open: "info", progress: "warning", done: "success" };

export function StatusPill({ tone = "neutral", children }) {
  const resolved = ALIASES[tone] ?? tone;
  const key = TONE_CLASS[resolved] ? resolved : "neutral";
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-[12px] font-semibold ${TONE_CLASS[key]}`}
    >
      <span aria-hidden="true" className={`h-1.5 w-1.5 rounded-full ${DOT_CLASS[key]}`} />
      {children}
    </span>
  );
}
