"use client";

import { CheckCircle2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useJoinState } from "../../../../lib/join-state";

/**
 * /join/success — Join confirmed screen.
 *
 * Shown when joinBySocietyCode returns status='active'.
 * If autoElevatedToCoSecretary is true, shows a small Co-Secretary chip.
 */
export default function JoinSuccessPage() {
  const { t } = useTranslation("auth");
  const router = useRouter();
  const joinStore = useJoinState();
  const { joinResult, society } = joinStore;

  // Guard: missing state → back to code
  useEffect(() => {
    if (!joinResult || joinResult.status !== "active") {
      router.replace("/join/code");
    }
    // Clear store on mount so re-visiting doesn't show stale data
    return () => {
      joinStore.reset();
    };
  }, []);

  if (!joinResult || joinResult.status !== "active") {
    return null;
  }

  const societyName = joinResult.societyName ?? society?.name ?? "";
  const { autoElevatedToCoSecretary } = joinResult;

  // Build body copy with interpolations
  // Note: name is not tracked in joinResult — use the society name as a fallback label
  const bodyText = t("join.success.body", { societyName, name: "" });

  return (
    <div className="flex justify-center px-4 py-12">
      <div className="w-full max-w-sm flex flex-col items-center gap-6">
        {/* Success icon */}
        <CheckCircle2 size={64} color="#047857" />

        {/* Heading */}
        <h1 className="text-[28px] font-semibold text-[var(--color-neutral-900)] text-center leading-tight">
          {t("join.success.heading")}
        </h1>

        {/* Body */}
        <p className="text-base text-[var(--color-neutral-600)] text-center leading-relaxed">
          {bodyText}
        </p>

        {/* Co-Secretary chip (English-only for Phase 3; Phase 7 will i18n this) */}
        {autoElevatedToCoSecretary && (
          <div
            className="rounded-xl px-4 py-3 border"
            style={{
              backgroundColor: "var(--color-brand-50)",
              borderColor: "var(--color-brand-200)",
            }}
          >
            <p
              className="text-sm font-medium text-center"
              style={{ color: "var(--color-brand-500)" }}
            >
              You've been added as Co-Secretary.
            </p>
          </div>
        )}

        {/* Go to Dashboard */}
        <button
          onClick={() => router.push("/dashboard")}
          className="h-12 w-full rounded-xl font-semibold text-base text-white hover:opacity-90 transition-opacity"
          style={{ backgroundColor: "var(--color-brand-500)" }}
        >
          {t("join.success.cta")}
        </button>
      </div>
    </div>
  );
}
