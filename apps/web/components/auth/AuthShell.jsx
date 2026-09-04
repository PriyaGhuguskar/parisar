"use client";

// Page wrapper for the unauthenticated auth screens (login, verify).
//
// COMPOSITION: 46/54 split — the panel is deliberately the SMALLER half. The
// form is the job; the artwork is the welcome, and an earlier version gave the
// welcome more room than the job while the form floated in a small white card
// surrounded by dead space.
//
// The card around the form is gone. A card inside a page-width column adds a
// second, redundant boundary and makes the form look smaller than it is; the
// form now sits directly on the ground with generous rhythm, which reads as more
// considered and gives the input room to be large enough to hit on a phone.
//
// The panel is desktop-only. On a phone it collapses to the wordmark so a
// resident on a mid-range Android reaches the input immediately.

import { ArrowLeft } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useTranslation } from "react-i18next";
import SocietyScene from "./SocietyScene";

function Wordmark({ onDark = false, size = "md" }) {
  const box = size === "md" ? "h-9 w-9" : "h-10 w-10";
  const text = size === "md" ? "text-[19px]" : "text-[22px]";
  return (
    <span className="flex items-center gap-2.5">
      <span
        className={`flex ${box} items-center justify-center rounded-[11px]`}
        style={{
          // No plate behind the mark — it carries its own gradient.
          color: "#fff",
        }}
      >
        <Image
          src="/parisar-mark-96.png"
          alt=""
          aria-hidden="true"
          width={40}
          height={40}
          className="h-full w-full object-contain"
        />
      </span>
      <span
        className={`${text} font-extrabold tracking-[-0.03em]`}
        style={{ color: onDark ? "#fff" : "var(--color-neutral-900)" }}
      >
        Parisar
      </span>
    </span>
  );
}

export default function AuthShell({ children }) {
  const { t } = useTranslation("auth");

  return (
    <div
      className="min-h-screen lg:grid lg:grid-cols-[46fr_54fr]"
      style={{ backgroundColor: "var(--color-neutral-50)" }}
    >
      {/* ---- signature panel (desktop only) ---- */}
      <aside className="hidden p-3 lg:block">
        <div
          className="relative flex h-full flex-col justify-between overflow-hidden rounded-[22px] p-9"
          style={{ backgroundColor: "#0B2018" }}
        >
          <SocietyScene className="pointer-events-none absolute inset-0 h-full w-full" />
          {/* Scrim only where type sits — the middle of the facade stays clear
              so the lit windows are not muddied. */}
          <span
            aria-hidden="true"
            className="pointer-events-none absolute inset-0"
            style={{
              background:
                "linear-gradient(180deg, rgba(8,24,18,.86) 0%, rgba(8,24,18,.10) 30%," +
                "rgba(8,24,18,.10) 52%, rgba(8,24,18,.90) 88%)",
            }}
          />

          <div className="relative flex items-start justify-between gap-4">
            <Wordmark onDark />
            <Link
              href="/"
              className="pk-press inline-flex items-center gap-1.5 rounded-full px-3.5 py-2 text-[13px] font-semibold text-white transition-colors hover:bg-white/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70"
              style={{ backgroundColor: "rgba(255,255,255,.12)" }}
            >
              <ArrowLeft size={14} strokeWidth={2.4} aria-hidden="true" />
              {t("auth.backToSite")}
            </Link>
          </div>

          <div className="relative max-w-sm">
            <p className="text-[27px] font-extrabold leading-[1.16] tracking-[-0.03em] text-white">
              {t("auth.panelHeadline")}
            </p>
            <p className="mt-3 text-[14px] leading-relaxed text-white/65">{t("auth.panelSub")}</p>
          </div>
        </div>
      </aside>

      {/* ---- form column: no card, just rhythm ---- */}
      <main className="flex min-h-screen items-center justify-center px-5 py-12 sm:px-10">
        <div className="flex w-full max-w-[380px] flex-col gap-7">
          <span className="flex justify-center lg:hidden">
            <Wordmark size="lg" />
          </span>
          {children}
        </div>
      </main>
    </div>
  );
}
