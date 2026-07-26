"use client";

// "See it from both sides" — a role-split product walkthrough.
//
// WHY THIS AND NOT A VIDEO: the brief asked for a demo video, one per role.
// There is no footage in this project, and more importantly a video cannot
// change language — this product ships in English, हिन्दी and मराठी, so a video
// means three recordings, re-shot every time a screen changes. It also costs
// bandwidth on exactly the mid-range Android connections this audience is on.
//
// This is a stepped walkthrough instead: pick a role, step through what that
// person actually does, and watch a real (CSS-drawn) screen change on each step.
// It localises for free, weighs nothing, and stays truthful as the app evolves.
// When real footage exists it drops into this same section — the section, the
// role switcher and the copy keys all stay.
//
// The numbered steps are legitimate here: a journey IS a sequence, and the order
// carries information (you sign in before you can raise a complaint).

import { Check, ChevronRight, Play } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

// Each step declares which mock screen to draw. Keeping this as data (rather
// than twelve bespoke JSX blocks) is what keeps the file readable.
const RESIDENT = [
  { k: "wr1", screen: "signin" },
  { k: "wr2", screen: "complaint" },
  { k: "wr3", screen: "ask" },
  { k: "wr4", screen: "post" },
  { k: "wr5", screen: "booking" },
];
const COMMITTEE = [
  { k: "wc1", screen: "signin" },
  { k: "wc2", screen: "flats" },
  { k: "wc3", screen: "notice" },
  { k: "wc4", screen: "respond" },
  { k: "wc5", screen: "joiners" },
];

const INK = "var(--pk-on-dark)";
const SUB = "var(--pk-on-dark-body)";

function Row({ children, delay = "0ms", accent = false }) {
  return (
    <div
      className="pk-row flex items-center gap-2.5 rounded-[12px] px-3 py-2.5"
      style={{
        animationDelay: delay,
        backgroundColor: accent ? "rgba(95,207,166,.14)" : "rgba(255,255,255,.05)",
        border: `1px solid ${accent ? "rgba(95,207,166,.34)" : "rgba(255,255,255,.07)"}`,
      }}
    >
      {children}
    </div>
  );
}

function Line({ children, muted = false, bold = false }) {
  return (
    <span
      className={`block truncate ${bold ? "font-semibold" : ""}`}
      style={{ color: muted ? SUB : INK, fontSize: muted ? 10 : 11 }}
    >
      {children}
    </span>
  );
}

function Field({ label, value, filled }) {
  return (
    <div
      className="pk-row rounded-[12px] px-3 py-2"
      style={{
        backgroundColor: "rgba(255,255,255,.05)",
        border: `1px solid ${filled ? "rgba(95,207,166,.38)" : "rgba(255,255,255,.08)"}`,
      }}
    >
      <span className="block text-[9px]" style={{ color: SUB }}>
        {label}
      </span>
      <span className="block text-[12px] font-semibold" style={{ color: INK }}>
        {value}
      </span>
    </div>
  );
}

function Action({ children }) {
  return (
    <div
      className="pk-row mt-auto rounded-full py-2 text-center text-[11px] font-bold"
      style={{ backgroundColor: "#5FCFA6", color: "#0D1A14", animationDelay: "340ms" }}
    >
      {children}
    </div>
  );
}

