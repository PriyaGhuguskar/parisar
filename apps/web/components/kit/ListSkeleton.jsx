"use client";

// Loading placeholder shaped like the content it replaces, so the layout does
// not jump when data arrives. A centred spinner tells you nothing about what is
// coming; this tells you "a list of rows".

export function ListSkeleton({ rows = 4 }) {
  return (
    <div className="flex flex-col gap-3" aria-busy="true" aria-live="polite">
      <span className="sr-only">Loading…</span>
      {Array.from({ length: rows }, (_, i) => i).map((i) => (
        <div
          key={i}
          className="rounded-[18px] border border-[var(--color-neutral-200)] bg-[var(--color-neutral-0)] p-4"
        >
          <div className="flex items-center gap-3">
            <span className="h-10 w-10 shrink-0 animate-pulse rounded-xl bg-[var(--color-neutral-100)]" />
            <span className="flex-1">
              <span className="block h-3.5 w-1/2 animate-pulse rounded bg-[var(--color-neutral-100)]" />
              <span className="mt-2 block h-3 w-1/3 animate-pulse rounded bg-[var(--color-neutral-100)]" />
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}
