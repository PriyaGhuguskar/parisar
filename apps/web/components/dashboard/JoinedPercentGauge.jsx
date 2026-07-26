"use client";

import { fetchJoinPercent } from "@parisar/api-client";
import { CheckCircle2 } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { SurfaceCard } from "@/components/kit";
import { Progress, ProgressIndicator, ProgressTrack } from "@/components/ui/progress";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

/**
 * JoinedPercentGauge — polled join-% card for the Secretary onboarding dashboard.
 *
 * Props:
 *   societyId       {string}  the society to poll
 *   pollIntervalMs  {number}  poll interval in ms (default 30 000)
 */
export function JoinedPercentGauge({ societyId, pollIntervalMs = 30000 }) {
  const { t } = useTranslation("dashboard");
  const [percent, setPercent] = useState(null);

  useEffect(() => {
    let cancelled = false;
    const supabase = createSupabaseBrowserClient();

    async function load() {
      try {
        const p = await fetchJoinPercent(supabase, societyId);
        if (!cancelled) setPercent(p);
      } catch {
        // silent — keep prior value; log to Sentry in production
      }
    }

    load();
    const id = setInterval(load, pollIntervalMs);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [societyId, pollIntervalMs]);

  const complete = percent === 100;

  // The number leads and the bar supports it — same reading order as <StatCard>,
  // so this card scans identically to the rest of the dashboard.
  return (
    <SurfaceCard className="flex flex-col gap-3 p-6">
      <h3 className="text-[17px] font-extrabold tracking-[-0.02em] text-[var(--color-neutral-900)]">
        {complete ? t("joinedPercent.complete") : t("joinedPercent.heading")}
      </h3>

      {percent === null ? (
        /* Loading skeleton shimmer */
        <div
          className="h-3 w-full animate-pulse rounded-full bg-[var(--color-neutral-100)]"
          aria-live="polite"
          aria-label="Loading join percentage"
        />
      ) : (
        <>
          <div className="flex items-baseline gap-2">
            <span
              className="text-[30px] font-extrabold leading-none tracking-[-0.03em] tabular-nums"
              style={{
                color: complete ? "var(--color-success)" : "var(--color-brand-600)",
              }}
            >
              {percent}%
            </span>
            {complete && (
              <CheckCircle2 size={20} className="text-[var(--color-success)]" aria-hidden="true" />
            )}
          </div>

          {/* Custom-height progress bar */}
          <Progress value={percent} aria-valuenow={percent} aria-valuemin={0} aria-valuemax={100}>
            <ProgressTrack className="h-3 rounded-full bg-[var(--color-neutral-100)]">
              <ProgressIndicator
                className={complete ? "bg-[var(--color-success)]" : "bg-[var(--color-brand-500)]"}
              />
            </ProgressTrack>
          </Progress>
        </>
      )}
    </SurfaceCard>
  );
}
