"use client";

import { revealPhone } from "@parisar/api-client";
import { Eye, EyeOff, Phone } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

/**
 * PhonePrivacyChip — inline phone reveal with 4s confirm window + 15s auto-revert.
 *
 * State machine: hidden → confirming (4s auto-revert) → revealing → revealed (15s) → hidden
 *                                                      → error (2s) → hidden
 *
 * Props:
 *   targetUserId  {string}  ID of the profile whose phone to reveal
 *
 * All phone reveals go through the revealPhone() RPC which writes an audit log entry.
 *
 * VISUAL NOTE: a hidden number is a privacy DECISION, not a missing value, so the
 * hidden state is a real bordered control rather than grey filler text. The confirm
 * step gets its own amber surface so "about to reveal" can never be mistaken for
 * "revealed" — the reveal is audited, and the user should feel that.
 */
export function PhonePrivacyChip({ targetUserId }) {
  const { t } = useTranslation("auth");
  // 'hidden' | 'confirming' | 'revealing' | 'revealed' | 'error'
  const [state, setState] = useState("hidden");
  const [phone, setPhone] = useState(null);
  const timersRef = useRef([]);

  // Cleanup all pending timers on unmount
  useEffect(() => {
    return () => {
      timersRef.current.forEach(clearTimeout);
    };
  }, []);

  function pushTimer(t) {
    timersRef.current.push(t);
  }

  function tapHidden() {
    setState("confirming");
    // Auto-revert confirming → hidden after 4s if no action
    pushTimer(
      setTimeout(() => {
        setState((s) => (s === "confirming" ? "hidden" : s));
      }, 4000),
    );
  }

  async function tapYes() {
    setState("revealing");
    try {
      const supabase = createSupabaseBrowserClient();
      const p = await revealPhone(supabase, targetUserId);
      setPhone(p);
      setState("revealed");
      // Auto-revert revealed → hidden after 15s
      pushTimer(
        setTimeout(() => {
          setState("hidden");
          setPhone(null);
        }, 15000),
      );
    } catch {
      setState("error");
      pushTimer(setTimeout(() => setState("hidden"), 2000));
    }
  }

  const FOCUS =
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-brand-500)] focus-visible:ring-offset-2";

  if (state === "hidden") {
    return (
      <button
        type="button"
        onClick={tapHidden}
        className={`pk-press inline-flex items-center gap-1.5 rounded-full border border-[var(--color-neutral-200)] bg-[var(--color-neutral-0)] px-3 py-1.5 text-[13px] font-semibold text-[var(--color-neutral-400)] transition-colors hover:border-[var(--color-brand-500)] hover:bg-[var(--color-brand-50)] hover:text-[var(--color-brand-600)] ${FOCUS}`}
        aria-label={`${t("directory.phoneHidden")}. Press to reveal.`}
      >
        <EyeOff size={15} strokeWidth={2.1} aria-hidden="true" />
        <span>{t("directory.phoneHidden")}</span>
      </button>
    );
  }

  if (state === "confirming") {
    return (
      <div
        className="pk-in inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[13px]"
        style={{ borderColor: "var(--color-warning)", backgroundColor: "#FDF0DF" }}
      >
        <span className="font-semibold" style={{ color: "#8A4708" }}>
          {t("directory.phoneRevealConfirm")}
        </span>
        <button
          type="button"
          onClick={tapYes}
          className={`rounded-full px-2 py-0.5 font-bold text-[var(--color-brand-700)] transition-colors hover:bg-[var(--color-brand-50)] ${FOCUS}`}
        >
          {t("directory.phoneRevealYes")}
        </button>
        <button
          type="button"
          onClick={() => setState("hidden")}
          className={`rounded-full px-2 py-0.5 font-semibold text-[var(--color-neutral-600)] transition-colors hover:bg-[var(--color-neutral-100)] ${FOCUS}`}
        >
          {t("directory.phoneRevealNo")}
        </button>
      </div>
    );
  }

  if (state === "revealing") {
    return (
      <span
        className="inline-flex items-center gap-1.5 rounded-full border border-[var(--color-neutral-200)] bg-[var(--color-neutral-0)] px-3 py-1.5 text-[13px] text-[var(--color-neutral-400)]"
        aria-live="polite"
      >
        <span
          aria-hidden="true"
          className="h-3.5 w-3.5 animate-pulse rounded-full bg-[var(--color-neutral-100)]"
        />
        …
      </span>
    );
  }

  if (state === "revealed") {
    return (
      <span
        className="pk-in inline-flex items-center gap-1.5 rounded-full border border-[var(--color-brand-500)] bg-[var(--color-brand-50)] px-3 py-1.5 text-[13px] font-bold tabular-nums text-[var(--color-brand-700)]"
        aria-live="polite"
      >
        <Phone size={14} strokeWidth={2.2} aria-hidden="true" />
        {phone}
        <Eye size={14} strokeWidth={2.2} aria-hidden="true" className="opacity-60" />
      </span>
    );
  }

  // error state
  return (
    <span
      className="inline-flex items-center rounded-full border px-3 py-1.5 text-[13px] font-semibold text-[var(--color-danger)]"
      style={{ borderColor: "var(--color-danger)", backgroundColor: "#FCE9E6" }}
      role="alert"
    >
      Reveal failed
    </span>
  );
}
