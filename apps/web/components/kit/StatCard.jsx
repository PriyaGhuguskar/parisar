"use client";

// Summary tile. Puts the number before the label and encodes tone in the icon
// well, so a dashboard can be scanned rather than read. New dashboards should use
// MetricCard; this stays for the screens already built on it.

const TONE_CLASS = {
  brand: "bg-primary-soft text-primary-soft-foreground",
  warn: "bg-status-warning-bg text-status-warning-fg",
  danger: "bg-status-danger-bg text-status-danger-fg",
  neutral: "bg-status-neutral-bg text-status-neutral-fg",
};

export function StatCard({ icon: Icon, label, value, hint, tone = "brand", href }) {
  const Tag = href ? "a" : "div";
  return (
    <Tag
      {...(href ? { href } : {})}
      className={`block rounded-xl border border-border bg-card p-5 shadow-card ${
        href ? "focus-ring cursor-pointer transition-shadow hover:shadow-raised" : ""
      }`}
    >
      {Icon ? (
        <span
          aria-hidden="true"
          className={`mb-4 inline-flex h-10 w-10 items-center justify-center rounded-lg ${
            TONE_CLASS[tone] ?? TONE_CLASS.brand
          }`}
        >
          <Icon size={19} strokeWidth={2} />
        </span>
      ) : null}
      <p className="type-metric text-foreground">{value}</p>
      <p className="mt-2 text-sm font-medium text-foreground">{label}</p>
      {hint ? <p className="mt-1 text-xs text-muted-foreground">{hint}</p> : null}
    </Tag>
  );
}
