"use client";

// HiddenPendingBanner — the reporter's optimistic "Hidden, pending review" inline
// state (web). UI-SPEC Screen 7 concern (b). This is the ONE allowed client-side
// optimistic state: the reporter sees their just-reported item swap to this banner;
// everyone else loses the row via server-side auto-hide (D-03 — NOT client logic).
//
// role="alert" so the report outcome is announced (Phase 4 race-banner pattern).
//
// Visually this is a QUIET card, not an error — the report SUCCEEDED. It keeps the
// radius and footprint of the post it replaced so the feed does not jolt, and goes
// dashed + tinted to read as "temporarily not here" rather than "something broke".

import { Clock } from "lucide-react";
import { useTranslation } from "react-i18next";

export function HiddenPendingBanner() {
  const { t } = useTranslation("community");
  return (
    <div
      role="alert"
      className="pk-in flex items-center gap-3 rounded-[18px] border border-dashed border-[var(--color-neutral-200)] bg-[var(--color-neutral-100)] px-4 py-4"
    >
      <span
        aria-hidden="true"
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl"
        style={{
          backgroundColor: "var(--color-neutral-0)",
          color: "var(--color-neutral-400)",
        }}
      >
        <Clock size={18} strokeWidth={2} />
      </span>
      <p className="text-sm leading-relaxed text-[var(--color-neutral-600)]">
        {t("community.hiddenPending")}
      </p>
    </div>
  );
}
