"use client";

// THE SIGNATURE ELEMENT.
//
// Competitor society-app sites (MyGate included) show static screenshots of the
// product. A screenshot asks you to believe; a working surface lets you check.
// This is the app's home screen rebuilt in CSS with real tabs you can press —
// so the hero IS the product, not a picture of it.
//
// Why CSS and not an <img>: a screenshot cannot localise. This demo re-renders
// in English, हिन्दी and मराठी from the same i18n keys as the app, which is the
// single most important thing to prove to an Indian society — and the thing a
// PNG can never do. It also weighs nothing, stays sharp at any DPR, and honours
// dark mode for free.
//
// Every row carries a name and a flat, because attribution is the product's
// actual differentiator over a WhatsApp group.

import { Bell, CalendarCheck, CheckCircle2, ChevronRight, MessagesSquare } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

const TABS = ["phoneTab1", "phoneTab2", "phoneTab3"];

/** Coloured status pill used on the complaints tab. */
function Status({ tone, children }) {
  return (
    <span
      className="shrink-0 rounded-full px-2 py-[3px] text-[10px] font-semibold"
      style={{ backgroundColor: `${tone}1F`, color: tone }}
    >
      {children}
    </span>
  );
}

function Row({ children, delay, onDark }) {
  return (
    <div
      className="pk-row flex items-center gap-3 rounded-[14px] px-3 py-2.5"
      style={{
        animationDelay: delay,
        backgroundColor: onDark ? "rgba(255,255,255,.05)" : "var(--pk-page)",
        border: `1px solid ${onDark ? "rgba(255,255,255,.07)" : "var(--pk-rule)"}`,
      }}
    >
      {children}
    </div>
  );
}

