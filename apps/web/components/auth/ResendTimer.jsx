"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

// 60s countdown. Shows resend link when timer expires.
// Props: onResend (fn)

const RESEND_DELAY_SECONDS = 60;

export default function ResendTimer({ onResend }) {
  const { t } = useTranslation("auth");
  const [secondsLeft, setSecondsLeft] = useState(RESEND_DELAY_SECONDS);
  const [resending, setResending] = useState(false);

  useEffect(() => {
    if (secondsLeft <= 0) return;
    const id = setInterval(() => setSecondsLeft((s) => s - 1), 1000);
    return () => clearInterval(id);
  }, [secondsLeft]);

  const handleResend = useCallback(async () => {
    setResending(true);
    try {
      await onResend?.();
    } finally {
      setResending(false);
      setSecondsLeft(RESEND_DELAY_SECONDS);
    }
  }, [onResend]);

  const formatTime = (s) => {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m}:${sec.toString().padStart(2, "0")}`;
  };

  if (resending) {
    return (
      <p className="text-sm text-[var(--color-neutral-400)] leading-snug">
        {/* Resending… */}
        Resending...
      </p>
    );
  }

  if (secondsLeft > 0) {
    return (
      <p className="text-sm text-[var(--color-neutral-400)] leading-snug">
        {t("auth.resendIn", { time: formatTime(secondsLeft) })}
      </p>
    );
  }

  return (
    <button
      type="button"
      onClick={handleResend}
      className="text-sm font-semibold text-[var(--color-brand-500)] underline-offset-2 hover:underline text-left"
    >
      {t("auth.resendOtp")}
    </button>
  );
}
