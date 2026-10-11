import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Text, TouchableOpacity } from "react-native";

const COUNTDOWN_SECONDS = 60;

/**
 * 60s countdown resend timer.
 * - Counting: shows auth.resendIn with {{time}} replaced (format M:SS)
 * - Expired: tappable auth.resendOtp link in brand.500
 * - Resending: shows auth.sending text, not tappable
 */
export function ResendTimer({ onResend }) {
  const { t } = useTranslation("auth");
  const [secondsLeft, setSecondsLeft] = useState(COUNTDOWN_SECONDS);
  const [resending, setResending] = useState(false);
  const intervalRef = useRef(null);

  useEffect(() => {
    startCountdown();
    return () => clearInterval(intervalRef.current);
  }, []);

  function startCountdown() {
    setSecondsLeft(COUNTDOWN_SECONDS);
    clearInterval(intervalRef.current);
    intervalRef.current = setInterval(() => {
      setSecondsLeft((prev) => {
        if (prev <= 1) {
          clearInterval(intervalRef.current);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  }

  async function handleResend() {
    if (resending || secondsLeft > 0) return;
    setResending(true);
    try {
      await onResend?.();
      // PAR-109: only restart the countdown when the resend actually succeeded.
      // Previously `finally` restarted it even on failure/429, hiding the error
      // behind a fresh timer.
      startCountdown();
    } catch {
      // The caller surfaces the message; leave the link tappable so the user
      // can retry immediately instead of waiting out a countdown that did nothing.
    } finally {
      setResending(false);
    }
  }

  function formatTime(seconds) {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${String(s).padStart(2, "0")}`;
  }

  if (resending) {
    return <Text className="text-sm text-neutral-400">{t("auth.sending")}</Text>;
  }

  if (secondsLeft > 0) {
    const timeStr = formatTime(secondsLeft);
    const label = t("auth.resendIn", { time: timeStr });
    return <Text className="text-sm text-neutral-400">{label}</Text>;
  }

  return (
    <TouchableOpacity onPress={handleResend} accessibilityRole="button">
      <Text className="text-sm font-semibold text-brand-500 underline">{t("auth.resendOtp")}</Text>
    </TouchableOpacity>
  );
}
