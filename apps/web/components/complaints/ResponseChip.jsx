"use client";

// ResponseChip — predefined board-response outlined button (web).
//
// Visual contract per 04-UI-SPEC.md Screen 3 / ResponseChip spec:
//   - 1.5px border / rounded-xl / px-4 / min-h-[44px]
//   - default border + text: brand.500; hover bg brand.50
//   - "resolved" variant: border + text success.500; hover bg #ecfdf5
//   - "need_info" variant: border + text warning.500; hover bg #fffbeb
//   - Loading: spinner replaces label
//   - Disabled (another chip in-flight): opacity 0.4

import { Loader2 } from "lucide-react";
import { useTranslation } from "react-i18next";

const VARIANT_STYLES = {
  checking: {
    color: "#12715A",
    hoverBg: "hover:bg-[#f5f7ff]",
    labelKey: "response.checking",
  },
  will_resolve: {
    color: "#12715A",
    hoverBg: "hover:bg-[#f5f7ff]",
    labelKey: "response.willResolve",
  },
  need_info: {
    color: "#f59e0b",
    hoverBg: "hover:bg-[#fffbeb]",
    labelKey: "response.needInfo",
  },
  resolved: {
    color: "#047857",
    hoverBg: "hover:bg-[#ecfdf5]",
    labelKey: "response.resolved",
  },
};

/**
 * @param {{
 *   responseKind: 'checking'|'will_resolve'|'need_info'|'resolved',
 *   onClick: () => void,
 *   loading?: boolean,
 *   disabled?: boolean,
 * }} props
 */
export function ResponseChip({ responseKind, onClick, loading = false, disabled = false }) {
  const { t } = useTranslation("complaints");
  const styleVariant = VARIANT_STYLES[responseKind] ?? VARIANT_STYLES.checking;
  const variant = { ...styleVariant, label: t(styleVariant.labelKey) };
  const isInteractive = !loading && !disabled;

  return (
    <button
      type="button"
      onClick={isInteractive ? onClick : undefined}
      disabled={!isInteractive}
      aria-label={`Respond: ${variant.label}`}
      aria-busy={loading}
      className={`inline-flex flex-1 items-center justify-center rounded-xl px-4 min-h-[44px] text-sm font-semibold bg-white transition-colors ${variant.hoverBg} disabled:cursor-not-allowed`}
      style={{
        borderWidth: 1.5,
        borderColor: variant.color,
        color: variant.color,
        opacity: disabled && !loading ? 0.4 : 1,
      }}
    >
      {loading ? (
        <Loader2 size={16} className="animate-spin" aria-hidden="true" />
      ) : (
        <span className="text-center break-words">{variant.label}</span>
      )}
    </button>
  );
}
