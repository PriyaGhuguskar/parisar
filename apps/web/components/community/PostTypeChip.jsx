"use client";

// PostTypeChip — sell / help / general pill (web). Mirrors the kit StatusPill
// token shape (rounded-full, bold 12px) so a post's type reads at the same
// weight as a complaint's status anywhere else in the product.
//
// Tone is carried by BOTH colour and a leading icon, because colour alone is not
// an accessible signal. Colours come from the Society Green tokens:
//   sell    → brand tint      (this is the neighbourly, on-brand default)
//   help    → warning tint    ("someone needs something")
//   general → neutral tint    (chatter, deliberately the quietest)

import { HelpCircle, MessageCircle, Tag } from "lucide-react";
import { useTranslation } from "react-i18next";

/**
 * @param {{ kind: 'sell'|'help'|'general' }} props
 */
export function PostTypeChip({ kind }) {
  const { t } = useTranslation("community");
  // PAR-001 fix: labels call t(), so this table is built inside the component.
  const TYPE_STYLES = {
    sell: {
      bg: "var(--color-brand-50)",
      fg: "var(--color-brand-700)",
      Icon: Tag,
      label: t("community.typeSell"),
    },
    help: {
      bg: "#FDF0DF",
      fg: "#8A4708",
      Icon: HelpCircle,
      label: t("community.typeHelp"),
    },
    general: {
      bg: "var(--color-neutral-100)",
      fg: "var(--color-neutral-600)",
      Icon: MessageCircle,
      label: t("community.typeGeneral"),
    },
  };
  const style = TYPE_STYLES[kind] ?? TYPE_STYLES.general;
  const { Icon, label, bg, fg } = style;
  return (
    <span
      className="inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-[12px] font-bold"
      style={{ backgroundColor: bg, color: fg }}
      title={label}
    >
      <Icon size={13} strokeWidth={2.4} aria-hidden="true" />
      {label}
    </span>
  );
}