export function PhoneDemo() {
  const { t } = useTranslation("auth");
  const [tab, setTab] = useState(0);
  // The demo plays itself until the visitor touches it, then hands over
  // permanently. A carousel that keeps moving under someone's finger is the
  // single most irritating pattern on a marketing page, so `taken` is one-way.
  const [taken, setTaken] = useState(false);
  const panelId = useId();
  const listRef = useRef(null);

  useEffect(() => {
    if (taken) return;
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    const id = setInterval(() => setTab((n) => (n + 1) % TABS.length), 3200);
    return () => clearInterval(id);
  }, [taken]);

  // Arrow-key navigation, the expected behaviour for a real tablist.
  function onKeyDown(e) {
    const d = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
    if (!d) return;
    e.preventDefault();
    setTaken(true);
    const next = (tab + d + TABS.length) % TABS.length;
    setTab(next);
    listRef.current?.querySelectorAll('[role="tab"]')[next]?.focus();
  }

  const ink = "var(--pk-on-dark)";
  const sub = "var(--pk-on-dark-body)";

  // Tab 0 — "Today": four modules in one morning. This is the breadth proof.
  const today = [
    { icon: Bell, tone: "#7FDFBB", k: 1, who: "Sunita · A-704", time: "8:02" },
    { icon: CheckCircle2, tone: "#F0B45E", k: 2, who: "Kiran · C-302", time: "9:15" },
    { icon: CalendarCheck, tone: "#7FDFBB", k: 3, who: "Chetan · A-201", time: "9:41" },
    { icon: MessagesSquare, tone: "#5FCFA6", k: 4, who: "Deepa · B-101", time: "11:02" },
  ];

  const notices = [
    { title: t("landing.phoneN1"), meta: t("landing.phoneN1M"), time: "8:02" },
    { title: t("landing.phoneN2"), meta: t("landing.phoneN2M"), time: "Fri" },
    { title: t("landing.phoneN3"), meta: t("landing.phoneN3M"), time: "Wed" },
  ];

  const complaints = [
    {
      title: t("landing.phoneC1"),
      who: "Deepa · B-101",
      s: t("landing.phoneResolved"),
      tone: "#7FDFBB",
    },
    {
      title: t("landing.phoneC2"),
      who: "Amit · A-102",
      s: t("landing.phoneChecking"),
      tone: "#F0B45E",
    },
    {
      title: t("landing.phoneC3"),
      who: "Nisha · C-301",
      s: t("landing.phoneOpen"),
      tone: "#5FCFA6",
    },
  ];

  return (
    <div className="relative mx-auto w-full max-w-[340px]">
      {/* Device frame. A real bezel rather than a floating card — it reads as
          "this is the phone app", which is what a resident will actually use. */}
      <div
        className="rounded-[40px] p-2.5"
        style={{
          background: "linear-gradient(160deg, #4A2E1E, #241610)",
          boxShadow: "var(--pk-shadow-lg)",
        }}
      >
        <div
          className="overflow-hidden rounded-[32px]"
          style={{ backgroundColor: "var(--pk-theatre)" }}
        >
          {/* status bar */}
          <div className="flex items-center justify-between px-5 pt-4 pb-2">
            <span className="text-[11px] font-semibold" style={{ color: ink }}>
              9:41
            </span>
            <span className="flex gap-1" aria-hidden="true">
              {[3, 5, 7].map((h) => (
                <span
                  key={h}
                  className="w-[3px] rounded-full"
                  style={{ height: h, backgroundColor: sub }}
                />
              ))}
            </span>
          </div>

          {/* society header */}
          <div className="px-5 pb-3">
            <p className="text-[11px]" style={{ color: sub }}>
              {t("landing.phoneSociety")}
            </p>
            <p className="text-[17px] font-bold" style={{ color: ink }}>
              {t("common.appName")}
            </p>
          </div>

          {/* tabs — real buttons, real roving state, keyboard reachable */}
          <div
            ref={listRef}
            role="tablist"
            aria-label={t("landing.phoneSociety")}
            onKeyDown={onKeyDown}
            className="flex gap-1 px-4"
          >
            {TABS.map((key, i) => {
              const selected = i === tab;
              return (
                <button
                  key={key}
                  type="button"
                  role="tab"
                  id={`${panelId}-tab-${i}`}
                  aria-selected={selected}
                  aria-controls={`${panelId}-panel`}
                  tabIndex={selected ? 0 : -1}
                  onClick={() => {
                    setTaken(true);
                    setTab(i);
                  }}
                  className="pk-press flex-1 rounded-full py-1.5 text-[11px] font-semibold transition-transform duration-200 focus-visible:outline-none focus-visible:ring-2"
                  style={{
                    backgroundColor: selected ? "#7FDFBB" : "rgba(255,255,255,.06)",
                    color: selected ? "#1A120D" : sub,
                  }}
                >
                  {t(`landing.${key}`)}
                </button>
              );
            })}
          </div>

          {/* panel */}
          <div
            id={`${panelId}-panel`}
            role="tabpanel"
            aria-labelledby={`${panelId}-tab-${tab}`}
            className="flex min-h-[268px] flex-col gap-2 p-4"
          >
            {tab === 0 &&
              today.map((r, i) => {
                const Icon = r.icon;
                return (
                  <Row key={r.k} delay={`${i * 90}ms`} onDark>
                    <span
                      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px]"
                      style={{ backgroundColor: `${r.tone}22`, color: r.tone }}
                    >
                      <Icon size={15} strokeWidth={2} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span
                        className="block truncate text-[11px] font-semibold"
                        style={{ color: ink }}
                      >
                        {t(`landing.trailSubject${r.k}`)}
                      </span>
                      <span className="block truncate text-[10px]" style={{ color: sub }}>
                        {t(`landing.trailKind${r.k}`)} · {r.who}
                      </span>
                    </span>
                    <span className="shrink-0 text-[10px] tabular-nums" style={{ color: sub }}>
                      {r.time}
                    </span>
                  </Row>
                );
              })}

            {tab === 1 &&
              notices.map((n, i) => (
                <Row key={n.title} delay={`${i * 90}ms`} onDark>
                  <span
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px]"
                    style={{ backgroundColor: "#7FDFBB22", color: "#7FDFBB" }}
                  >
                    <Bell size={15} strokeWidth={2} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span
                      className="block truncate text-[11px] font-semibold"
                      style={{ color: ink }}
                    >
                      {n.title}
                    </span>
                    <span className="block truncate text-[10px]" style={{ color: sub }}>
                      {n.meta}
                    </span>
                  </span>
                  <span className="shrink-0 text-[10px]" style={{ color: sub }}>
                    {n.time}
                  </span>
                </Row>
              ))}

            {tab === 2 &&
              complaints.map((c, i) => (
                <Row key={c.title} delay={`${i * 90}ms`} onDark>
                  <span className="min-w-0 flex-1">
                    <span
                      className="block truncate text-[11px] font-semibold"
                      style={{ color: ink }}
                    >
                      {c.title}
                    </span>
                    <span className="block truncate text-[10px]" style={{ color: sub }}>
                      {c.who}
                    </span>
                  </span>
                  <Status tone={c.tone}>{c.s}</Status>
                  <ChevronRight size={13} style={{ color: sub }} aria-hidden="true" />
                </Row>
              ))}
          </div>
        </div>
      </div>
    </div>
  );
}
