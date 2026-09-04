"use client";

// Public landing page for Parisar.
//
// DIRECTION — a light, spacious, high-trust page with one dark "product
// theatre" section. This deliberately replaces an earlier warm-cream + serif +
// terracotta version: that palette has become a default rather than a choice,
// and the brief asked for a modern 2026 SaaS register (Stripe/Linear/Notion).
//
// POSITIONING — Parisar is a SOCIETY app, not a complaints tool. Eight areas of
// society life ship today; the page leads with that breadth, the way MyGate
// leads with "everyday living" rather than any single workflow.
//
// SIGNATURE — <PhoneDemo />: the app's home screen rebuilt in CSS with tabs you
// can actually press, localised from the same keys as the product. Competitors
// use static screenshots; a screenshot cannot switch language, and language is
// the thing an Indian society most needs to see working.
//
// DESIGN SYSTEM — every colour, space, size, radius, shadow and easing is a
// --pk-* token in globals.css. Nothing hardcoded here, which is what makes dark
// mode one media query instead of a rewrite. All pairs verified >= WCAG AA in
// both modes.
//
// TYPE — Manrope for Latin, with Noto Sans Devanagari in the same stack so
// हिन्दी/मराठी conjuncts render correctly. A Latin-only display face would
// break two of three launch languages.

import {
  ArrowRight,
  BookUser,
  CalendarCheck,
  Check,
  FileWarning,
  HeartHandshake,
  House,
  Megaphone,
  MessagesSquare,
  ShieldCheck,
  Vote,
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useTranslation } from "react-i18next";
import { FaqAccordion } from "./FaqAccordion";
import { HeroCollage } from "./HeroCollage";
import { PricingPlans } from "./PricingPlans";
import { QuickTour } from "./QuickTour";
import { RoleWalkthrough } from "./RoleWalkthrough";

const SHELL = "mx-auto w-full max-w-6xl px-5 sm:px-6";
const SECTION = "py-20 lg:py-28";

function Eyebrow({ children, onDark }) {
  return (
    <span
      className="inline-flex items-center rounded-full px-3 py-1 text-[12px] font-semibold tracking-[0.02em]"
      style={{
        backgroundColor: onDark ? "rgba(255,255,255,.08)" : "var(--pk-primary-soft)",
        color: onDark ? "var(--pk-on-dark-body)" : "var(--pk-primary)",
      }}
    >
      {children}
    </span>
  );
}

function H2({ children, onDark, className = "" }) {
  return (
    <h2
      className={`font-extrabold leading-[1.12] tracking-[-0.025em] ${className}`}
      style={{
        color: onDark ? "var(--pk-on-dark)" : "var(--pk-ink)",
        fontSize: "var(--pk-text-3xl)",
      }}
    >
      {children}
    </h2>
  );
}

function PrimaryCta({ href, children, className = "" }) {
  return (
    <Link
      href={href}
      className={`pk-press pk-shine group inline-flex h-13 items-center gap-2 rounded-full px-7 py-3.5 text-[15px] font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 ${className}`}
      style={{
        backgroundColor: "var(--pk-primary)",
        color: "var(--pk-on-primary)",
        boxShadow: "var(--pk-shadow-primary)",
        outlineColor: "var(--pk-primary)",
      }}
    >
      {children}
      <ArrowRight
        size={16}
        strokeWidth={2.4}
        aria-hidden="true"
        className="transition-transform duration-200 group-hover:translate-x-0.5"
      />
    </Link>
  );
}

function GhostCta({ href, children }) {
  return (
    <Link
      href={href}
      className="pk-press inline-flex items-center rounded-full border px-7 py-3.5 text-[15px] font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--pk-primary)]"
      style={{
        borderColor: "var(--pk-rule)",
        color: "var(--pk-ink)",
        backgroundColor: "var(--pk-card)",
      }}
    >
      {children}
    </Link>
  );
}

