"use client";

// The standard content surface. `interactive` opts into the hover used across the
// product, so a card that responds always looks like one that can be clicked — and
// one that cannot, never moves.

export function SurfaceCard({
  children,
  className = "",
  interactive = false,
  as: Tag = "div",
  ...props
}) {
  return (
    <Tag
      {...props}
      className={`rounded-xl border border-border bg-card shadow-card ${
        interactive ? "focus-ring cursor-pointer transition-shadow hover:shadow-raised" : ""
      } ${className}`}
    >
      {children}
    </Tag>
  );
}
