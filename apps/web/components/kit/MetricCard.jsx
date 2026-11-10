"use client";

// One number on a dashboard. Label first, then the value, so a row of them scans as a
// ledger; tone marks only the icon, so colour never carries the number's meaning alone.
//
//   <MetricCard label="Open requests" value={12} hint="3 need a call today" href="/admin" />
//
// `loading` shows a placeholder and `value={null}` an em dash. Never pass a made-up
// number while the real one is on its way.

import Link from "next/link";
import { cn } from "@/lib/utils";

const ICON_TONE = {
  brand: "bg-primary-soft text-primary-soft-foreground",
  success: "bg-status-success-bg text-status-success-fg",
  warning: "bg-status-warning-bg text-status-warning-fg",
  danger: "bg-status-danger-bg text-status-danger-fg",
  info: "bg-status-info-bg text-status-info-fg",
  neutral: "bg-status-neutral-bg text-status-neutral-fg",
};

export function MetricCard({
  label,
  value,
  hint,
  icon: Icon,
  tone = "neutral",
  href,
  loading = false,
  className,
}) {
  const classes = cn(
    "flex flex-col gap-2 rounded-xl border border-border bg-card p-4 shadow-card sm:p-5",
    href && "focus-ring transition-shadow hover:shadow-raised",
    className,
  );
  const body = (
    <>
      <div className="flex items-start justify-between gap-3">
        <p className="type-body-sm font-medium text-muted-foreground">{label}</p>
        {Icon ? (
          <span
            aria-hidden="true"
            className={cn(
              "flex size-8 shrink-0 items-center justify-center rounded-lg",
              ICON_TONE[tone] ?? ICON_TONE.neutral,
            )}
          >
            <Icon className="size-4" />
          </span>
        ) : null}
      </div>
      {loading ? (
        <span aria-hidden="true" className="h-8 w-20 animate-pulse rounded bg-muted" />
      ) : (
        <p className="type-metric text-foreground">{value ?? "—"}</p>
      )}
      {hint ? <p className="type-body-sm text-muted-foreground">{hint}</p> : null}
    </>
  );
  if (href) {
    return (
      <Link href={href} aria-busy={loading || undefined} className={classes}>
        {body}
      </Link>
    );
  }
  return (
    <div aria-busy={loading || undefined} className={classes}>
      {body}
    </div>
  );
}