/** Wordmark. The brand mark is deliberately typographic for now. */
function Wordmark({ onDark }) {
  return (
    // shrink-0 + nowrap: at 280px (Galaxy Fold outer screen) the brand was
    // breaking mid-word into "Parisa / r" because the global min-width:0 lets
    // flex children shrink. A brand name is the one string that must never wrap.
    <span className="flex shrink-0 items-center gap-2.5">
      {/* The real mark, not a generic building glyph. It carries its own shape
          and gradient, so it is placed bare rather than inside a green tile —
          a coloured plate behind it would fight its own palette. */}
      {/* 40px, not 36. The mark carries real interior detail — buildings, a
          tree, figures, a speech bubble — and below about 40px those collapse
          into an indistinct blob. The nav is 72px tall, so it can afford it. */}
      <Image
        src="/parisar-mark-96.png"
        alt=""
        aria-hidden="true"
        width={40}
        height={40}
        priority
        className="h-10 w-10 shrink-0 object-contain"
      />
      {/* Below 360px (Galaxy Fold, older budget Androids) the logotype is
          dropped and the mark carries the brand alone — otherwise it and the
          CTA fight for the same 280px and both lose. */}
      <span
        className="hidden whitespace-nowrap text-[20px] font-extrabold tracking-[-0.03em] min-[360px]:inline"
        style={{ color: onDark ? "var(--pk-on-dark)" : "var(--pk-ink)" }}
      >
        Parisar
      </span>
    </span>
  );
}

/** Bento tile. `wide` spans two columns on large screens. */
function Feature({ icon: Icon, title, body, wide }) {
  return (
    <div
      className={`pk-tile rounded-[var(--pk-r-xl)] border p-6 lg:p-7 ${wide ? "lg:col-span-2" : ""}`}
      style={{
        borderColor: "var(--pk-rule)",
        backgroundColor: "var(--pk-card)",
        boxShadow: "var(--pk-shadow-sm)",
      }}
    >
      <span
        aria-hidden="true"
        className="pk-well inline-flex h-11 w-11 items-center justify-center rounded-[var(--pk-r-md)]"
        style={{ backgroundColor: "var(--pk-primary-soft)", color: "var(--pk-primary)" }}
      >
        <Icon size={20} strokeWidth={2} />
      </span>
      <h3
        className="mt-5 font-bold tracking-[-0.01em]"
        style={{ color: "var(--pk-ink)", fontSize: "var(--pk-text-lg)" }}
      >
        {title}
      </h3>
      <p
        className="mt-2 leading-relaxed"
        style={{ color: "var(--pk-body)", fontSize: "var(--pk-text-sm)" }}
      >
        {body}
      </p>
    </div>
  );
}

