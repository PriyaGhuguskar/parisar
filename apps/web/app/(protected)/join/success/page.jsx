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
  const joinResult = useJoinState((s) => s.joinResult);
  const society = useJoinState((s) => s.society);
  const resetJoin = useJoinState((s) => s.reset);
  const isActive = joinResult?.status === "active";

  // Guard: missing state → back to code. The store is NOT cleared in an effect
  // cleanup: React StrictMode runs mount → cleanup → mount in development, so a
  // cleanup reset wiped the result and blanked this screen. It is cleared when
  // the user explicitly leaves (handleContinue) instead.
  useEffect(() => {
    if (!isActive) router.replace("/join/code");
  }, [isActive, router]);

  function handleContinue() {
    resetJoin();
    router.push("/dashboard");
  }

  if (!isActive) {
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

        {/* Co-Secretary chip */}
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
              {t("join.success.coSecretaryChip")}
            </p>
          </div>
        )}

        {/* Go to Dashboard */}
        <button
          type="button"
          onClick={handleContinue}
          className="h-12 w-full rounded-xl font-semibold text-base text-white hover:opacity-90 transition-opacity"
          style={{ backgroundColor: "var(--color-brand-500)" }}
        >
          {t("join.success.cta")}
        </button>
      </div>
    </div>
  );
}
