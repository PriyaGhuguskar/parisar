"use client";

// StatusBadge — the single most important signal on every complaint surface.
//
// It is now a thin wrapper over the shared <StatusPill>, so a complaint status
// reads exactly like a booking or a notice status anywhere else in the product.
// StatusPill carries tone in BOTH colour and a leading dot, because colour alone
// is not an accessible signal — a colour-blind board member still needs to tell
// "open" from "resolved" at a glance.
//
// Status → tone map:
//   open         → open      (unclaimed, nobody acting yet)
//   checking     → progress  (a board member is looking)
//   will_resolve → progress  (committed, still in flight)
//   need_info    → danger    (blocked — the resident has to act)
//   resolved     → done
//
// checking and will_resolve deliberately share a tone: both are "in flight", and
// the label carries the distinction. Label text still comes from i18n
// `response.*` (or "Open" for the open status) — only the PRESENTATION changed.

import { useTranslation } from "react-i18next";
import { StatusPill } from "../kit";

const STATUS_TONE = {
  open: "open",
  checking: "progress",
  will_resolve: "progress",
  need_info: "danger",
  resolved: "done",
};

// DB enum → display label. Open has no response label; use a synthetic "Open".
function resolveLabel(status, t) {
  if (status === "open") return "Open";
  if (status === "checking") return t("response.checking");
  if (status === "will_resolve") return t("response.willResolve");
  if (status === "need_info") return t("response.needInfo");
  if (status === "resolved") return t("response.resolved");
  return status;
}

// Left-stripe accent colour map (used by ComplaintCard). Design-token values
// only, so the stripe tracks the palette instead of drifting away from it.
export const STATUS_ACCENT = {
  open: "var(--color-neutral-200)",
  checking: "var(--color-brand-500)",
  will_resolve: "var(--color-brand-500)",
  need_info: "var(--color-warning)",
  resolved: "var(--color-success)",
};

/**
 * @param {{ status: 'open'|'checking'|'will_resolve'|'need_info'|'resolved' }} props
 */
export function StatusBadge({ status }) {
  const { t } = useTranslation("complaints");
  const tone = STATUS_TONE[status] ?? "neutral";
  const label = resolveLabel(status, t);
  return (
    <span className="inline-flex" title={`Status: ${label}`}>
      <StatusPill tone={tone}>{label}</StatusPill>
    </span>
  );
}
