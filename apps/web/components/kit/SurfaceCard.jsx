"use client";

// The standard content surface. `interactive` opts into the lift-and-glow hover
// used across the product, so a card that responds always looks like one that
// can be clicked — and one that cannot, never moves.

export function SurfaceCard({ children, className = "", interactive = false, as: Tag = "div" }) {
  return (
    <Tag
      className={`rounded-[18px] border border-[var(--color-neutral-200)] bg-[var(--color-neutral-0)] ${
        interactive ? "pk-tile cursor-pointer" : ""
      } ${className}`}
      style={{ boxShadow: "0 1px 2px rgba(18,38,28,.05)" }}
    >
      {children}
    </Tag>
  );
}