/** The mock screen for a given step. Deliberately schematic, never a fake screenshot. */
function Screen({ kind, t }) {
  switch (kind) {
    case "signin":
      return (
        <>
          <Field label="+91" value="98765 43210" filled />
          <div className="flex gap-1.5">
            {["1", "2", "3", "4", "5", "6"].map((d, i) => (
              <span
                key={d}
                className="pk-row flex h-9 flex-1 items-center justify-center rounded-[9px] text-[13px] font-bold"
                style={{
                  animationDelay: `${120 + i * 60}ms`,
                  backgroundColor: "rgba(255,255,255,.06)",
                  border: "1px solid rgba(95,207,166,.28)",
                  color: INK,
                }}
              >
                {d}
              </span>
            ))}
          </div>
          <Action>{t("landing.navSignIn")}</Action>
        </>
      );
    case "complaint":
      return (
        <>
          <Field label={t("landing.trailKind4")} value={t("landing.phoneC1")} filled />
          <div
            className="pk-row flex h-16 items-center justify-center rounded-[12px]"
            style={{
              animationDelay: "140ms",
              backgroundColor: "rgba(255,255,255,.05)",
              border: "1px dashed rgba(255,255,255,.16)",
              color: SUB,
              fontSize: 10,
            }}
          >
            📷
          </div>
          <Action>{t("landing.f3Title")}</Action>
        </>
      );
    case "ask":
      return (
        <>
          <Row accent>
            <Line bold>{t("landing.demoAsk")}</Line>
          </Row>
          <Row delay="140ms">
            <span className="min-w-0 flex-1">
              <Line>Chetan · A-201</Line>
              <Line muted>2 replies</Line>
            </span>
            <ChevronRight size={12} style={{ color: SUB }} aria-hidden="true" />
          </Row>
          <Action>{t("landing.f4Title")}</Action>
        </>
      );
    case "post":
      return (
        <>
          <Row accent>
            <Line bold>{t("landing.demoSell")}</Line>
          </Row>
          <Row delay="140ms">
            <span className="min-w-0 flex-1">
              <Line>Deepa · B-101</Line>
              <Line muted>{t("landing.f2Title")}</Line>
            </span>
          </Row>
          <Action>{t("landing.f2Title")}</Action>
        </>
      );
    case "booking":
      return (
        <>
          <Field label={t("landing.f5Title")} value={t("landing.demoAmenity")} filled />
          <div className="grid grid-cols-7 gap-1">
            {Array.from({ length: 14 }, (_, i) => i).map((i) => (
              <span
                key={i}
                className="pk-row flex h-6 items-center justify-center rounded-[6px] text-[9px]"
                style={{
                  animationDelay: `${100 + i * 22}ms`,
                  backgroundColor: i === 9 ? "#5FCFA6" : "rgba(255,255,255,.05)",
                  color: i === 9 ? "#0D1A14" : SUB,
                  fontWeight: i === 9 ? 700 : 400,
                }}
              >
                {i + 1}
              </span>
            ))}
          </div>
          <Action>{t("landing.f5Title")}</Action>
        </>
      );
    case "flats":
      return (
        <>
          {["A-101", "A-102", "A-103"].map((f, i) => (
            <Row key={f} delay={`${i * 110}ms`} accent={i === 2}>
              <span className="min-w-0 flex-1">
                <Line bold>{f}</Line>
              </span>
              {i === 2 ? <Check size={12} style={{ color: "#5FCFA6" }} aria-hidden="true" /> : null}
            </Row>
          ))}
          <Action>{t("landing.codeStep1")}</Action>
        </>
      );
    case "notice":
      return (
        <>
          <Field label={t("landing.trailKind1")} value={t("landing.phoneN1")} filled />
          <Row delay="150ms">
            <span className="min-w-0 flex-1">
              <Line muted>{t("landing.phoneN1M")}</Line>
            </span>
          </Row>
          <Action>{t("landing.f1Title")}</Action>
        </>
      );
    case "respond":
      return (
        <>
          <Row accent>
            <span className="min-w-0 flex-1">
              <Line bold>{t("landing.phoneC1")}</Line>
              <Line muted>Deepa · B-101</Line>
            </span>
          </Row>
          <div className="flex gap-1.5">
            {[t("landing.phoneOpen"), t("landing.phoneChecking"), t("landing.phoneResolved")].map(
              (s, i) => (
                <span
                  key={s}
                  className="pk-row flex-1 rounded-full py-1.5 text-center text-[9px] font-bold"
                  style={{
                    animationDelay: `${140 + i * 90}ms`,
                    backgroundColor: i === 2 ? "#5FCFA6" : "rgba(255,255,255,.06)",
                    color: i === 2 ? "#0D1A14" : SUB,
                  }}
                >
                  {s}
                </span>
              ),
            )}
          </div>
          <Action>{t("landing.f3Title")}</Action>
        </>
      );
    case "joiners":
      return (
        <>
          {[
            ["Sunita", "A-704"],
            ["Kiran", "C-302"],
            ["Amit", "A-102"],
          ].map(([n, f], i) => (
            <Row key={n} delay={`${i * 110}ms`} accent={i === 0}>
              <span
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[10px] font-bold"
                style={{ backgroundColor: "rgba(95,207,166,.20)", color: "#5FCFA6" }}
                aria-hidden="true"
              >
                {n[0]}
              </span>
              <span className="min-w-0 flex-1">
                <Line bold>{n}</Line>
                <Line muted>{f}</Line>
              </span>
              {i === 0 ? <Check size={12} style={{ color: "#5FCFA6" }} aria-hidden="true" /> : null}
            </Row>
          ))}
          <Action>{t("landing.f6Title")}</Action>
        </>
      );
    default:
      return null;
  }
}

