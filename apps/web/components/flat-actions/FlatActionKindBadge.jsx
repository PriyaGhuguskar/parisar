"use client";

// FlatActionKindBadge — warning / fine / notify pill (web).
//
// Mirrors the Phase 4 StatusBadge token shape (rounded-full px-2 py-0.5 text-sm,
// label ALWAYS present so color is never the sole signal — a11y). Color map per
// 06-UI-SPEC §Flat-Action Kind Badge Colors:
//   warning → amber-50 bg / warning.500 text / 1px warning.500 / AlertTriangle
//   fine    → red-50   bg / danger.500  text / 1px danger.500  / AlertCircle
//   notify  → brand.50 bg / brand.500   text / 1px brand.500   / Bell
//
// Maps to FLAT_ACTION_KIND (warning/fine/notify).

import { AlertCircle, AlertTriangle, Bell } from "lucide-react";
import { useTranslation } from "react-i18next";

// Left-stripe accent color map (used by FlatActionCard, mirrors STATUS_ACCENT).
export const KIND_ACCENT = {
  warning: "#f59e0b",
  fine: "#c81e1e",
  notify: "#12715A",
};

/**
 * @param {{ kind: 'warning'|'fine'|'notify' }} props
 */
export function FlatActionKindBadge({ kind }) {
  const { t } = useTranslation("flat-actions");
  // PAR-001 fix: labels call t(), so this table is built inside the component
  // (was module-scope → "ReferenceError: t is not defined" on import).
  const KIND_STYLES = {
    warning: {
      className: "bg-[#fffbeb] text-[#b45309] border border-[#f59e0b]",
      Icon: AlertTriangle,
      label: t("flatAction.kindWarning"),
    },
    fine: {
      className: "bg-[#fef2f2] text-[#c81e1e] border border-[#c81e1e]",
      Icon: AlertCircle,
      label: t("flatAction.kindFine"),
    },
    notify: {
      className: "bg-[#f5f7ff] text-[#0E5A48] border border-[#12715A]",
      Icon: Bell,
      label: t("flatAction.kindNotify"),
    },
  };
  const style = KIND_STYLES[kind] ?? KIND_STYLES.notify;
  const { Icon, label, className } = style;
  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-sm font-normal whitespace-nowrap ${className}`}
      title={label}
    >
      <Icon size={14} aria-hidden="true" />
      {label}
    </span>
  );
}