function RoleCard({ icon: Icon, title, body, points }) {
  return (
    <div
      className="pk-tile rounded-[var(--pk-r-2xl)] border p-7 lg:p-9"
      style={{
        borderColor: "var(--pk-rule)",
        backgroundColor: "var(--pk-card)",
        boxShadow: "var(--pk-shadow-sm)",
      }}
    >
      <span
        aria-hidden="true"
        className="inline-flex h-12 w-12 items-center justify-center rounded-[var(--pk-r-lg)]"
        style={{ backgroundColor: "var(--pk-primary-soft)", color: "var(--pk-primary)" }}
      >
        <Icon size={22} strokeWidth={2} />
      </span>
      <h3
        className="mt-5 font-extrabold tracking-[-0.02em]"
        style={{ color: "var(--pk-ink)", fontSize: "var(--pk-text-2xl)" }}
      >
        {title}
      </h3>
      <p
        className="mt-3 leading-relaxed"
        style={{ color: "var(--pk-body)", fontSize: "var(--pk-text-md)" }}
      >
        {body}
      </p>
      <ul className="mt-6 flex flex-col gap-3">
        {points.map((p) => (
          <li key={p} className="flex items-start gap-3">
            <span
              aria-hidden="true"
              className="mt-[3px] flex h-5 w-5 shrink-0 items-center justify-center rounded-full"
              style={{ backgroundColor: "var(--pk-primary-soft)", color: "var(--pk-primary)" }}
            >
              <Check size={12} strokeWidth={3} />
            </span>
            <span style={{ color: "var(--pk-body)", fontSize: "var(--pk-text-sm)" }}>{p}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * @param {{ isSignedIn?: boolean }} props
 *   When a session exists the page still renders (see app/page.jsx) — only the
 *   call-to-action changes, so a signed-in visitor can read the page AND get
 *   back into the app in one click.
 */
export function LandingPage({ isSignedIn = false }) {
  const { t } = useTranslation("auth");

  // The page BODY always sells, signed in or not — a landing page does not
  // stop being a landing page because the reader has a session, and swapping
  // both CTAs to "Go to dashboard" left two identical buttons side by side.
  // Only the NAV adapts (see the header): that is where an existing user
  // needs a way back into the app.
  //
  // Nobody self-creates a society any more — the admin team does, after a
  // call — so the primary action is to start that conversation.

  // Bento: the two broadest areas get double-width tiles.
  const features = [
    { icon: Megaphone, n: 1, wide: true },
    { icon: MessagesSquare, n: 2 },
    { icon: FileWarning, n: 3 },
    { icon: HeartHandshake, n: 4 },
    { icon: CalendarCheck, n: 5 },
    { icon: ShieldCheck, n: 6 },
    { icon: Vote, n: 7 },
    { icon: BookUser, n: 8, wide: true },
  ];

  return (
    <div style={{ backgroundColor: "var(--pk-page)" }} className="pk-page min-h-screen">
      {/* Scroll progress rail — driven by the document scroll timeline, no JS. */}
      <span className="pk-progress" aria-hidden="true" />
      {/* ---------------- sticky nav ---------------- */}
      <header className="pk-nav border-b" style={{ borderColor: "var(--pk-rule)" }}>
        <div className={`${SHELL} flex h-[72px] items-center justify-between`}>
          <Wordmark />
          {/* The enrol CTA is ALWAYS present. Hiding it for signed-in visitors
              was wrong twice over: a resident who already has a society is
              exactly the person who refers a neighbouring one, and it left the
              form unreachable without logging out. Only the SECOND slot is
              contextual — a way back into the app, or a way in. */}
          <div className="flex items-center gap-2">
            <Link
              href={isSignedIn ? "/dashboard" : "/login"}
              className="pk-press hidden rounded-full px-4 py-2 text-[14px] font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--pk-primary)] sm:inline-flex"
              style={{ color: "var(--pk-body)" }}
            >
              {isSignedIn ? t("landing.navDashboard") : t("landing.navSignIn")}
            </Link>
            <Link
              href="/enroll"
              className="pk-press inline-flex shrink-0 items-center whitespace-nowrap rounded-full px-3.5 py-2 text-[13px] font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 min-[360px]:px-5 min-[360px]:py-2.5 min-[360px]:text-[14px]"
              style={{ backgroundColor: "var(--pk-primary)", color: "var(--pk-on-primary)" }}
            >
              {t("landing.connectCta")}
            </Link>
          </div>
        </div>
      </header>

      {/* ---------------- hero ---------------- */}
      {/* Dark ground so the collage art reads as luminous, and so the brand hue
          can run at full saturation in the one place nothing has to stay
          readable over it. */}
      <section className="pk-hero relative overflow-hidden">
        <div
          className={`${SHELL} relative z-10 grid gap-14 pt-14 pb-20 lg:grid-cols-[1.02fr_.98fr] lg:items-center lg:gap-14 lg:pt-20 lg:pb-24`}
        >
          <div>
            <span className="pk-in inline-block" style={{ "--d": "60ms" }}>
              <Eyebrow onDark>{t("landing.heroEyebrow")}</Eyebrow>
            </span>
            <h1
              className="pk-in mt-6 font-extrabold leading-[1.03] tracking-[-0.035em]"
              style={{ color: "#FFFFFF", fontSize: "var(--pk-text-4xl)", "--d": "150ms" }}
            >
              {t("landing.heroTitle")}
            </h1>
            <p
              className="pk-in mt-6 max-w-xl leading-relaxed"
              style={{
                color: "rgba(255,255,255,.78)",
                fontSize: "var(--pk-text-lg)",
                "--d": "260ms",
              }}
            >
              {t("landing.heroBody")}
            </p>

            <div
              className="pk-in mt-9 flex flex-wrap items-center gap-3"
              style={{ "--d": "360ms" }}
            >
              <PrimaryCta href="/enroll">{t("landing.connectCta")}</PrimaryCta>
              <Link
                href="/login"
                className="pk-press inline-flex items-center rounded-full border px-7 py-3.5 text-[15px] font-semibold text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70"
                style={{
                  borderColor: "rgba(255,255,255,.28)",
                  backgroundColor: "rgba(255,255,255,.06)",
                }}
              >
                {t("landing.navSignIn")}
              </Link>
            </div>
          </div>

          <HeroCollage />
        </div>
      </section>

      {/* ---------------- quick tour ---------------- */}
      <section id="tour-demo" className={`${SHELL} ${SECTION} pk-reveal`}>
        <QuickTour />
      </section>

      {/* ---------------- the problem ---------------- */}
      <section
        className="border-y"
        style={{ backgroundColor: "var(--pk-tint)", borderColor: "var(--pk-rule)" }}
      >
        <div className={`${SHELL} ${SECTION} pk-reveal`}>
          <H2 className="max-w-2xl">{t("landing.problemTitle")}</H2>
          <p
            className="mt-5 max-w-2xl leading-relaxed"
            style={{ color: "var(--pk-body)", fontSize: "var(--pk-text-lg)" }}
          >
            {t("landing.problemLead")}
          </p>
          {/* Three parallel failures — not a sequence, so deliberately unnumbered. */}
          <div className="pk-stagger mt-12 grid gap-10 sm:grid-cols-3">
            {[1, 2, 3].map((n) => (
              <div key={n}>
                <span
                  aria-hidden="true"
                  className="block h-1 w-10 rounded-full"
                  style={{ backgroundColor: "var(--pk-primary)" }}
                />
                <h3
                  className="mt-5 font-bold tracking-[-0.01em]"
                  style={{ color: "var(--pk-ink)", fontSize: "var(--pk-text-lg)" }}
                >
                  {t(`landing.p${n}Title`)}
                </h3>
                <p
                  className="mt-2 leading-relaxed"
                  style={{ color: "var(--pk-body)", fontSize: "var(--pk-text-sm)" }}
                >
                  {t(`landing.p${n}Body`)}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ---------------- features: bento ---------------- */}
      <section className={`${SHELL} ${SECTION} pk-reveal`}>
        <H2>{t("landing.featuresTitle")}</H2>
        <p
          className="mt-4 max-w-2xl leading-relaxed"
          style={{ color: "var(--pk-body)", fontSize: "var(--pk-text-lg)" }}
        >
          {t("landing.featuresLead")}
        </p>
        <div className="pk-stagger mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {features.map(({ icon, n, wide }) => (
            <Feature
              key={n}
              icon={icon}
              wide={wide}
              title={t(`landing.f${n}Title`)}
              body={t(`landing.f${n}Body`)}
            />
          ))}
        </div>
      </section>

      {/* ---------------- roles ---------------- */}
      <section
        className="border-y"
        style={{ backgroundColor: "var(--pk-tint)", borderColor: "var(--pk-rule)" }}
      >
        <div className={`${SHELL} ${SECTION} pk-reveal`}>
          <H2 className="max-w-2xl">{t("landing.rolesTitle")}</H2>
          <p
            className="mt-5 max-w-2xl leading-relaxed"
            style={{ color: "var(--pk-body)", fontSize: "var(--pk-text-lg)" }}
          >
            {t("landing.rolesLead")}
          </p>
          <div className="pk-stagger mt-12 grid gap-5 lg:grid-cols-2">
            <RoleCard
              icon={ShieldCheck}
              title={t("landing.roleSecTitle")}
              body={t("landing.roleSecBody")}
              points={[1, 2, 3].map((i) => t(`landing.roleSec${i}`))}
            />
            <RoleCard
              icon={House}
              title={t("landing.roleMemTitle")}
              body={t("landing.roleMemBody")}
              points={[1, 2, 3].map((i) => t(`landing.roleMem${i}`))}
            />
          </div>
        </div>
      </section>

      {/* ---------------- role walkthrough ---------------- */}
      {/* Sits immediately under the roles band: that section CLAIMS the product
          suits both audiences, so this is where it has to prove it. */}
      <section className={`${SHELL} ${SECTION} pk-reveal`}>
        <H2 className="max-w-2xl">{t("landing.walkTitle")}</H2>
        <p
          className="mt-5 mb-9 max-w-2xl leading-relaxed"
          style={{ color: "var(--pk-body)", fontSize: "var(--pk-text-lg)" }}
        >
          {t("landing.walkLead")}
        </p>
        <RoleWalkthrough />
      </section>

      {/* ---------------- product theatre: scope + the society code ---------- */}
      <section style={{ backgroundColor: "var(--pk-theatre)" }}>
        <div className={`${SHELL} ${SECTION} grid gap-14 lg:grid-cols-2 lg:items-center`}>
          <div>
            <Eyebrow onDark>{t("landing.codeEyebrow")}</Eyebrow>
            <H2 onDark className="mt-6">
              {t("landing.codeTitle")}
            </H2>
            <p
              className="mt-5 max-w-xl leading-relaxed"
              style={{ color: "var(--pk-on-dark-body)", fontSize: "var(--pk-text-lg)" }}
            >
              {t("landing.codeBody")}
            </p>
            {/* A real sequence, so the numerals carry information. */}
            <ol className="mt-9 flex flex-col gap-5">
              {[1, 2, 3].map((n) => (
                <li key={n} className="flex items-center gap-4">
                  <span
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[13px] font-bold"
                    style={{ backgroundColor: "rgba(255,255,255,.08)", color: "#7FDFBB" }}
                  >
                    {n}
                  </span>
                  <span style={{ color: "var(--pk-on-dark)", fontSize: "var(--pk-text-md)" }}>
                    {t(`landing.codeStep${n}`)}
                  </span>
                </li>
              ))}
            </ol>
          </div>

          {/* The artifact you paste into the group chat. */}
          <div
            className="pk-glass rounded-[var(--pk-r-2xl)] p-10 text-center"
            style={{ borderColor: "rgba(255,255,255,.10)" }}
          >
            <p className="text-[12px] font-semibold" style={{ color: "var(--pk-on-dark-body)" }}>
              {t("landing.phoneSociety")}
            </p>
            <span
              className="mt-5 block text-[34px] font-extrabold tracking-[0.14em] sm:text-[40px]"
              style={{ fontFamily: "var(--pk-mono)", color: "var(--pk-on-dark)" }}
            >
              GRNM-4K92
            </span>
            <span
              aria-hidden="true"
              className="mx-auto mt-6 block h-1 w-12 rounded-full"
              style={{ backgroundColor: "#7FDFBB" }}
            />
            <p
              className="mt-6 leading-relaxed"
              style={{ color: "var(--pk-on-dark-body)", fontSize: "var(--pk-text-sm)" }}
            >
              {t("landing.langLine")}
            </p>
          </div>
        </div>

        {/* Scope — MyGate sells gate hardware and payments, so it can never
            claim focus. Stating the exclusions plainly is more credible than
            implying we do everything. */}
        <div className={`${SHELL} pb-20 lg:pb-28`}>
          <div
            className="rounded-[var(--pk-r-2xl)] border p-8 lg:p-10"
            style={{
              borderColor: "rgba(255,255,255,.10)",
              backgroundColor: "var(--pk-theatre-card)",
            }}
          >
            <h3
              className="max-w-2xl font-extrabold leading-tight tracking-[-0.02em]"
              style={{ color: "var(--pk-on-dark)", fontSize: "var(--pk-text-2xl)" }}
            >
              {t("landing.scopeTitle")}
            </h3>
            <p
              className="mt-4 max-w-3xl leading-relaxed"
              style={{ color: "var(--pk-on-dark-body)", fontSize: "var(--pk-text-md)" }}
            >
              {t("landing.scopeBody")}
            </p>
          </div>
        </div>
      </section>

      {/* ---------------- pricing ---------------- */}
      {/* Placed after the objections and before the FAQ: a committee will only
          look at a price once it believes the thing works. */}
      <section
        className="border-y"
        style={{ backgroundColor: "var(--pk-tint)", borderColor: "var(--pk-rule)" }}
      >
        <div className={`${SHELL} ${SECTION} pk-reveal text-center`}>
          <Eyebrow>{t("landing.priceEyebrow")}</Eyebrow>
          <h2
            className="mx-auto mt-6 max-w-2xl font-extrabold leading-[1.1] tracking-[-0.03em]"
            style={{ color: "var(--pk-ink)", fontSize: "var(--pk-text-3xl)" }}
          >
            {t("landing.priceTitle")}
          </h2>
          <p
            className="mx-auto mt-5 max-w-2xl leading-relaxed"
            style={{ color: "var(--pk-body)", fontSize: "var(--pk-text-lg)" }}
          >
            {t("landing.priceLead")}
          </p>

          <div className="text-left">
            <PricingPlans />
          </div>

          {/* The treasurer's first question, answered before it is asked. */}
          <p
            className="mx-auto mt-10 max-w-2xl leading-relaxed"
            style={{ color: "var(--pk-muted)", fontSize: "var(--pk-text-sm)" }}
          >
            {t("landing.priceFoot")}
          </p>
        </div>
      </section>

      {/* ---------------- faq ---------------- */}
      <section className={`${SHELL} ${SECTION} pk-reveal`}>
        <H2 className="text-center">{t("landing.faqTitle")}</H2>
        <FaqAccordion />
      </section>

      {/* ---------------- closing ---------------- */}
      <section
        className="border-t"
        style={{ backgroundColor: "var(--pk-tint)", borderColor: "var(--pk-rule)" }}
      >
        <div className={`${SHELL} ${SECTION} pk-reveal text-center`}>
          <h2
            className="mx-auto max-w-3xl font-extrabold leading-[1.08] tracking-[-0.03em]"
            style={{ color: "var(--pk-ink)", fontSize: "var(--pk-text-4xl)" }}
          >
            {t("landing.ctaTitle")}
          </h2>
          <p
            className="mx-auto mt-5 max-w-xl leading-relaxed"
            style={{ color: "var(--pk-body)", fontSize: "var(--pk-text-lg)" }}
          >
            {t("landing.ctaBody")}
          </p>
          <div className="mt-9 flex flex-wrap items-center justify-center gap-3">
            <PrimaryCta href="/enroll">{t("landing.connectCta")}</PrimaryCta>
            <GhostCta href="/login">{t("landing.navSignIn")}</GhostCta>
          </div>
          <p className="mt-5" style={{ color: "var(--pk-muted)", fontSize: "var(--pk-text-sm)" }}>
            {t("landing.heroNote")}
          </p>
        </div>
      </section>

      <footer style={{ backgroundColor: "var(--pk-theatre)" }}>
        <div
          className={`${SHELL} flex flex-col gap-5 py-10 sm:flex-row sm:items-center sm:justify-between`}
        >
          {/* The full lock-up (mark + "Parisar" + tagline) lives HERE and only
              here on the site. Its wordmark is white with a soft glow, so it
              needs a dark ground — on the light nav the name would be invisible
              against cream (verified by compositing it on both). The footer is
              the site's one dark surface where it reads correctly, and a
              closing brand signature is exactly what a footer is for. */}
          <Image
            src="/parisar-wordmark.png"
            alt="Parisar — society management made easy"
            width={200}
            height={200}
            className="h-auto w-[168px] shrink-0 object-contain sm:w-[188px]"
          />
          <p style={{ color: "var(--pk-on-dark-body)", fontSize: "var(--pk-text-sm)" }}>
            {t("landing.footerLine")}
          </p>
          {/* Footer mirrors the nav: an existing user gets back into the app,
              everyone else gets the way in. */}
          <Link
            href={isSignedIn ? "/dashboard" : "/login"}
            className="pk-ul font-semibold"
            style={{ color: "var(--pk-on-dark)", fontSize: "var(--pk-text-sm)" }}
          >
            {isSignedIn ? t("landing.navDashboard") : t("landing.navSignIn")}
          </Link>
        </div>
      </footer>
    </div>
  );
}
