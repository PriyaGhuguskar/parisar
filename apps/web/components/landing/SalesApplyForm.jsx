"use client";

// "Work as a salesperson" — the form behind the landing footer link.
//
// Shape mirrors EnrollForm: same page shell, same field styling, same
// submit-once-then-confirm flow, so the two public forms feel like one product.
//
// WHERE THE REAL VALIDATION LIVES. Everything checked here is a courtesy to the
// visitor — the PostgREST endpoint is reachable directly, so the binding rules
// are CHECK constraints on public.sales_applications (name length, +91 phone
// shape, willing must be true) plus a partial unique index that allows one open
// application per number. Client-side checks exist to give a useful message
// before a round trip, not to keep anything out.
//
// JavaScript only — no TypeScript per CLAUDE.md.

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useId, useState } from "react";
import { useTranslation } from "react-i18next";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

const PHONE_RE = /^[6-9]\d{9}$/;

const FIELD =
  "h-12 w-full rounded-xl border bg-white px-3.5 text-[15px] outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-brand-500)]";

const REDIRECT_SECONDS = 10;

export function SalesApplyForm() {
  const { t } = useTranslation("auth");
  const router = useRouter();

  const nameId = useId();
  const phoneId = useId();
  const consentId = useId();
  const errId = useId();

  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [willing, setWilling] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const [done, setDone] = useState(false);
  const [left, setLeft] = useState(REDIRECT_SECONDS);

  // Send them home once the confirmation has been read.
  //
  // The countdown is shown and a manual link sits beside it rather than the
  // page silently navigating: an unannounced redirect moves someone who is
  // still reading, and a screen-reader user gets no warning at all. Visible
  // remaining time plus a way to leave early is the accessible version of the
  // same behaviour.
  useEffect(() => {
    if (!done) return undefined;
    const tick = setInterval(() => setLeft((n) => (n > 0 ? n - 1 : 0)), 1000);
    const go = setTimeout(() => router.push("/"), REDIRECT_SECONDS * 1000);
    return () => {
      clearInterval(tick);
      clearTimeout(go);
    };
  }, [done, router]);

  async function onSubmit(event) {
    event.preventDefault();
    setErr(null);

    const trimmed = name.trim();
    const digits = phone.replace(/\D/g, "").slice(-10);

    if (trimmed.length < 2) return setErr(t("landing.salesErrName"));
    if (!PHONE_RE.test(digits)) return setErr(t("landing.salesErrPhone"));
    if (!willing) return setErr(t("landing.salesErrConsent"));

    setBusy(true);
    const supabase = createSupabaseBrowserClient();
    const { error } = await supabase.from("sales_applications").insert({
      full_name: trimmed,
      phone: `+91${digits}`,
      willing: true,
    });
    setBusy(false);

    if (error) {
      // 23505 is the partial unique index: an open application already exists
      // for this number. Say so plainly rather than showing a generic failure,
      // because "we already have you" is good news, not an error.
      setErr(error.code === "23505" ? t("landing.salesErrDupe") : t("landing.salesErrGeneric"));
      return;
    }
    setDone(true);
  }

  return (
    <div className="min-h-screen" style={{ backgroundColor: "var(--color-neutral-50)" }}>
      <header className="border-b" style={{ borderColor: "var(--color-neutral-200)" }}>
        <div className="mx-auto flex h-[72px] max-w-2xl items-center justify-between px-5">
          <Link href="/" className="flex items-center gap-2.5">
            <Image
              src="/parisar-mark-96.png"
              alt=""
              aria-hidden="true"
              width={40}
              height={40}
              className="h-9 w-9 object-contain"
            />
            <span
              className="font-extrabold text-[20px] tracking-[-0.03em]"
              style={{ color: "var(--color-neutral-900)" }}
            >
              Parisar
            </span>
          </Link>
        </div>
      </header>

      <main id="main-content" className="mx-auto max-w-2xl px-5 py-10">
        {done ? (
          <div
            className="rounded-2xl border bg-white p-7"
            style={{ borderColor: "var(--color-neutral-200)" }}
          >
            <h1
              className="font-extrabold text-[24px] tracking-[-0.02em]"
              style={{ color: "var(--color-neutral-900)" }}
            >
              {t("landing.salesDoneTitle")}
            </h1>
            <p className="mt-3 leading-relaxed" style={{ color: "var(--color-neutral-600)" }}>
              {t("landing.salesDoneBody")}
            </p>
            {/* Deliberately NOT aria-live: the number changes every second, so a
                live region would announce "10… 9… 8…" over the top of whatever
                the person is reading. Read once in document order is enough,
                and the link beside it is the actual escape hatch. */}
            <p
              className="mt-5 text-[14px]"
              style={{ color: "var(--color-neutral-500)" }}
            >
              {t("landing.salesDoneRedirect", { count: left })}{" "}
              <Link href="/" className="font-semibold underline underline-offset-2">
                {t("landing.salesDoneHomeNow")}
              </Link>
            </p>
          </div>
        ) : (
          <>
            <h1
              className="font-extrabold text-[28px] leading-[1.15] tracking-[-0.03em]"
              style={{ color: "var(--color-neutral-900)" }}
            >
              {t("landing.salesTitle")}
            </h1>
            <p
              className="mt-3 max-w-xl leading-relaxed"
              style={{ color: "var(--color-neutral-600)" }}
            >
              {t("landing.salesLead")}
            </p>

            <form
              onSubmit={onSubmit}
              noValidate
              className="mt-8 rounded-2xl border bg-white p-6"
              style={{ borderColor: "var(--color-neutral-200)" }}
            >
              <label
                htmlFor={nameId}
                className="block font-semibold text-[14px]"
                style={{ color: "var(--color-neutral-800)" }}
              >
                {t("landing.salesName")}
              </label>
              <input
                id={nameId}
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={t("landing.salesNamePh")}
                autoComplete="name"
                className={`${FIELD} mt-2`}
                style={{ borderColor: "var(--color-neutral-200)" }}
              />

              <label
                htmlFor={phoneId}
                className="mt-5 block font-semibold text-[14px]"
                style={{ color: "var(--color-neutral-800)" }}
              >
                {t("landing.salesPhone")}
              </label>
              <div className="mt-2 flex items-center gap-2">
                <span
                  className="flex h-12 items-center rounded-xl border px-3 text-[15px]"
                  style={{
                    borderColor: "var(--color-neutral-200)",
                    color: "var(--color-neutral-600)",
                  }}
                >
                  +91
                </span>
                <input
                  id={phoneId}
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  inputMode="numeric"
                  autoComplete="tel-national"
                  maxLength={10}
                  className={FIELD}
                  style={{ borderColor: "var(--color-neutral-200)" }}
                />
              </div>

              {/* The checkbox is the application itself — the DB rejects
                  willing=false outright, so this is not an optional extra. */}
              <div className="mt-6 flex items-start gap-3">
                <input
                  id={consentId}
                  type="checkbox"
                  checked={willing}
                  onChange={(e) => setWilling(e.target.checked)}
                  className="mt-0.5 h-5 w-5 shrink-0 rounded accent-[var(--color-brand-500)]"
                />
                <label
                  htmlFor={consentId}
                  className="text-[15px] leading-relaxed"
                  style={{ color: "var(--color-neutral-800)" }}
                >
                  {t("landing.salesConsent")}
                </label>
              </div>

              {err ? (
                <p
                  id={errId}
                  role="alert"
                  className="mt-5 font-medium text-[14px]"
                  style={{ color: "var(--color-danger-600, #b42318)" }}
                >
                  {err}
                </p>
              ) : null}

              <button
                type="submit"
                disabled={busy}
                aria-describedby={err ? errId : undefined}
                className="pk-press mt-6 h-12 w-full rounded-xl font-bold text-[15px] text-white disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-brand-500)] focus-visible:ring-offset-2"
                style={{ backgroundColor: "var(--color-brand-500)" }}
              >
                {busy ? t("landing.salesSending") : t("landing.salesSubmit")}
              </button>
            </form>
          </>
        )}
      </main>
    </div>
  );
}
