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
    <header className="mb-6 flex flex-col gap-4 sm:mb-8 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0">
        {backHref ? (
          <Link
            href={backHref}
            // Shared back-link, so this one class governs the target size on
            // every screen that uses PageHeader. The text alone measured 62x20
            // — under the 24px WCAG 2.2 AA floor (2.5.8). Vertical padding plus
            // min-h-11 gives a thumb something to hit; the negative margins keep
            // the header's existing spacing and left alignment untouched.
            className="focus-ring type-body-sm -mx-2 mb-1 inline-flex min-h-11 items-center gap-1.5 rounded px-2 py-2 font-medium text-primary hover:underline"
          >
            <ArrowLeft size={15} strokeWidth={2.2} aria-hidden="true" />
            {backLabel}
          </Link>
        ) : null}
        {eyebrow ? (
          <p className="type-caption mb-1.5 font-semibold text-primary">{eyebrow}</p>
        ) : null}
        <h1 className="type-h1 text-foreground">{title}</h1>
        {description ? (
          <p className="type-body mt-1.5 max-w-2xl text-muted-foreground">{description}</p>
        ) : null}
      </div>
      {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
    </header>
  );
}
