"use client";

// Society enrollment request — the public front door.
//
// PRODUCT CONTEXT: societies are no longer self-service. A chairman requests
// enrollment, the admin team calls them back in a chosen slot, creates the
// society and hands over the join code. This form is step one of that.
//
// It writes to society_enrollment_requests, the only table an unauthenticated
// visitor can write to. That table grants anon INSERT on these four columns
// ONLY (no status, no notes) and has no SELECT policy at all, so a submitter
// can never read the lead list back. Validation here is a courtesy — the real
// enforcement is CHECK constraints and a partial unique index in the database,
// because this REST endpoint is directly reachable.

import { ArrowLeft, ArrowRight, CheckCircle2 } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

/** Local YYYY-MM-DD — NOT toISOString(), which converts to UTC and can hand
 *  back "yesterday" for anyone east of Greenwich. India is UTC+5:30, so that
 *  bug would have blocked the whole country from picking today after 18:30. */
function todayLocal() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function Field({ id, label, children, error }) {
  return (
    <div className="flex flex-col gap-2">
      <label
        htmlFor={id}
        className="text-[13px] font-bold"
        style={{ color: "var(--color-neutral-900)" }}
      >
        {label}
      </label>
      {children}
      {error ? (
        <p
          id={`${id}-error`}
          role="alert"
          className="text-[13px] font-medium"
          style={{ color: "var(--color-danger-500)" }}
        >
          {error}
        </p>
      ) : null}
    </div>
  );
}

const inputCls =
  "h-13 w-full rounded-2xl border bg-[var(--color-neutral-0)] px-4 py-3.5 text-[16px] outline-none transition-[border-color,box-shadow] duration-150 placeholder:text-[var(--color-neutral-400)] focus:border-[var(--color-brand-500)] focus:shadow-[0_0_0_4px_color-mix(in_srgb,var(--color-brand-500)_18%,transparent)]";

