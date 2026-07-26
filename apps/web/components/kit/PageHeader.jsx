"use client";

// Page header: optional back link, eyebrow, title, description, actions.
//
// Titles were previously bare <h1>s with per-page sizing. This fixes the type
// scale, gives every screen the same optical spacing, and puts primary actions
// in one predictable place — top-right on desktop, stacked under the title on
// mobile so they never crowd the heading.

import { ArrowLeft } from "lucide-react";
import Link from "next/link";

export function PageHeader({ eyebrow, title, description, actions, backHref, backLabel }) {
  return (
    <header className="pk-in mb-6 flex flex-col gap-4 sm:mb-8 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0">
        {backHref ? (
          <Link
            href={backHref}
            className="pk-ul mb-3 inline-flex items-center gap-1.5 text-sm font-semibold text-[var(--color-brand-600)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-brand-500)] focus-visible:ring-offset-2 rounded"
          >
            <ArrowLeft size={15} strokeWidth={2.4} aria-hidden="true" />
            {backLabel}
          </Link>
        ) : null}
        {eyebrow ? (
          <p className="mb-1.5 text-[11px] font-bold uppercase tracking-[0.13em] text-[var(--color-brand-600)]">
            {eyebrow}
          </p>
        ) : null}
        <h1 className="text-[26px] font-extrabold leading-[1.15] tracking-[-0.025em] text-[var(--color-neutral-900)] sm:text-[30px]">
          {title}
        </h1>
        {description ? (
          <p className="mt-2 max-w-2xl text-[15px] leading-relaxed text-[var(--color-neutral-600)]">
            {description}
          </p>
        ) : null}
      </div>
      {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
    </header>
  );
}
