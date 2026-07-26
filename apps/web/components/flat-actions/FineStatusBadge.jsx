"use client";

// FineStatusBadge — outstanding / acknowledged / waived pill + the derived red
// `overdue` state (web). Mirrors StatusBadge token shape; consumes fine-overdue.js
// for the display-only overdue computation (D-04 / DD5 — never stored, never pushed).
//
// Color map per 06-UI-SPEC §Fine Status Badge Colors:
//   outstanding  → amber-50 / warning.500 / 1px warning.500
//   acknowledged → green-50 / success.500 / 1px success.500
//   waived       → neutral.100 / neutral.600 / no border
//   overdue      → red-50   / danger.500  / 1px danger.500  (outstanding && now>due)
//
// An acknowledged or waived fine is NEVER shown overdue.

import { useTranslation } from "react-i18next";
import { isOverdue } from "../../lib/fine-overdue";

const STATUS_STYLES = {
  outstanding: "bg-[#fffbeb] text-[#b45309] border border-[#f59e0b]",
  acknowledged: "bg-[#ecfdf5] text-[#047857] border border-[#047857]",
  waived: "bg-neutral-100 text-[#525252]",
  overdue: "bg-[#fef2f2] text-[#c81e1e] border border-[#c81e1e]",
};

/**
 * @param {{ fineStatus: 'outstanding'|'acknowledged'|'waived', dueDate?: string|null }} props
 */
export function FineStatusBadge({ fineStatus, dueDate = null }) {
  const { t } = useTranslation("flat-actions");
  // PAR-001 fix: labels call t(), so this table is built inside the component.
  const STATUS_LABELS = {
    outstanding: t("flatAction.statusOutstanding"),
    acknowledged: t("flatAction.statusAcknowledged"),
    waived: t("flatAction.statusWaived"),
    overdue: t("flatAction.statusOverdue"),
  };
  const overdue = isOverdue(fineStatus, dueDate);
  const key = overdue ? "overdue" : fineStatus;
  const classes = STATUS_STYLES[key] ?? STATUS_STYLES.outstanding;
  const label = STATUS_LABELS[key] ?? fineStatus;
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded-full text-sm font-normal whitespace-nowrap ${classes}`}
      title={label}
    >
      {label}
    </span>
  );
}
