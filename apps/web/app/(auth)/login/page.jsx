"use client";

// Sign-in, step 1: phone only. We ALWAYS send an OTP, then /verify decides what
// to ask for next based on who this number is.
//
//   staff   -> OTP -> in
//   pin     -> OTP -> enter PIN -> in            (returning resident)
//   setpin  -> OTP -> set a PIN -> in            (onboarded, no PIN yet)
//   family  -> OTP -> claim flat -> set PIN -> in (pre-entered family member)
//   code    -> OTP -> society code -> onboard     (brand-new resident)
//
// WHY OTP EVERY TIME: the OTP proves the person holds the number on every login,
// and the PIN is a second factor on top. This is a deliberate choice — it costs
// one SMS per login but removes any way to reach an account without the live
// number. lookupPhone still never reveals whether a number is registered; the
// mode only changes what the NEXT screen asks for, after the OTP is already sent.

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import AuthShell from "../../../components/auth/AuthShell";
import DevOtpHint from "../../../components/auth/DevOtpHint";
import FormError from "../../../components/auth/FormError";
import PhoneInput from "../../../components/auth/PhoneInput";
import PrimaryButton from "../../../components/auth/PrimaryButton";
import { createSupabaseBrowserClient } from "../../../lib/supabase/client";
import { lookupPhone } from "../../actions/codeLogin";

export default function LoginPage() {
  const { t } = useTranslation("auth");
  const router = useRouter();

  const [phone, setPhone] = useState("");
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  // "Forgot PIN?" entry — same phone+OTP step, but /verify skips the enter-PIN
  // screen and goes straight to setting a new one (carried via ?reset=1).
  const [forgot, setForgot] = useState(false);

  async function onSubmit(e) {
    e.preventDefault();
    setError(null);
    if (!/^[6-9]\d{9}$/.test(phone)) {
      setError(t("auth.invalidPhone"));
      return;
    }
    setLoading(true);
    try {
      const res = await lookupPhone(phone);
      if (res?.error) {
        setError(t("auth.networkError"));
        setLoading(false);
        return;
      }

      // Send the OTP for every path. verifyOtp runs client-side on /verify so
      // the session cookie lands in the browser (RESEARCH.md Pitfall 2).
      const supabase = createSupabaseBrowserClient();
      const { error: otpErr } = await supabase.auth.signInWithOtp({ phone: `+91${phone}` });
      if (otpErr) {
        setError(t(otpErr.status === 429 ? "auth.rateLimited" : "auth.networkError"));
        setLoading(false);
        return;
      }

      // The mode tells /verify what to ask for after the OTP succeeds. When the
      // user came in via "Forgot PIN?", add reset=1 so /verify skips the
      // enter-PIN screen and goes straight to setting a new PIN.
      const resetFlag = forgot ? "&reset=1" : "";
      router.push(
        `/verify?phone=${encodeURIComponent(`+91${phone}`)}&mode=${encodeURIComponent(res.mode)}${resetFlag}`,
      );
    } catch {
      setError(t("auth.networkError"));
      setLoading(false);
    }
  }

  return (
    <AuthShell>
      <div className="flex flex-col gap-6">
        {/* DEV-ONLY OTP hint (no-op in production builds) */}
        <DevOtpHint />

        <div className="flex flex-col gap-2">
          <h2 className="text-[30px] font-extrabold leading-[1.12] tracking-[-0.03em] text-[var(--color-neutral-900)]">
            {forgot ? t("auth.pinResetTitle") : t("auth.enterPhone")}
          </h2>
          <p className="text-[15px] leading-relaxed text-[var(--color-neutral-600)]">
            {forgot ? t("auth.pinResetLead") : t("auth.sendOtpExplainer")}
          </p>
        </div>

        <form onSubmit={onSubmit} className="flex flex-col gap-5">
          <div className="flex flex-col gap-2">
            <PhoneInput value={phone} onChange={setPhone} hasError={!!error} />
            <FormError message={error} />
          </div>
          <PrimaryButton
            type="submit"
            label={loading ? t("auth.sending") : t("auth.sendOtp")}
            loading={loading}
            disabled={phone.length !== 10}
          />
          <button
            type="button"
            onClick={() => {
              setError(null);
              setForgot((v) => !v);
            }}
            className="self-center text-[13px] font-semibold text-[var(--color-brand-600)] hover:underline"
          >
            {forgot ? t("auth.pinResetCancel") : t("auth.pinForgot")}
          </button>
        </form>
      </div>

      <p className="text-center text-sm leading-snug text-[var(--color-neutral-400)]">
        {t("auth.termsNote")}
      </p>
    </AuthShell>
  );
}
