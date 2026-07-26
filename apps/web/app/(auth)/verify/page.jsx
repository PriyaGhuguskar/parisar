"use client";

// Verify OTP, then branch by the `mode` the login screen decided:
//
//   staff  -> in
//   pin    -> enter existing PIN (second factor) -> in
//   setpin -> set a new PIN -> in           (onboarded, no PIN yet)
//   family -> claim the flat a resident pre-entered -> set a PIN -> in
//   code   -> brand-new resident -> /onboard (society code + join)
//
// OTP is what proves the person on every login; the PIN is a second factor on
// top. verifyOtp runs on the browser client so the session cookie lands here
// (RESEARCH.md Pitfall 2). The PIN is checked with signInWithPassword against the
// real stored credential — a wrong PIN does not get in even though the OTP
// already succeeded.

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { useTranslation } from "react-i18next";
import AuthShell from "../../../components/auth/AuthShell";
import DevOtpHint from "../../../components/auth/DevOtpHint";
import FormError from "../../../components/auth/FormError";
import OtpInput from "../../../components/auth/OtpInput";
import PrimaryButton from "../../../components/auth/PrimaryButton";
import ResendTimer from "../../../components/auth/ResendTimer";
import { derivePinSecret } from "../../../lib/auth/pinSecret";
import { createSupabaseBrowserClient } from "../../../lib/supabase/client";
import { claimChairman, claimFamilyMember, setPin as setPinAction } from "../../actions/codeLogin";

const PIN_FIELD =
  "h-14 w-full rounded-2xl border bg-[var(--color-neutral-0)] px-4 text-center text-[24px] font-bold tracking-[0.5em] outline-none transition-[border-color,box-shadow] duration-150 placeholder:tracking-[0.35em] placeholder:text-[var(--color-neutral-400)] focus:border-[var(--color-brand-500)] focus:shadow-[0_0_0_4px_color-mix(in_srgb,var(--color-brand-500)_18%,transparent)]";

function weakPin(p) {
  return p === "1234" || /^(\d)\1{3}$/.test(p); // 1234 or four identical
}

