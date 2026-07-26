// apps/web/components/dashboard/SocietyHeaderPill.jsx
// Web mirror of apps/mobile/components/dashboard/SocietyHeaderPill.jsx
// (Phase 04.1 Wave 2, Plan 03, Task 1).
//
// Same behavior as the mobile pill (D-02):
//   - Renders "{societyName}" always.
//   - Appends " · {percent}% joined" once fetchJoinPercent resolves to a number.
//   - percent === 0 still renders " · 0% joined" (distinct from the null/hidden
//     state — a society with zero joiners is a real, glanceable signal).
//   - Silent fail: on fetch rejection OR when societyId is absent, the suffix is
//     hidden entirely (no skeleton, no spinner, no error UI). Joined-% is a
//     glanceable nicety, not a critical metric.
//   - Name is allowed to truncate; the joined-% suffix is flex-shrink-0 so it can
//     never be clipped (UI-SPEC §Typography Devanagari rule).
//
// JavaScript only — no TypeScript per CLAUDE.md.

"use client";

import { fetchJoinPercent } from "@parisar/api-client";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

/**
 * @param {object} props
 * @param {string|undefined} props.societyId
 * @param {string} [props.societyName]
 */
export function SocietyHeaderPill({ societyId, societyName = "Your Society" }) {
  const { t } = useTranslation("dashboard");
  const [percent, setPercent] = useState(null);

  useEffect(() => {
    if (!societyId) {
      setPercent(null);
      return;
    }
    let cancelled = false;
    const supabase = createSupabaseBrowserClient();
    fetchJoinPercent(supabase, societyId)
      .then((p) => {
        if (!cancelled) setPercent(typeof p === "number" ? p : null);
      })
      .catch(() => {
        if (!cancelled) setPercent(null);
      });
    return () => {
      cancelled = true;
    };
  }, [societyId]);

  const suffix =
    percent === null || percent === undefined
      ? ""
      : t("header.joinedPercent", { percent: String(percent) });

  // This pill IS the dashboard's page title, so it carries the same type scale
  // as <PageHeader>: 26/30px extra-bold, tight tracking. The joined-% suffix
  // stays visually subordinate (14px, muted) and shrink-0 so it can never be
  // clipped by a long Devanagari society name.
  return (
    <div className="pk-in flex min-w-0 items-baseline gap-1">
      <span className="min-w-0 flex-shrink truncate text-[26px] font-extrabold leading-[1.15] tracking-[-0.025em] text-[var(--color-neutral-900)] sm:text-[30px]">
        {societyName}
      </span>
      {suffix ? (
        <span className="flex-shrink-0 whitespace-nowrap text-[14px] font-medium text-[var(--color-neutral-400)]">
          {suffix}
        </span>
      ) : null}
    </div>
  );
}
