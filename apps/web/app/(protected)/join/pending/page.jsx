"use client";

import { Clock } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useJoinState } from "../../../../lib/join-state";

/**
 * /join/pending — Join under review screen.
 *
 * Shown when joinBySocietyCode returns status='pending_review' (duplicate flat).
 *
 * DESIGN NOTE (Pitfall 5):
 * This is NOT an error state. The member has successfully submitted their join
 * request; it is pending Secretary review. All styling uses warning.500 amber
 * (#f59e0b) — NO danger.500 red anywhere on this page.
 */
export default function JoinPendingPage() {
  const { t } = useTranslation("auth");
  const router = useRouter();
  const joinStore = useJoinState();
  const { joinResult } = joinStore;

  // Guard: missing state → back to code
  useEffect(() => {
    if (!joinResult || joinResult.status !== "pending_review") {
      router.replace("/join/code");
    }
    return () => {
      joinStore.reset();
    };
  }, []);

  if (!joinResult || joinResult.status !== "pending_review") {
    return null;
  }

  const { flatNumber } = joinResult;

  // Build body copy with interpolation
  const bodyText = t("join.pending.body", { flatNumber: flatNumber ?? "" });

  return (
    <div className="flex justify-center px-4 py-12">
      <div className="w-full max-w-sm flex flex-col items-center gap-6">
        {/* Amber clock icon — warning, NOT danger/error */}
        <Clock size={64} color="#f59e0b" />

        {/* Heading */}
        <h1 className="text-[28px] font-semibold text-[var(--color-neutral-900)] text-center leading-tight">
          {t("join.pending.heading")}
        </h1>

        {/* Body */}
        <p className="text-base text-[var(--color-neutral-600)] text-center leading-relaxed">
          {bodyText}
        </p>

        {/* Info paragraph */}
        <p className="text-sm text-[var(--color-neutral-600)] text-center leading-relaxed">
          {t("join.pending.info")}
        </p>

        {/* "Go to Society" — secondary outlined button (warning accent, NOT red) */}
        <button
          onClick={() => router.push("/dashboard")}
          className="h-12 w-full rounded-xl font-semibold text-base transition-colors border"
          style={{
            borderColor: "var(--color-neutral-200)",
            backgroundColor: "var(--color-neutral-0)",
            color: "var(--color-neutral-900)",
          }}
        >
          {t("join.pending.cta")}
        </button>
      </div>
    </div>
  );
}