function VerifyForm() {
  const { t } = useTranslation("auth");
  const router = useRouter();
  const params = useSearchParams();
  const phone = params.get("phone") ?? "";
  const mode = params.get("mode") ?? "code";

  const [stage, setStage] = useState("otp"); // otp | pin | setpin
  const [otp, setOtp] = useState("");
  const [pin, setPin] = useState("");
  const [pin2, setPin2] = useState("");
  const [userId, setUserId] = useState(null);
  const [hasError, setHasError] = useState(false);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  function fail(key) {
    setError(t(key));
    setLoading(false);
  }

  // --- OTP ---------------------------------------------------------------
  async function onOtp(e) {
    if (e) e.preventDefault();
    if (otp.length !== 6) return;
    setLoading(true);
    setHasError(false);
    setError(null);

    try {
      const supabase = createSupabaseBrowserClient();
      const { data, error: vErr } = await supabase.auth.verifyOtp({
        phone,
        token: otp,
        type: "sms",
      });
      if (vErr) {
        const m = (vErr.message ?? "").toLowerCase();
        setError(
          t(
            m.includes("expired")
              ? "auth.otpExpired"
              : vErr.status === 429
                ? "auth.verifyRateLimited"
                : "auth.incorrectOtp",
          ),
        );
        setHasError(true);
        setOtp("");
        setLoading(false);
        return;
      }

      setUserId(data.user.id);

      if (mode === "staff") return router.push("/dashboard");
      if (mode === "code") return router.push("/onboarding");
      if (mode === "pin") {
        setStage("pin");
        setLoading(false);
        return;
      }
      if (mode === "family") {
        // Turn the pre-entered family record into a real membership, then PIN.
        const res = await claimFamilyMember(data.session?.access_token);
        if (res?.error) return fail("auth.networkError");
        setStage("setpin");
        setLoading(false);
        return;
      }
      if (mode === "chairman") {
        // Become secretary, then go straight to society setup. The PIN is the
        // LAST step, collected at the end of setup — not before it.
        const res = await claimChairman(data.session?.access_token);
        if (res?.error) return fail("auth.networkError");
        // The membership was just created — AFTER this session's JWT was minted
        // at verifyOtp. Re-mint so the Auth Hook injects society_id/role; without
        // it every RLS-scoped query on the next screen comes back empty.
        await supabase.auth.refreshSession();
        router.push(res.needsSetup ? "/setup/structure" : "/dashboard");
        return;
      }
      // setpin
      setStage("setpin");
      setLoading(false);
    } catch {
      fail("auth.networkError");
    }
  }

  // --- returning: enter existing PIN (second factor) ---------------------
  async function onPin(e) {
    e.preventDefault();
    if (!/^\d{4}$/.test(pin)) return setError(t("auth.pinWrong"));
    setLoading(true);
    setError(null);
    try {
      const supabase = createSupabaseBrowserClient();
      // Verify against the real credential — wrong PIN does not proceed.
      const { error: sErr } = await supabase.auth.signInWithPassword({
        phone,
        password: derivePinSecret(phone, pin),
      });
      if (sErr) return fail(sErr.status === 429 ? "auth.rateLimited" : "auth.pinWrong");
      router.push("/dashboard");
    } catch {
      fail("auth.networkError");
    }
  }

  // --- first PIN (setpin / family) ---------------------------------------
  async function onSetPin(e) {
    e.preventDefault();
    if (!/^\d{4}$/.test(pin)) return setError(t("auth.pinWrong"));
    if (weakPin(pin)) return setError(t("auth.setPinWeak"));
    if (pin !== pin2) return setError(t("auth.setPinMismatch"));
    setLoading(true);
    setError(null);
    try {
      const res = await setPinAction(userId, phone, pin);
      if (res?.error) return fail("auth.networkError");
      // Family claim created the membership after this JWT was minted; re-mint so
      // society_id/role land in the token before the dashboard's RLS queries run.
      const supabase = createSupabaseBrowserClient();
      await supabase.auth.refreshSession();
      router.push("/dashboard");
    } catch {
      fail("auth.networkError");
    }
  }

  // --- render ------------------------------------------------------------
  if (stage === "otp") {
    return (
      <Shell
        phone={phone}
        heading={t("auth.enterOtp")}
        sub={t("auth.otpSentTo", { phone })}
        extra={mode === "pin" ? t("auth.otpVerifyThenPin") : null}
      >
        <form onSubmit={onOtp} className="flex flex-col gap-4">
          <div className="flex flex-col gap-3">
            <OtpInput value={otp} onChange={setOtp} hasError={hasError} onComplete={setOtp} />
            <ResendTimer
              onResend={async () => {
                setOtp("");
                setError(null);
                const supabase = createSupabaseBrowserClient();
                await supabase.auth.signInWithOtp({ phone });
              }}
            />
            <FormError message={error} />
          </div>
          <PrimaryButton
            type="submit"
            label={loading ? t("auth.verifying") : t("auth.verify")}
            loading={loading}
            disabled={otp.length !== 6}
          />
        </form>
      </Shell>
    );
  }

  if (stage === "pin") {
    return (
      <Shell heading={t("auth.pinSecondFactor")} sub={t("auth.pinStepSub")}>
        <form onSubmit={onPin} className="flex flex-col gap-5">
          <div className="flex flex-col gap-2">
            <input
              // biome-ignore lint/a11y/noAutofocus: single field, opened intentionally
              autoFocus
              type="password"
              inputMode="numeric"
              autoComplete="current-password"
              maxLength={4}
              value={pin}
              onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 4))}
              placeholder="••••"
              className={PIN_FIELD}
              style={{
                borderColor: error ? "var(--color-danger-500)" : "var(--color-neutral-200)",
              }}
            />
            <FormError message={error} />
          </div>
          <PrimaryButton
            type="submit"
            label={loading ? t("auth.verifying") : t("auth.continue")}
            loading={loading}
            disabled={pin.length !== 4}
          />
          <details className="text-[13px]">
            <summary className="cursor-pointer font-semibold text-[var(--color-brand-600)]">
              {t("auth.pinForgot")}
            </summary>
            <p className="mt-2 leading-relaxed text-[var(--color-neutral-600)]">
              {t("auth.pinForgotHelp")}
            </p>
          </details>
        </form>
      </Shell>
    );
  }

  // setpin
  return (
    <Shell
      heading={t("auth.setPinTitle")}
      sub={mode === "family" ? t("auth.familyWelcome") : t("auth.setPinSub")}
    >
      <form onSubmit={onSetPin} className="flex flex-col gap-4">
        <label className="flex flex-col gap-1.5">
          <span className="text-[13px] font-bold text-[var(--color-neutral-900)]">
            {t("auth.pinLabel")}
          </span>
          <input
            // biome-ignore lint/a11y/noAutofocus: first field of the step
            autoFocus
            type="password"
            inputMode="numeric"
            autoComplete="new-password"
            maxLength={4}
            value={pin}
            onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 4))}
            placeholder="••••"
            className={PIN_FIELD}
            style={{ borderColor: error ? "var(--color-danger-500)" : "var(--color-neutral-200)" }}
          />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-[13px] font-bold text-[var(--color-neutral-900)]">
            {t("auth.setPinConfirm")}
          </span>
          <input
            type="password"
            inputMode="numeric"
            autoComplete="new-password"
            maxLength={4}
            value={pin2}
            onChange={(e) => setPin2(e.target.value.replace(/\D/g, "").slice(0, 4))}
            placeholder="••••"
            className={PIN_FIELD}
            style={{ borderColor: error ? "var(--color-danger-500)" : "var(--color-neutral-200)" }}
          />
        </label>
        <FormError message={error} />
        <PrimaryButton
          type="submit"
          label={loading ? t("auth.saving") : t("auth.setPinSave")}
          loading={loading}
          disabled={pin.length !== 4 || pin2.length !== 4}
        />
      </form>
    </Shell>
  );
}

function Shell({ heading, sub, extra, phone, children }) {
  return (
    <AuthShell>
      <div className="flex flex-col gap-6">
        <DevOtpHint phone={phone} />
        <a
          href="/login"
          className="self-start text-[13px] font-semibold text-[var(--color-neutral-600)] hover:underline"
        >
          ‹ Change number
        </a>
        <div className="flex flex-col gap-2">
          <h2 className="text-[30px] font-extrabold leading-[1.12] tracking-[-0.03em] text-[var(--color-neutral-900)]">
            {heading}
          </h2>
          <p className="text-[15px] leading-relaxed text-[var(--color-neutral-600)]">{sub}</p>
          {extra ? <p className="text-[13px] text-[var(--color-neutral-400)]">{extra}</p> : null}
        </div>
        {children}
      </div>
    </AuthShell>
  );
}

export default function VerifyPage() {
  return (
    <Suspense fallback={null}>
      <VerifyForm />
    </Suspense>
  );
}
