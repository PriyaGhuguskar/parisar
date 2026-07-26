"use client";

// Selectable role card for the onboard screen.
// Props: icon (Lucide component), title, description, selected, onSelect

export default function RoleCard({ icon: Icon, title, description, selected = false, onSelect }) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={[
        "w-full px-5 py-4 rounded-xl text-left transition-colors relative",
        "flex flex-col gap-3",
        selected
          ? "border-2 border-[var(--color-brand-500)] bg-[var(--color-brand-50)]"
          : "border border-[var(--color-neutral-200)] bg-[var(--color-neutral-0)] hover:border-[var(--color-neutral-400)]",
      ].join(" ")}
      aria-pressed={selected}
    >
      {/* Selection indicator — top-right filled/empty circle */}
      <span
        className={[
          "absolute top-4 right-4 w-4 h-4 rounded-full border-2 flex items-center justify-center",
          selected
            ? "border-[var(--color-brand-500)] bg-[var(--color-brand-500)]"
            : "border-[var(--color-neutral-200)] bg-transparent",
        ].join(" ")}
        aria-hidden="true"
      >
        {selected && <span className="w-1.5 h-1.5 rounded-full bg-[var(--color-neutral-0)]" />}
      </span>

      {/* Icon */}
      {Icon && <Icon size={24} className="text-[var(--color-brand-500)]" aria-hidden="true" />}

      {/* Text */}
      <div className="flex flex-col gap-1 pr-6">
        <span className="text-xl font-semibold text-[var(--color-neutral-900)] leading-tight">
          {title}
        </span>
        <span className="text-sm text-[var(--color-neutral-600)] leading-snug">{description}</span>
      </div>
    </button>
  );
}
