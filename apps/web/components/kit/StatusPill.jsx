"use client";

// Status chip. Tone is carried by BOTH colour and a leading dot, because colour
// alone is not an accessible signal — a colour-blind board member still needs to
// tell "open" from "resolved" at a glance.

const TONES = {
  open: { bg: "#E7F0FB", fg: "#1F5FA0", dot: "#2F7DD1" },
  progress: { bg: "#FDF0DF", fg: "#8A4708", dot: "#D08A20" },
  done: {
    bg: "var(--color-brand-50)",
    fg: "var(--color-brand-700)",
    dot: "var(--color-brand-500)",
  },
  danger: { bg: "#FCE9E6", fg: "#94291A", dot: "var(--color-danger)" },
  neutral: {
    bg: "var(--color-neutral-100)",
    fg: "var(--color-neutral-600)",
    dot: "var(--color-neutral-400)",
  },
};

export function StatusPill({ tone = "neutral", children }) {
  const t = TONES[tone] ?? TONES.neutral;
  return (
    <span
      className="inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-[12px] font-bold"
      style={{ backgroundColor: t.bg, color: t.fg }}
    >
      <span
        aria-hidden="true"
        className="h-1.5 w-1.5 rounded-full"
        style={{ backgroundColor: t.dot }}
      />
      {children}
    </span>
  );
}
