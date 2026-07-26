"use client";

import { Check, CheckCircle2, Copy } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useSetupState } from "../../lib/setup-state";

/**
 * Step 6 — Share Society Code.
 *
 * Displays the society code in monospace large text.
 * Copy: navigator.clipboard.writeText → label flips to "Copied!" for 2s.
 * WhatsApp: <a href="https://wa.me/?text=..."> (NOT window.open — popup-blocker safe).
 * "Go to Dashboard": router.push('/dashboard').
 */
export default function CodeShare() {
  const { t } = useTranslation("auth");
  const router = useRouter();
  const setupStore = useSetupState();
  const code = setupStore.code ?? "----";

  const [copied, setCopied] = useState(false);

  function handleCopy() {
    if (typeof navigator !== "undefined" && navigator.clipboard) {
      navigator.clipboard.writeText(code).catch(() => {});
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  // Build WhatsApp deep-link
  const appUrl =
    (typeof process !== "undefined" && process.env.NEXT_PUBLIC_APP_URL) || "http://localhost:3000";
  const joinLink = `${appUrl}/join?code=${code}`;
  const shareText = (
    t("setup.shareMessage") ??
    "Hi! Join our society on Parisar — tap this link and enter your flat details: {{link}}"
  ).replace("{{link}}", joinLink);
  const waUrl = `https://wa.me/?text=${encodeURIComponent(shareText)}`;

  return (
    <div className="bg-[var(--color-neutral-0)] rounded-2xl shadow-sm p-6 flex flex-col items-center gap-6 text-center">
      {/* Success icon */}
      <CheckCircle2 size={48} className="text-[var(--color-success,#047857)]" />

      {/* Heading + body */}
      <div className="flex flex-col gap-2">
        <h2 className="text-[28px] font-semibold text-[var(--color-neutral-900)] leading-tight">
          {t("setup.step6.heading")}
        </h2>
        <p className="text-base text-[var(--color-neutral-600)] leading-relaxed">
          {t("setup.step6.body")}
        </p>
      </div>

      {/* Code display block */}
      <div className="w-full bg-[var(--color-neutral-100)] rounded-2xl p-6 flex flex-col items-center gap-4">
        <span
          className="font-mono text-[28px] font-semibold tracking-widest text-[var(--color-brand-500)]"
          aria-label={`Society code: ${code}`}
        >
          {code}
        </span>

        {/* Copy button */}
        <button
          type="button"
          onClick={handleCopy}
          className={[
            "flex items-center gap-2 h-10 px-4 rounded-lg border text-sm font-medium transition-all",
            copied
              ? "border-[var(--color-success,#047857)] text-[var(--color-success,#047857)]"
              : "border-[var(--color-neutral-200)] text-[var(--color-neutral-900)] hover:bg-[var(--color-neutral-50)]",
          ].join(" ")}
        >
          {copied ? (
            <>
              <Check size={16} />
              {/* PAR-072: role="status" so the copy confirmation is ANNOUNCED —
                  a purely visual label change is invisible to screen readers. */}
              <span role="status">{t("setup.step6.copied")}</span>
            </>
          ) : (
            <>
              <Copy size={16} />
              {t("setup.step6.copyCode")}
            </>
          )}
        </button>
      </div>

      {/* WhatsApp share link — <a> not window.open (popup-blocker safe) */}
      <a
        href={waUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="flex items-center justify-center gap-3 w-full h-12 rounded-xl bg-[#16a34a] text-white text-base font-semibold hover:opacity-90 transition-opacity"
      >
        {/* Inline WhatsApp logo SVG */}
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          width="20"
          height="20"
          fill="white"
          aria-hidden="true"
        >
          <path d="M12.04 2c-5.46 0-9.91 4.45-9.91 9.91 0 1.75.46 3.45 1.32 4.95L2.05 22l5.25-1.38c1.45.79 3.08 1.21 4.74 1.21 5.46 0 9.91-4.45 9.91-9.91 0-2.65-1.03-5.14-2.9-7.01A9.816 9.816 0 0 0 12.04 2zm.01 1.67c2.2 0 4.26.86 5.82 2.42a8.22 8.22 0 0 1 2.41 5.83c0 4.54-3.7 8.23-8.24 8.23-1.48 0-2.93-.39-4.19-1.15l-.3-.18-3.12.82.83-3.04-.2-.32a8.19 8.19 0 0 1-1.26-4.36c.01-4.54 3.7-8.25 8.25-8.25zM8.53 7.33c-.16 0-.43.06-.66.31-.22.25-.87.86-.87 2.07 0 1.22.89 2.39 1 2.56.14.17 1.76 2.67 4.25 3.73.59.27 1.05.42 1.41.54.59.19 1.13.16 1.56.1.48-.07 1.46-.6 1.67-1.18.21-.58.21-1.07.15-1.18s-.22-.16-.47-.28c-.25-.12-1.47-.72-1.69-.8-.23-.08-.37-.12-.56.12-.16.25-.64.8-.78.97-.15.16-.29.18-.54.06-.25-.13-1.05-.39-1.99-1.23-.74-.66-1.23-1.47-1.38-1.72-.14-.25-.02-.38.11-.51.11-.11.25-.29.37-.44.13-.14.17-.25.25-.41.08-.17.04-.31-.02-.43-.06-.11-.56-1.35-.77-1.84-.2-.48-.4-.42-.56-.43-.14 0-.3-.01-.47-.01z" />
        </svg>
        {t("setup.step6.shareWhatsApp")}
      </a>

      {/* Go to Dashboard */}
      <button
        type="button"
        onClick={() => router.push("/dashboard")}
        className="w-full h-12 rounded-xl border border-[var(--color-neutral-200)] text-[var(--color-neutral-900)] text-base font-medium hover:bg-[var(--color-neutral-50)] transition-colors"
      >
        {t("setup.step6.goToDashboard")}
      </button>
    </div>
  );
}
