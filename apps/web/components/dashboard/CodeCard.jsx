"use client";

import { resumeSocietyCode } from "@parisar/api-client";
import { AlertTriangle, Copy, Share2 } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { SurfaceCard } from "@/components/kit";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

/**
 * CodeCard — Society Code display card for the Secretary web dashboard.
 *
 * Props:
 *   code       {string|null}   the current society code (e.g. "PAR7-XKM2")
 *   societyId  {string}        the society UUID
 *   paused     {boolean}       true iff society_codes.paused_at is non-null
 *   onResume   {Function}      called after a successful inline resume
 */
export function CodeCard({ code, societyId, paused = false, onResume }) {
  const { t } = useTranslation(["auth", "dashboard"]);
  const [copied, setCopied] = useState(false);
  const [resuming, setResuming] = useState(false);
  const [resumeError, setResumeError] = useState(null);

  // ---------------------------------------------------------------------------
  // Copy via Clipboard API
  // ---------------------------------------------------------------------------
  async function handleCopy() {
    if (!code) return;
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard API unavailable (e.g. non-HTTPS dev) — silent
    }
  }

  // ---------------------------------------------------------------------------
  // Share via WhatsApp anchor (per UI-SPEC: anchor href, not window.open)
  // ---------------------------------------------------------------------------
  const joinUrl = code ? `https://parisar.app/join?code=${code}` : "";
  const shareMessage = t("setup.shareMessage", {
    link: joinUrl,
    defaultValue: `Join our society on Parisar: ${joinUrl}`,
  });
  const waUrl = `https://wa.me/?text=${encodeURIComponent(shareMessage)}`;

  // ---------------------------------------------------------------------------
  // Inline resume (shortcut — avoids navigating to /dashboard/code-rotation)
  // ---------------------------------------------------------------------------
  async function handleResume() {
    if (!societyId || resuming) return;
    setResuming(true);
    setResumeError(null);
    try {
      const supabase = createSupabaseBrowserClient();
      await resumeSocietyCode(supabase, { societyId });
      if (onResume) onResume();
    } catch (err) {
      setResumeError(err?.message ?? "Failed to resume code. Please try again.");
    } finally {
      setResuming(false);
    }
  }

  // ---------------------------------------------------------------------------
  // Paused state — amber alert replaces normal code display
  // ---------------------------------------------------------------------------
  if (paused) {
    return (
      <SurfaceCard className="p-6">
        <h3 className="mb-4 text-[17px] font-extrabold tracking-[-0.02em] text-[var(--color-neutral-900)]">
          {t("dashboard.code.heading")}
        </h3>

        {/* Warning block — the off-system amber-500/amber-50 pairing is now the
            --color-warning token on its own soft tint. */}
        <div
          className="mb-4 flex items-start gap-3 rounded-[14px] border p-4"
          style={{ borderColor: "var(--color-warning)", backgroundColor: "#FDF0DF" }}
        >
          <AlertTriangle
            size={18}
            className="mt-0.5 shrink-0"
            style={{ color: "var(--color-warning)" }}
            aria-hidden="true"
          />
          <p className="text-sm leading-relaxed text-[var(--color-neutral-600)]">
            {t("dashboard.code.pausedAlert")}
          </p>
        </div>

        {resumeError && (
          <p className="mb-3 text-sm text-[var(--color-danger)]" role="alert">
            {resumeError}
          </p>
        )}

        {/* Resume Code — outlined warning */}
        <button
          type="button"
          onClick={handleResume}
          disabled={resuming}
          className="pk-press h-11 w-full rounded-[14px] border text-sm font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-brand-500)] focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
          style={{ borderColor: "var(--color-warning)", color: "var(--color-warning)" }}
        >
          {resuming ? "Resuming…" : t("codeRotation.resume")}
        </button>
      </SurfaceCard>
    );
  }

  // ---------------------------------------------------------------------------
  // Active state — normal code display
  // ---------------------------------------------------------------------------
  return (
    <SurfaceCard className="p-6">
      <h3 className="mb-4 text-[17px] font-extrabold tracking-[-0.02em] text-[var(--color-neutral-900)]">
        {t("dashboard.code.heading")}
      </h3>

      {/* Code display — the code is the hero of this card, so it gets a brand
          tint, real size and generous letter-spacing instead of a grey chip. */}
      <div
        className="mb-4 rounded-[14px] px-3 py-4 text-center"
        style={{ backgroundColor: "var(--color-brand-50)" }}
      >
        <span
          className="select-all font-mono text-[26px] font-extrabold tracking-[0.18em] text-[var(--color-brand-600)]"
          aria-label={`Society code: ${code ?? "not loaded"}`}
        >
          {code ?? "—"}
        </span>
      </div>

      {/* Copy + Share buttons */}
      <div className="mb-4 flex gap-3">
        {/* Copy */}
        <button
          type="button"
          onClick={handleCopy}
          className="pk-press flex h-10 flex-1 items-center justify-center gap-1.5 rounded-[12px] border border-[var(--color-neutral-200)] text-sm font-semibold text-[var(--color-neutral-600)] transition-colors hover:bg-[var(--color-neutral-100)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-brand-500)] focus-visible:ring-offset-2"
          aria-label="Copy society code"
        >
          <Copy size={16} aria-hidden="true" />
          {/* PAR-072: role="status" so the copy confirmation is announced to
              screen readers, not just shown visually. */}
          {copied ? (
            <span role="status">{t("setup.step6.copied")}</span>
          ) : (
            t("setup.step6.copyCode")
          )}
        </button>

        {/* Share via WhatsApp — anchor tag per UI-SPEC (no window.open) */}
        <a
          href={waUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="pk-press flex h-10 flex-1 items-center justify-center gap-1.5 rounded-[12px] border border-[var(--color-neutral-200)] text-sm font-semibold text-[var(--color-neutral-600)] transition-colors hover:bg-[var(--color-neutral-100)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-brand-500)] focus-visible:ring-offset-2"
          aria-label="Share society code via WhatsApp"
        >
          <Share2 size={16} aria-hidden="true" />
          {t("setup.step6.shareWhatsApp")}
        </a>
      </div>

      {/* Rotate Code link */}
      <div className="text-center">
        <Link
          href="/dashboard/code-rotation"
          className="pk-ul rounded text-sm font-semibold text-[var(--color-danger)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-danger)] focus-visible:ring-offset-2"
        >
          {t("dashboard.code.rotateLink")}
        </Link>
      </div>
    </SurfaceCard>
  );
}
