"use client";

// "A quick tour" — warm panel, live app on the left, three promises on the right.
//
// The reference design had a "Play the walkthrough" button. There is no
// walkthrough video in this project, and shipping a play button that opens
// nothing is worse than not having one — so the button scrolls to the live,
// tappable demo instead and is labelled for what it actually does. Swap it for a
// real player the moment a recording exists; the copy key is tourCta.
//
// The phone here IS the interactive demo, not a screenshot of one, so the three
// promises beside it can be checked on the spot rather than taken on trust.

import { Check, PlayCircle } from "lucide-react";
import { useTranslation } from "react-i18next";
import { PhoneDemo } from "./PhoneDemo";

export function QuickTour() {
  const { t } = useTranslation("auth");

  return (
    <div
      className="overflow-hidden rounded-[var(--pk-r-2xl)] border"
      style={{
        borderColor: "var(--pk-rule)",
        // Warm wash so the panel reads as a lit room rather than a plain card.
        background:
          "linear-gradient(135deg, var(--pk-primary-soft) 0%, var(--pk-tint) 46%, var(--pk-card) 100%)",
      }}
    >
      {/* p-4 on the smallest phones: at 320px the old p-7 (56px of horizontal
          padding) left too little room for the device mockup, which then
          refused to shrink and pushed the whole column off-screen. */}
      <div className="grid items-center gap-10 p-4 min-[400px]:p-6 sm:gap-12 sm:p-10 lg:grid-cols-[.85fr_1fr] lg:gap-14 lg:p-14">
        <div className="mx-auto w-full min-w-0 max-w-[320px]">
          <PhoneDemo />
        </div>

        <div>
          <span
            className="text-[12px] font-bold uppercase tracking-[0.12em]"
            style={{ color: "var(--pk-primary)" }}
          >
            {t("landing.tourEyebrow")}
          </span>
          <h2
            className="mt-4 font-extrabold leading-[1.12] tracking-[-0.025em]"
            style={{ color: "var(--pk-ink)", fontSize: "var(--pk-text-3xl)" }}
          >
            {t("landing.tourTitle")}
          </h2>
          <p
            className="mt-5 max-w-xl leading-relaxed"
            style={{ color: "var(--pk-body)", fontSize: "var(--pk-text-lg)" }}
          >
            {t("landing.tourBody")}
          </p>

          <ul className="mt-7 flex flex-col gap-3.5">
            {[1, 2, 3].map((n) => (
              <li key={n} className="flex items-center gap-3">
                <span
                  aria-hidden="true"
                  className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full"
                  style={{ backgroundColor: "var(--pk-primary)", color: "var(--pk-on-primary)" }}
                >
                  <Check size={13} strokeWidth={3} />
                </span>
                <span style={{ color: "var(--pk-ink)", fontSize: "var(--pk-text-md)" }}>
                  {t(`landing.tour${n}`)}
                </span>
              </li>
            ))}
          </ul>

          {/* Scrolls to the demo above rather than opening a video that does not
              exist. Native smooth scrolling honours prefers-reduced-motion. */}
          <a
            href="#tour-demo"
            className="pk-press pk-shine mt-8 inline-flex items-center gap-2 rounded-full px-7 py-3.5 text-[15px] font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
            style={{
              backgroundColor: "var(--pk-primary)",
              color: "var(--pk-on-primary)",
              boxShadow: "var(--pk-shadow-primary)",
            }}
          >
            <PlayCircle size={17} strokeWidth={2.2} aria-hidden="true" />
            {t("landing.tourCta")}
          </a>
        </div>
      </div>
    </div>
  );
}
