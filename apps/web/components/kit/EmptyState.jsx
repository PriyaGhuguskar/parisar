"use client";

// Empty state: an invitation to act, not a dead end.
//
// Empty screens were previously a line of grey text. An empty list is the FIRST
// thing a new society sees on most screens, so it is a first-run experience, not
// an error — it names what goes here and offers the action that fills it.

export function EmptyState({ icon: Icon, title, description, action }) {
  return (
    <div className="pk-in flex flex-col items-center rounded-[18px] border border-dashed border-[var(--color-neutral-200)] bg-[var(--color-neutral-0)] px-6 py-14 text-center">
      {Icon ? (
        <span
          aria-hidden="true"
          className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl"
          style={{ backgroundColor: "var(--color-brand-50)", color: "var(--color-brand-600)" }}
        >
          <Icon size={24} strokeWidth={1.9} />
        </span>
      ) : null}
      <p className="text-[17px] font-bold tracking-[-0.01em] text-[var(--color-neutral-900)]">
        {title}
      </p>
      {description ? (
        <p className="mt-2 max-w-sm text-sm leading-relaxed text-[var(--color-neutral-600)]">
          {description}
        </p>
      ) : null}
      {action ? <div className="mt-6">{action}</div> : null}
    </div>
  );
}
