"use client";

// AuditLogRow — one moderation event in the audit log (web). UI-SPEC Screen 8 Tab 2.
// Mirrors the ResponseTrailItem attributed-entry shape (COMM-07 defensible trail).
//
// The row now reads as a TIMELINE entry rather than a table line: a toned icon
// well on the left (report=warning, takedown=danger, restore=brand) carries the
// event kind, the label is the strongest thing in the row, and the attribution
// ("By Rahul (B-203) · 14:20, 12 Jun") sits under it in muted body text.
//
// Tone is carried by colour AND icon — a colour-blind Secretary must still be
// able to tell a takedown from a restore when auditing a dispute.

import { format } from "date-fns";
import { Flag, RotateCcw, ShieldX } from "lucide-react";
import { useTranslation } from "react-i18next";
import { SurfaceCard } from "../kit";

// Society Green tokens only — warning / danger / success from the design system.
const EVENT_TONE = {
  report: { bg: "#FDF0DF", fg: "var(--color-warning)", Icon: Flag },
  takedown: { bg: "#FCE9E6", fg: "var(--color-danger)", Icon: ShieldX },
  restore: { bg: "var(--color-brand-50)", fg: "var(--color-brand-600)", Icon: RotateCcw },
};

function flatLabel(flatJoin) {
  if (!flatJoin) return "—";
  const wing = flatJoin?.wing?.name ?? "";
  const num = flatJoin?.number ?? "";
  return [wing, num].filter(Boolean).join("-") || "—";
}

function safeAt(iso) {
  if (!iso) return "";
  try {
    return format(new Date(iso), "HH:mm, dd MMM");
  } catch {
    return "";
  }
}

/**
 * @param {{ event: object }} props - moderation_events row + embedded actor
 */
export function AuditLogRow({ event }) {
  const { t } = useTranslation("moderation");
  // PAR-001 fix: labels call t(), so this table is built inside the component.
  const EVENT_LABEL = {
    report: t("moderation.eventReport"),
    takedown: t("moderation.eventTakedown"),
    restore: t("moderation.eventRestore"),
  };
  const kind = event?.event_kind ?? "report";
  const tone = EVENT_TONE[kind] ?? {
    bg: "var(--color-neutral-100)",
    fg: "var(--color-neutral-400)",
    Icon: Flag,
  };
  const ToneIcon = tone.Icon;
  const label = EVENT_LABEL[kind] ?? kind;

  const actorName = event?.actor?.full_name ?? "—";
  const actorFlat = flatLabel(event?.actor_flat);
  const byLine = t("moderation.eventBy")
    .replace("{{actor}}", actorName)
    .replace("{{flat}}", actorFlat)
    .replace("{{time}}", safeAt(event?.created_at));

  const targetKindLabel =
    event?.target_kind === "comment" ? t("moderation.kindComment") : t("moderation.kindPost");
  const targetLine = t("moderation.eventTarget")
    .replace("{{target}}", targetKindLabel)
    .replace("{{reason}}", event?.reason ?? "—");

  return (
    <SurfaceCard className="flex gap-3 p-4">
      <span
        aria-hidden="true"
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl"
        style={{ backgroundColor: tone.bg, color: tone.fg }}
      >
        <ToneIcon size={16} strokeWidth={2.2} />
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="text-[15px] font-bold tracking-[-0.01em] text-[var(--color-neutral-900)]">
          {label}
        </span>
        <span className="text-sm leading-relaxed text-[var(--color-neutral-600)]">{byLine}</span>
        <span className="text-[13px] leading-relaxed text-[var(--color-neutral-400)]">
          {targetLine}
        </span>
      </div>
    </SurfaceCard>
  );
}