export function EnrollForm() {
  const { t } = useTranslation("auth");
  const [form, setForm] = useState({
    society: "",
    name: "",
    phone: "",
    when: "now", // "now" | "later"
    date: "",
    time: "",
  });
  const [errors, setErrors] = useState({});
  const [status, setStatus] = useState("idle"); // idle | sending | done
  const [submitError, setSubmitError] = useState(null);

  function set(k, v) {
    setForm((f) => ({ ...f, [k]: v }));
    setErrors((e) => ({ ...e, [k]: undefined }));
  }

  async function onSubmit(e) {
    e.preventDefault();
    setSubmitError(null);

    const next = {};
    if (form.society.trim().length < 2) next.society = t("landing.enrollBadField");
    if (form.name.trim().length < 2) next.name = t("landing.enrollBadField");
    // Same shape the DB CHECK enforces: 10 digits starting 6-9.
    if (!/^[6-9]\d{9}$/.test(form.phone)) next.phone = t("landing.enrollBadPhone");

    // Mirrors the DB trigger (SLOT_REQUIRED / SLOT_IN_PAST). The trigger is the
    // real gate — this exists so the visitor is told before a round trip.
    let when = null;
    if (form.when === "later") {
      if (!form.date || !form.time) {
        next.when = t("landing.enrollNeedWhen");
      } else {
        when = new Date(`${form.date}T${form.time}`);
        if (Number.isNaN(when.getTime()) || when.getTime() < Date.now() - 120000) {
          next.when = t("landing.enrollPastErr");
        }
      }
    }
    setErrors(next);
    if (Object.keys(next).length > 0) return;

    setStatus("sending");
    try {
      const supabase = createSupabaseBrowserClient();
      const { error } = await supabase.from("society_enrollment_requests").insert({
        society_name: form.society.trim(),
        contact_name: form.name.trim(),
        phone: `+91${form.phone}`,
        // preferred_slot keeps the label the visitor actually saw, so the admin
        // queue shows what was on screen rather than a re-derived string.
        preferred_slot:
          form.when === "now"
            ? t("landing.enrollNow")
            : when.toLocaleString(undefined, {
                weekday: "short",
                day: "numeric",
                month: "short",
                hour: "2-digit",
                minute: "2-digit",
              }),
        call_now: form.when === "now",
        preferred_at: form.when === "now" ? null : when.toISOString(),
      });
      if (error) {
        // 23505 = the partial unique index: one OPEN request per number. That is
        // reassurance ("we already have you"), not a failure the visitor caused.
        const msg = String(error.message || "");
        setSubmitError(
          error.code === "23505"
            ? t("landing.enrollDupe")
            : msg.includes("SLOT_IN_PAST") || msg.includes("SLOT_TOO_FAR")
              ? t("landing.enrollPastErr")
              : t("landing.enrollError"),
        );
        setStatus("idle");
        return;
      }
      setStatus("done");
    } catch {
      setSubmitError(t("landing.enrollError"));
      setStatus("idle");
    }
  }

  if (status === "done") {
    return (
      <div className="pk-in flex flex-col items-center py-6 text-center">
        <span
          aria-hidden="true"
          className="mb-5 flex h-14 w-14 items-center justify-center rounded-2xl"
          style={{ backgroundColor: "var(--color-brand-50)", color: "var(--color-brand-600)" }}
        >
          <CheckCircle2 size={26} strokeWidth={2} />
        </span>
        <h2
          className="text-[26px] font-extrabold tracking-[-0.03em]"
          style={{ color: "var(--color-neutral-900)" }}
        >
          {t("landing.enrollDoneTitle")}
        </h2>
        <p
          className="mt-3 max-w-sm text-[15px] leading-relaxed"
          style={{ color: "var(--color-neutral-600)" }}
        >
          {t("landing.enrollDoneBody")}
        </p>
        <Link
          href="/"
          className="pk-press pk-ul mt-7 text-[14px] font-bold"
          style={{ color: "var(--color-brand-600)" }}
        >
          {t("landing.enrollBack")}
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-5" noValidate>
      <Field id="enroll-society" label={t("landing.enrollSocietyLabel")} error={errors.society}>
        <input
          id="enroll-society"
          value={form.society}
          onChange={(e) => set("society", e.target.value)}
          placeholder={t("landing.enrollSocietyPh")}
          maxLength={120}
          aria-invalid={!!errors.society}
          aria-describedby={errors.society ? "enroll-society-error" : undefined}
          className={inputCls}
          style={{
            borderColor: errors.society ? "var(--color-danger-500)" : "var(--color-neutral-200)",
          }}
        />
      </Field>

      <Field id="enroll-name" label={t("landing.enrollNameLabel")} error={errors.name}>
        <input
          id="enroll-name"
          value={form.name}
          onChange={(e) => set("name", e.target.value)}
          placeholder={t("landing.enrollNamePh")}
          maxLength={80}
          autoComplete="name"
          aria-invalid={!!errors.name}
          aria-describedby={errors.name ? "enroll-name-error" : undefined}
          className={inputCls}
          style={{
            borderColor: errors.name ? "var(--color-danger-500)" : "var(--color-neutral-200)",
          }}
        />
      </Field>

      <Field id="enroll-phone" label={t("landing.enrollPhoneLabel")} error={errors.phone}>
        <div
          className="flex h-13 w-full items-center overflow-hidden rounded-2xl border bg-[var(--color-neutral-0)] transition-[border-color,box-shadow] duration-150 focus-within:border-[var(--color-brand-500)] focus-within:shadow-[0_0_0_4px_color-mix(in_srgb,var(--color-brand-500)_18%,transparent)]"
          style={{
            borderColor: errors.phone ? "var(--color-danger-500)" : "var(--color-neutral-200)",
          }}
        >
          <span
            className="flex h-full shrink-0 select-none items-center gap-1.5 pl-4 pr-3 text-[15px] font-semibold"
            style={{ color: "var(--color-neutral-900)" }}
          >
            <span aria-hidden="true">🇮🇳</span> +91
          </span>
          <span aria-hidden="true" className="h-6 w-px bg-[var(--color-neutral-200)]" />
          <input
            id="enroll-phone"
            type="tel"
            inputMode="numeric"
            autoComplete="tel-national"
            maxLength={10}
            value={form.phone}
            onChange={(e) => set("phone", e.target.value.replace(/\D/g, "").slice(0, 10))}
            placeholder="98765 43210"
            aria-invalid={!!errors.phone}
            aria-describedby={errors.phone ? "enroll-phone-error" : undefined}
            className="h-full min-w-0 flex-1 bg-transparent px-4 text-[16px] tracking-[0.04em] tabular-nums outline-none placeholder:tracking-normal placeholder:text-[var(--color-neutral-400)]"
          />
        </div>
      </Field>

      <fieldset className="flex flex-col gap-3">
        <legend
          className="mb-1 text-[13px] font-bold"
          style={{ color: "var(--color-neutral-900)" }}
        >
          {t("landing.enrollSlotLabel")}
        </legend>

        {/* Two intents, not four buckets: ring me now, or at a time I choose. */}
        <div className="grid gap-2 sm:grid-cols-2">
          {[
            ["now", t("landing.enrollNow")],
            ["later", t("landing.enrollPick")],
          ].map(([val, label]) => {
            const on = form.when === val;
            return (
              <label
                key={val}
                className="pk-press flex cursor-pointer items-center gap-2.5 rounded-2xl border px-4 py-3 text-[14px] font-semibold transition-colors focus-within:ring-2 focus-within:ring-[var(--color-brand-500)] focus-within:ring-offset-2"
                style={{
                  borderColor: on ? "var(--color-brand-500)" : "var(--color-neutral-200)",
                  backgroundColor: on ? "var(--color-brand-50)" : "var(--color-neutral-0)",
                  color: on ? "var(--color-brand-700)" : "var(--color-neutral-600)",
                }}
              >
                <input
                  type="radio"
                  name="when"
                  value={val}
                  checked={on}
                  onChange={() => set("when", val)}
                  className="sr-only"
                />
                <span
                  aria-hidden="true"
                  className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full border-2"
                  style={{
                    borderColor: on ? "var(--color-brand-500)" : "var(--color-neutral-200)",
                  }}
                >
                  {on ? (
                    <span
                      className="h-2 w-2 rounded-full"
                      style={{ backgroundColor: "var(--color-brand-500)" }}
                    />
                  ) : null}
                </span>
                {label}
              </label>
            );
          })}
        </div>

        {form.when === "now" ? (
          <p className="text-[13px]" style={{ color: "var(--color-neutral-400)" }}>
            {t("landing.enrollNowHint")}
          </p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="flex flex-col gap-2">
              <label
                htmlFor="enroll-date"
                className="text-[13px] font-semibold"
                style={{ color: "var(--color-neutral-600)" }}
              >
                {t("landing.enrollDate")}
              </label>
              {/* min stops the native picker offering past days; the DB trigger
                  is what actually enforces it, since min is trivially bypassed. */}
              <input
                id="enroll-date"
                type="date"
                min={todayLocal()}
                value={form.date}
                onChange={(e) => set("date", e.target.value)}
                className={inputCls}
                style={{
                  borderColor: errors.when ? "var(--color-danger-500)" : "var(--color-neutral-200)",
                }}
              />
            </div>
            <div className="flex flex-col gap-2">
              <label
                htmlFor="enroll-time"
                className="text-[13px] font-semibold"
                style={{ color: "var(--color-neutral-600)" }}
              >
                {t("landing.enrollTime")}
              </label>
              <input
                id="enroll-time"
                type="time"
                value={form.time}
                onChange={(e) => set("time", e.target.value)}
                className={inputCls}
                style={{
                  borderColor: errors.when ? "var(--color-danger-500)" : "var(--color-neutral-200)",
                }}
              />
            </div>
          </div>
        )}

        {errors.when ? (
          <p
            role="alert"
            className="text-[13px] font-medium"
            style={{ color: "var(--color-danger-500)" }}
          >
            {errors.when}
          </p>
        ) : null}
      </fieldset>

      {submitError ? (
        <p
          role="alert"
          className="rounded-2xl px-4 py-3 text-[14px] font-medium"
          style={{ backgroundColor: "#FCE9E6", color: "#94291A" }}
        >
          {submitError}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={status === "sending"}
        className="pk-press pk-shine mt-1 inline-flex h-14 w-full items-center justify-center gap-2 rounded-2xl text-[16px] font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-brand-500)] focus-visible:ring-offset-2 disabled:cursor-not-allowed"
        style={{
          backgroundColor:
            status === "sending" ? "var(--color-neutral-200)" : "var(--color-brand-500)",
          color: status === "sending" ? "var(--color-neutral-400)" : "#fff",
          boxShadow: status === "sending" ? "none" : "0 10px 26px -10px rgba(18,113,90,.5)",
        }}
      >
        {status === "sending" ? t("landing.enrollSending") : t("landing.enrollSubmit")}
        {status === "sending" ? null : (
          <ArrowRight size={17} strokeWidth={2.4} aria-hidden="true" />
        )}
      </button>

      <p className="text-[13px] leading-relaxed" style={{ color: "var(--color-neutral-400)" }}>
        {t("landing.enrollNote")}
      </p>
    </form>
  );
}

/** Page chrome for /enroll — mirrors the auth screens so the funnel feels continuous. */
export function EnrollPage() {
  const { t } = useTranslation("auth");
  return (
    <div className="min-h-screen" style={{ backgroundColor: "var(--color-neutral-50)" }}>
      <header className="border-b" style={{ borderColor: "var(--color-neutral-200)" }}>
        <div className="mx-auto flex h-[72px] max-w-2xl items-center justify-between px-5">
          <Link href="/" className="flex items-center gap-2.5">
            <span
              className="flex h-9 w-9 items-center justify-center rounded-[11px]"
              style={{ color: "#fff" }}
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
              className="text-[20px] font-extrabold tracking-[-0.03em]"
              style={{ color: "var(--color-neutral-900)" }}
            >
              Parisar
            </span>
          </Link>
          <Link
            href="/"
            className="pk-press inline-flex items-center gap-1.5 rounded-full px-3.5 py-2 text-[14px] font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-brand-500)]"
            style={{ color: "var(--color-neutral-600)" }}
          >
            <ArrowLeft size={15} strokeWidth={2.4} aria-hidden="true" />
            {t("landing.enrollBack")}
          </Link>
        </div>
      </header>

      <main className="mx-auto w-full max-w-2xl px-5 py-12 sm:py-16">
        <h1
          className="pk-in text-[32px] font-extrabold leading-[1.1] tracking-[-0.035em] sm:text-[38px]"
          style={{ color: "var(--color-neutral-900)" }}
        >
          {t("landing.enrollTitle")}
        </h1>
        <p
          className="pk-in mt-4 max-w-xl text-[16px] leading-relaxed"
          style={{ color: "var(--color-neutral-600)", "--d": "90ms" }}
        >
          {t("landing.enrollLead")}
        </p>
        <div className="pk-in mt-10" style={{ "--d": "180ms" }}>
          <EnrollForm />
        </div>
      </main>
    </div>
  );
}
