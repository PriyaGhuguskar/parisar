"use client";

// Empty state: an invitation to act, not a dead end.
//
// Empty screens were previously a line of grey text. An empty list is the FIRST
// thing a new society sees on most screens, so it is a first-run experience, not
// an error — it names what goes here and offers the action that fills it.

export function EmptyState({ icon: Icon, title, description, action }) {
  return (
    <div className="flex flex-col items-center rounded-xl border border-dashed border-border bg-card px-6 py-12 text-center">
      {Icon ? (
        <span
          aria-hidden="true"
          className="mb-4 flex size-12 items-center justify-center rounded-xl bg-primary-soft text-primary-soft-foreground"
        >
          <Icon size={22} strokeWidth={1.9} />
        </span>
      ) : null}
      <p className="type-h3 text-foreground">{title}</p>
      {description ? (
        <p className="type-body mt-1.5 max-w-sm text-muted-foreground">{description}</p>
      ) : null}
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  );
}
