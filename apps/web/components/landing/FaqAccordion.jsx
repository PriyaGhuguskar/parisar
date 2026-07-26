"use client";

// FAQ accordion built on native <details>/<summary>.
//
// Deliberately NOT a JS-driven accordion: the native element already gives
// keyboard operation, correct screen-reader semantics (expanded/collapsed
// announced), open-by-URL-fragment, and in-page find that can reveal collapsed
// answers. A hand-rolled div+useState version reimplements all of that, usually
// worse, and ships JS to do it. The only custom behaviour here is the marker.

import { Plus } from "lucide-react";
import { useTranslation } from "react-i18next";

const ITEMS = [1, 2, 3, 4, 5];

export function FaqAccordion() {
  const { t } = useTranslation("auth");

  return (
    <div className="mx-auto mt-10 flex max-w-3xl flex-col gap-3">
      {ITEMS.map((n) => (
        <details
          key={n}
          className="group rounded-[var(--pk-r-lg)] border px-5 py-1 transition-colors"
          style={{
            borderColor: "var(--pk-rule)",
            backgroundColor: "var(--pk-card)",
          }}
        >
          <summary
            className="flex cursor-pointer list-none items-center justify-between gap-4 py-4 font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--pk-primary)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--pk-page)] [&::-webkit-details-marker]:hidden"
            style={{ color: "var(--pk-ink)", fontSize: "var(--pk-text-md)" }}
          >
            {t(`landing.faqQ${n}`)}
            <span
              aria-hidden="true"
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full transition-transform duration-200 group-open:rotate-45"
              style={{ backgroundColor: "var(--pk-primary-soft)", color: "var(--pk-primary)" }}
            >
              <Plus size={15} strokeWidth={2.4} />
            </span>
          </summary>
          {/* <details> cannot transition height, so the panel is a 0fr -> 1fr
              grid row (see .pk-acc). That animates smoothly and still collapses
              to genuinely zero height when closed. */}
          <div className="pk-acc">
            <div>
              <p
                className="pb-5 pr-11 leading-relaxed"
                style={{ color: "var(--pk-body)", fontSize: "var(--pk-text-sm)" }}
              >
                {t(`landing.faqA${n}`)}
              </p>
            </div>
          </div>
        </details>
      ))}
    </div>
  );
}
