"use client";

// Pricing — three tiers, middle one recommended.
//
// IMPORTANT DISTINCTION this section had to resolve: the product deliberately
// does NOT collect a society's maintenance or fines (no gateway, no settlement,
// no PCI scope). Introducing a subscription price contradicted four existing
// strings on the page ("No payments. On purpose.", "No payment details, ever",
// "free while we're in beta"). Those are now reconciled so the page tells one
// coherent story: the SOCIETY subscribes, RESIDENTS never pay, and Parisar never
// touches the society's own collections. The footnote states this explicitly,
// because "is my maintenance money going through this app?" is the first thing a
// treasurer will ask.

import { ArrowRight, Check } from "lucide-react";
import Link from "next/link";
import { useTranslation } from "react-i18next";

// Every tier starts the same way: request a call. There is no self-serve
// signup to link to, so pointing these at /login would dead-end a buyer.
const TIERS = [
  { id: 1, feats: 4, href: "/enroll", featured: false },
  { id: 2, feats: 5, href: "/enroll", featured: true },
  { id: 3, feats: 4, href: "/enroll", featured: false },
];

export function PricingPlans() {
  const { t } = useTranslation("auth");

  return (
    <div className="pk-stagger mt-12 grid items-start gap-5 lg:grid-cols-3">
      {TIERS.map(({ id, feats, href, featured }) => (
        <div
          key={id}
          className={`pk-tile relative flex flex-col rounded-[var(--pk-r-2xl)] border p-7 lg:p-8 ${
            featured ? "lg:-translate-y-3" : ""
          }`}
          style={{
            // The recommended tier is marked by weight and lift, not by colour
            // alone — colour on its own is not an accessible signal.
            borderColor: featured ? "var(--pk-primary)" : "var(--pk-rule)",
            borderWidth: featured ? 2 : 1,
            backgroundColor: "var(--pk-card)",
            boxShadow: featured ? "var(--pk-shadow-lg)" : "var(--pk-shadow-sm)",
          }}
        >
          {featured ? (
            <span
              className="absolute -top-3 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full px-3 py-1 text-[11px] font-bold"
              style={{ backgroundColor: "var(--pk-primary)", color: "var(--pk-on-primary)" }}
            >
              {t("landing.priceBadge")}
            </span>
          ) : null}

          <h3
            className="font-extrabold tracking-[-0.02em]"
            style={{ color: "var(--pk-ink)", fontSize: "var(--pk-text-xl)" }}
          >
            {t(`landing.pl${id}Name`)}
          </h3>
          <p className="mt-1" style={{ color: "var(--pk-muted)", fontSize: "var(--pk-text-sm)" }}>
            {t(`landing.pl${id}For`)}
          </p>

          <p className="mt-6 flex items-baseline gap-1.5">
            <span
              className="font-extrabold tracking-[-0.03em]"
              style={{ color: "var(--pk-ink)", fontSize: "var(--pk-text-3xl)" }}
            >
              {t(`landing.pl${id}Price`)}
            </span>
            {t(`landing.pl${id}Unit`) ? (
              <span style={{ color: "var(--pk-muted)", fontSize: "var(--pk-text-sm)" }}>
                {t(`landing.pl${id}Unit`)}
              </span>
            ) : null}
          </p>

          <ul className="mt-7 flex flex-1 flex-col gap-3">
            {Array.from({ length: feats }, (_, i) => i + 1).map((f) => (
              <li key={f} className="flex items-start gap-2.5">
                <span
                  aria-hidden="true"
                  className="mt-[3px] flex h-4 w-4 shrink-0 items-center justify-center rounded-full"
                  style={{ backgroundColor: "var(--pk-accent-soft)", color: "var(--pk-accent)" }}
                >
                  <Check size={10} strokeWidth={3.5} />
                </span>
                <span style={{ color: "var(--pk-body)", fontSize: "var(--pk-text-sm)" }}>
                  {t(`landing.pl${id}f${f}`)}
                </span>
              </li>
            ))}
          </ul>

          <Link
            href={href}
            className="pk-press pk-shine mt-8 inline-flex items-center justify-center gap-2 rounded-full border px-6 py-3 text-[14px] font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--pk-primary)] focus-visible:ring-offset-2"
            style={
              featured
                ? {
                    backgroundColor: "var(--pk-primary)",
                    color: "var(--pk-on-primary)",
                    borderColor: "var(--pk-primary)",
                    boxShadow: "var(--pk-shadow-primary)",
                  }
                : {
                    backgroundColor: "transparent",
                    color: "var(--pk-ink)",
                    borderColor: "var(--pk-rule)",
                  }
            }
          >
            {t(`landing.pl${id}Cta`)}
            <ArrowRight size={15} strokeWidth={2.4} aria-hidden="true" />
          </Link>
        </div>
      ))}
    </div>
  );
}
