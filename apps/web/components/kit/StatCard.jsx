"use client";

// Summary tile. Puts the number before the label and encodes tone in the icon
// well, so a dashboard can be scanned rather than read.

const TONES = {
  brand: { bg: "var(--color-brand-50)", fg: "var(--color-brand-600)" },
  warn: { bg: "#FDF0DF", fg: "var(--color-warning)" },
  danger: { bg: "#FCE9E6", fg: "var(--color-danger)" },
  neutral: { bg: "var(--color-neutral-100)", fg: "var(--color-neutral-600)" },
};

export function StatCard({ icon: Icon, label, value, hint, tone = "brand", href }) {
  const t = TONES[tone] ?? TONES.brand;
  const Tag = href ? "a" : "div";
  return (
    <Tag
      {...(href ? { href } : {})}
      className={`pk-tile block rounded-[18px] border border-[var(--color-neutral-200)] bg-[var(--color-neutral-0)] p-5 ${
        href ? "cursor-pointer" : ""
      }`}
      style={{ boxShadow: "0 1px 2px rgba(18,38,28,.05)" }}
    >
      {Icon ? (
        <span
          aria-hidden="true"
          className="pk-well mb-4 inline-flex h-10 w-10 items-center justify-center rounded-xl"
          style={{ backgroundColor: t.bg, color: t.fg }}
        >
          <Icon size={19} strokeWidth={2} />
        </span>
      ) : null}
      <p className="text-[30px] font-extrabold leading-none tracking-[-0.03em] text-[var(--color-neutral-900)] tabular-nums">
        {value}
      </p>
      <p className="mt-2 text-sm font-semibold text-[var(--color-neutral-900)]">{label}</p>
      {hint ? <p className="mt-1 text-xs text-[var(--color-neutral-400)]">{hint}</p> : null}
    </Tag>
  );
}
