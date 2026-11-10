"use client";

// The gate's numbers for today, from security_dashboard, in large tiles a guard
// can read and tap on a phone or a tablet at the gate. "New visitor" jumps to the
// entry form below. Reloads whenever `refreshKey` changes (the parent bumps it on
// every visitor_requests change it hears about).
//
// There is no pre-approved ("expected") visitor module and no check-in or
// check-out, so the tiles show what exists: requests waiting for a resident and
// requests a resident allowed in.
//
// JavaScript only — no TypeScript per CLAUDE.md.

import { securityDashboard } from "@parisar/api-client";
import { CheckCircle2, Clock, DoorOpen, Siren, UserPlus } from "lucide-react";
import { useCallback, useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { useReloadable } from "@/components/dashboard/useReloadable";
import { ErrorState } from "@/components/kit";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

const TONE = {
  neutral: "border-border bg-card text-foreground",
  warning: "border-status-warning-border bg-status-warning-bg text-status-warning-fg",
  success: "border-status-success-border bg-status-success-bg text-status-success-fg",
  danger: "border-status-danger-border bg-status-danger-bg text-status-danger-fg",
};

/** Tiles for a security_dashboard result. Exported for tests. */
export function securityTiles(data) {
  const d = data ?? {};
  return [
    { id: "today", value: d.todays_visitors, icon: DoorOpen, tone: "neutral" },
    {
      id: "waiting",
      value: d.pending,
      icon: Clock,
      tone: d.pending > 0 ? "warning" : "neutral",
    },
    { id: "allowed", value: d.approved, icon: CheckCircle2, tone: "success" },
    {
      id: "emergency",
      value: d.active_sos,
      icon: Siren,
      tone: d.active_sos > 0 ? "danger" : "neutral",
    },
  ];
}

/**
 * @param {{ societyId?: string|null, refreshKey?: number, onNewVisitor: () => void }} props
 */
export function SecurityOverview({ societyId = null, refreshKey = 0, onNewVisitor }) {
  const { t } = useTranslation("staff-nav");
  const load = useCallback(
    () => securityDashboard(createSupabaseBrowserClient(), societyId),
    [societyId],
  );
  const { status, data, reload } = useReloadable(undefined, load);
  const firstKey = useRef(refreshKey);

  useEffect(() => {
    if (refreshKey !== firstKey.current) reload();
  }, [refreshKey, reload]);

  const loading = status === "loading";

  return (
    <section aria-labelledby="gate-today-title" className="mb-6" data-testid="security-overview">
      <h2 id="gate-today-title" className="sr-only">
        {t("security.title")}
      </h2>

      <button
        type="button"
        onClick={onNewVisitor}
        className="focus-ring mb-4 flex min-h-16 w-full items-center justify-center gap-3 rounded-xl bg-primary px-5 text-[18px] font-semibold text-primary-foreground transition-colors hover:bg-primary-hover"
      >
        <UserPlus className="size-6" aria-hidden="true" />
        {t("security.newVisitor")}
      </button>

      {status === "error" ? (
        <ErrorState description={t("security.loadFailed")} onRetry={reload} />
      ) : (
        <ul className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {securityTiles(data).map(({ id, value, icon: Icon, tone }) => (
            <li
              key={id}
              className={cn(
                "flex min-h-28 flex-col justify-between rounded-xl border p-4",
                TONE[tone],
              )}
            >
              <span className="flex items-center gap-2 text-[15px] font-medium">
                <Icon className="size-5 shrink-0" aria-hidden="true" />
                {t(`security.tile.${id}`)}
              </span>
              {loading ? (
                <span aria-hidden="true" className="h-10 w-16 animate-pulse rounded bg-muted" />
              ) : (
                <span className="text-[40px] font-semibold leading-none tabular-nums">
                  {value ?? "—"}
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