export function RoleWalkthrough() {
  const { t } = useTranslation("auth");
  const [role, setRole] = useState(0); // 0 resident, 1 committee
  const [step, setStep] = useState(0);
  const [taken, setTaken] = useState(false);
  const uid = useId();
  const listRef = useRef(null);

  const steps = role === 0 ? RESIDENT : COMMITTEE;

  // Plays itself until the visitor takes over, then hands off permanently —
  // a walkthrough that keeps advancing under someone's finger is infuriating.
  useEffect(() => {
    if (taken) return;
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    const id = setInterval(() => setStep((n) => (n + 1) % steps.length), 3600);
    return () => clearInterval(id);
  }, [taken, steps.length]);

  function pickRole(next) {
    setTaken(true);
    setRole(next);
    setStep(0);
  }

  function onKeyDown(e) {
    const d = e.key === "ArrowDown" ? 1 : e.key === "ArrowUp" ? -1 : 0;
    if (!d) return;
    e.preventDefault();
    setTaken(true);
    const next = (step + d + steps.length) % steps.length;
    setStep(next);
    listRef.current?.querySelectorAll("button")[next]?.focus();
  }

  const active = steps[step];

  return (
    <div>
      {/* Role switcher. Two real tabs, because the two journeys are genuinely
          different products to the people living them. */}
      <div
        role="tablist"
        aria-label={t("landing.walkTitle")}
        className="inline-flex rounded-full p-1"
        style={{ backgroundColor: "var(--pk-tint)", border: "1px solid var(--pk-rule)" }}
      >
        {[t("landing.walkResident"), t("landing.walkCommittee")].map((label, i) => (
          <button
            key={label}
            type="button"
            role="tab"
            aria-selected={role === i}
            aria-controls={`${uid}-panel`}
            onClick={() => pickRole(i)}
            className="pk-press rounded-full px-5 py-2.5 text-[14px] font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--pk-primary)] focus-visible:ring-offset-2"
            style={{
              backgroundColor: role === i ? "var(--pk-primary)" : "transparent",
              color: role === i ? "var(--pk-on-primary)" : "var(--pk-body)",
            }}
          >
            {label}
          </button>
        ))}
      </div>

      <div
        id={`${uid}-panel`}
        className="mt-9 grid gap-10 lg:grid-cols-[1fr_320px] lg:items-center lg:gap-14"
      >
        {/* --- the journey --- */}
        {/* biome-ignore lint/a11y/useKeyWithClickEvents: arrow-key handling lives on the list */}
        <ol ref={listRef} onKeyDown={onKeyDown} className="flex flex-col gap-2">
          {steps.map((s, i) => {
            const on = i === step;
            return (
              <li key={s.k}>
                <button
                  type="button"
                  onClick={() => {
                    setTaken(true);
                    setStep(i);
                  }}
                  aria-current={on ? "step" : undefined}
                  className="pk-press flex w-full items-start gap-4 rounded-[16px] border p-4 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--pk-primary)] focus-visible:ring-offset-2"
                  style={{
                    borderColor: on ? "var(--pk-primary)" : "var(--pk-rule)",
                    backgroundColor: on ? "var(--pk-primary-soft)" : "var(--pk-card)",
                  }}
                >
                  <span
                    aria-hidden="true"
                    className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[12px] font-bold"
                    style={{
                      backgroundColor: on ? "var(--pk-primary)" : "var(--pk-tint)",
                      color: on ? "var(--pk-on-primary)" : "var(--pk-muted)",
                    }}
                  >
                    {i + 1}
                  </span>
                  <span className="min-w-0">
                    <span
                      className="block font-bold tracking-[-0.01em]"
                      style={{ color: "var(--pk-ink)", fontSize: "var(--pk-text-md)" }}
                    >
                      {t(`landing.${s.k}Title`)}
                    </span>
                    <span
                      className="mt-1 block leading-relaxed"
                      style={{ color: "var(--pk-body)", fontSize: "var(--pk-text-sm)" }}
                    >
                      {t(`landing.${s.k}Body`)}
                    </span>
                  </span>
                </button>
              </li>
            );
          })}
        </ol>

        {/* --- the screen for the active step --- */}
        <div className="mx-auto w-full max-w-[300px]">
          <div
            className="rounded-[34px] p-2.5"
            style={{
              background: "linear-gradient(160deg,#1E4536,#0D1A14)",
              boxShadow: "var(--pk-shadow-lg)",
            }}
          >
            <div
              className="overflow-hidden rounded-[26px]"
              style={{ backgroundColor: "var(--pk-theatre)" }}
            >
              <div className="flex items-center justify-between px-4 pt-3.5 pb-2">
                <span className="text-[10px] font-bold" style={{ color: INK }}>
                  {t("landing.phoneSociety")}
                </span>
                <span
                  className="inline-flex items-center gap-1 text-[9px] font-bold"
                  style={{ color: SUB }}
                >
                  <Play size={8} strokeWidth={3} aria-hidden="true" />
                  {t("landing.walkStepOf")} {step + 1}/{steps.length}
                </span>
              </div>
              <p
                className="px-4 pb-3 text-[13px] font-extrabold leading-snug"
                style={{ color: INK }}
              >
                {t(`landing.${active.k}Title`)}
              </p>
              {/* key forces a remount so the row animations replay per step */}
              <div key={`${role}-${step}`} className="flex min-h-[220px] flex-col gap-2 px-4 pb-4">
                <Screen kind={active.screen} t={t} />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
