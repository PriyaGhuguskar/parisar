"use client";

// Sign-in, step 1: phone only. We ALWAYS send an OTP; /verify then asks the
// database (my_login_state, as the just-verified user) what comes next:
//
//   staff   -> OTP -> in
//   pin     -> OTP -> enter PIN -> in            (returning resident)
//   setpin  -> OTP -> set a PIN -> in            (onboarded, no PIN yet)
//   family  -> OTP -> claim flat -> set PIN -> in (pre-entered family member)
//   code    -> OTP -> society code -> onboard     (brand-new resident)
//
// WHY NOTHING IS LOOKED UP BEFORE THE OTP: a pre-OTP lookup tells anyone who
// types a number whether it belongs to staff, a guard or an authority. Deciding
// after the OTP means only the number's owner ever learns that.

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { useTranslation } from "react-i18next";
import AuthShell from "../../../components/auth/AuthShell";
import DevOtpHint from "../../../components/auth/DevOtpHint";
import FormError from "../../../components/auth/FormError";
import PhoneInput from "../../../components/auth/PhoneInput";
import PrimaryButton from "../../../components/auth/PrimaryButton";
import { safeNextPath } from "../../../lib/auth/loginMode";
import { otpErrorCode, otpErrorKey } from "../../../lib/auth/otpErrors";
import { createSupabaseBrowserClient } from "../../../lib/supabase/client";

function LoginForm() {
  const { t } = useTranslation("auth");
  const router = useRouter();
  const params = useSearchParams();
  // Where the middleware was sending them before it bounced them to /login.
  const next = safeNextPath(params.get("next"), "");

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
      // Send the OTP for every path. verifyOtp runs client-side on /verify so
      // the session cookie lands in the browser (RESEARCH.md Pitfall 2).
      const supabase = createSupabaseBrowserClient();
      const { error: otpErr } = await supabase.auth.signInWithOtp({ phone: `+91${phone}` });
      if (otpErr) {
        setError(t(otpErrorKey(otpErrorCode(otpErr))));
        setLoading(false);
        return;
      }

      // "Forgot PIN?" adds reset=1 so /verify skips the enter-PIN screen and
      // goes straight to setting a new PIN (the fresh OTP authorises it).
      const q = new URLSearchParams({ phone: `+91${phone}` });
      if (forgot) q.set("reset", "1");
      if (next) q.set("next", next);
      router.push(`/verify?${q.toString()}`);
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
            // min-h-11 + px-3: the text is only 20px tall on its own, well under
            // the 44px touch target a thumb needs. Padding grows the hit area
            // without changing how the link looks.
            className="-mx-3 inline-flex min-h-11 items-center justify-center self-center px-3 text-[13px] font-semibold text-[var(--color-brand-600)] hover:underline"
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

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}
