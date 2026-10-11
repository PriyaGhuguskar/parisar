"use client";

// Verify OTP, then ask the database what this person needs next
// (my_login_state() as the just-verified user → lib/auth/loginMode.js):
//
//   staff  -> in
//   pin    -> enter existing PIN (second factor) -> in
//   setpin -> set a new PIN -> in           (onboarded, no PIN yet)
//   family -> claim the flat a resident pre-entered -> set a PIN -> in
//   code   -> brand-new resident -> /onboarding (society code + join)
//
// Nothing about the number is looked up before the OTP succeeds. verifyOtp
// runs on the browser client so the session cookie lands here (RESEARCH.md
// Pitfall 2). The PIN is checked and written ONLY on the server (pinLogin /
// setMyPin): the credential is peppered, so the browser cannot compute it, and
// failures are counted and locked server-side.

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { useTranslation } from "react-i18next";
import AuthShell from "../../../components/auth/AuthShell";
import DevOtpHint from "../../../components/auth/DevOtpHint";
import FormError from "../../../components/auth/FormError";
import OtpInput from "../../../components/auth/OtpInput";
import PrimaryButton from "../../../components/auth/PrimaryButton";
import ResendTimer from "../../../components/auth/ResendTimer";
import { loginModeFromState, safeNextPath } from "../../../lib/auth/loginMode";
import { otpErrorCode, otpErrorKey } from "../../../lib/auth/otpErrors";
import { createSupabaseBrowserClient } from "../../../lib/supabase/client";
import {
  claimAuthority,
  claimFamilyMember,
  claimGuard,
  pinLogin,
  setMyPin,
} from "../../actions/codeLogin";

const PIN_FIELD =
  "h-14 w-full rounded-2xl border bg-[var(--color-neutral-0)] px-4 text-center text-[24px] font-bold tracking-[0.5em] outline-none transition-[border-color,box-shadow] duration-150 placeholder:tracking-[0.35em] placeholder:text-[var(--color-neutral-400)] focus:border-[var(--color-brand-500)] focus:shadow-[0_0_0_4px_color-mix(in_srgb,var(--color-brand-500)_18%,transparent)]";

function weakPin(p) {
  return p === "1234" || /^(\d)\1{3}$/.test(p); // 1234 or four identical
}

/** [i18n key, options] for a pinLogin error. */
function pinLoginErrorKey(res) {
  switch (res?.error) {
    case "PIN_INVALID":
    case "INVALID_INPUT":
      return ["auth.pinWrong"];
    case "LOCKED":
      return [
        "auth.pinLocked",
        {
          minutes: String(Math.max(1, Math.ceil((res.retryAfterSeconds ?? 900) / 60))),
          defaultValue: "Too many wrong PINs. Try again in {{minutes}} minutes.",
        },
      ];
    case "RATE_LIMITED":
      return ["auth.rateLimited"];
    default:
      return ["auth.networkError"];
  }
}

/** [i18n key, options] for a setMyPin error. */
function setPinErrorKey(res) {
  switch (res?.error) {
    case "WEAK_PIN":
      return ["auth.setPinWeak"];
    case "INVALID_PIN":
      return ["auth.pinWrong"];
    case "REAUTH_REQUIRED":
    case "AUTH_REQUIRED":
      return [
        "auth.reauthRequired",
        { defaultValue: "For your security, please verify your number again." },
      ];
    default:
      return ["auth.networkError"];
  }
}

function VerifyForm() {
  const { t } = useTranslation("auth");
  const router = useRouter();
  const params = useSearchParams();
  const phone = params.get("phone") ?? "";
  const resetFromUrl = params.get("reset") === "1"; // came via "Forgot PIN?"
  const nextFromUrl = safeNextPath(params.get("next"), "/dashboard");

  const [stage, setStage] = useState("otp"); // otp | resolve | pin | setpin
  const [mode, setMode] = useState(null); // decided after OTP, from the database
  const [reset, setReset] = useState(resetFromUrl); // reached setpin via "Forgot PIN?"
  const [otp, setOtp] = useState("");
  const [pin, setPin] = useState("");
  const [pin2, setPin2] = useState("");
  const [hasError, setHasError] = useState(false);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  const isGuard = mode === "guardpin" || mode === "guardclaim"; // gate-guard login
  const dest = isGuard ? "/guard" : nextFromUrl; // where PIN success lands

  function fail(key, opts) {
    setError(t(key, opts));
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
      if (vErr || !data?.user) {
        const m = (vErr?.message ?? "").toLowerCase();
        setError(
          t(
            m.includes("expired")
              ? "auth.otpExpired"
              : vErr?.status === 429
                ? "auth.verifyRateLimited"
                : "auth.incorrectOtp",
          ),
        );
        setHasError(true);
        setOtp("");
        setLoading(false);
        return;
      }
      await routeAfterOtp();
    } catch {
      fail("auth.networkError");
    }
  }

  // Ask the database who this is (as the verified user) and branch. A failure
  // leaves the user signed in on a retry screen — never on a guessed route.
  async function routeAfterOtp() {
    setLoading(true);
    setError(null);
    try {
      const supabase = createSupabaseBrowserClient();
      const { data: state, error: sErr } = await supabase.rpc("my_login_state");
      if (sErr) throw sErr;
      const m = loginModeFromState(state);
      setMode(m);
      await branch(m, supabase);
    } catch {
      setStage("resolve");
      fail("auth.networkError");
    }
  }

  async function branch(m, supabase) {
    if (m === "staff") return router.push("/admin");
    // A brand-new resident who arrived via a share link (/join/code?code=…) keeps
    // the code: /join/code forwards it to /onboarding as a prefill.
    if (m === "code") {
      return router.push(nextFromUrl.startsWith("/join/") ? nextFromUrl : "/onboarding");
    }
    if (m === "guardpin") {
      setStage("pin");
      setLoading(false);
      return;
    }
    if (m === "guardclaim") {
      // First guard login: link the auth user to the society_guards row so the
      // hook injects guard_society_id, then set a PIN.
      const res = await claimGuard();
      if (res?.error) throw new Error(res.error);
      await supabase.auth.refreshSession();
      setStage("setpin");
      setLoading(false);
      return;
    }
    if (m === "pin") {
      // "Forgot PIN?" (reset=1) skips the enter-PIN screen — this fresh OTP is
      // what lets the server accept a new PIN.
      setStage(reset ? "setpin" : "pin");
      setLoading(false);
      return;
    }
    if (m === "family") {
      // Turn the pre-entered family record into a real membership, then PIN.
      const res = await claimFamilyMember();
      if (res?.error) throw new Error(res.error);
      await supabase.auth.refreshSession();
      setStage("setpin");
      setLoading(false);
      return;
    }
    if (m === "authority") {
      // Link them (one membership with authority powers), then set up the
      // wings/flats or onboard as a resident (the wizard ends with the PIN).
      const res = await claimAuthority();
      if (res?.error) throw new Error(res.error);
      // The membership was created after this JWT was minted — re-mint so the
      // Auth Hook injects society_id/role before the next screen's RLS reads.
      await supabase.auth.refreshSession();
      if (res.needsSetup) return router.push("/setup/structure");
      if (res.needsFlat) return router.push("/onboarding");
      setStage("setpin");
      setLoading(false);
      return;
    }
    // setpin
    setStage("setpin");
    setLoading(false);
  }

  // --- returning: enter existing PIN (second factor) ---------------------
  async function onPin(e) {
    e.preventDefault();
    if (!/^\d{4}$/.test(pin)) return setError(t("auth.pinWrong"));
    setLoading(true);
    setError(null);
    try {
      // Checked on the server: peppered credential + per-phone lockout.
      const res = await pinLogin(pin);
      if (res?.error === "AUTH_REQUIRED") return router.push("/login");
      if (res?.error) {
        setPin("");
        return fail(...pinLoginErrorKey(res));
      }
      router.push(dest);
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
      const res = await setMyPin(pin);
      if (res?.error) return fail(...setPinErrorKey(res));
      // Family claim created the membership after this JWT was minted; re-mint so
      // society_id/role land in the token before the dashboard's RLS queries run.
      const supabase = createSupabaseBrowserClient();
      await supabase.auth.refreshSession();
      router.push(dest);
    } catch {
      fail("auth.networkError");
    }
  }

  async function onResend() {
    setOtp("");
    setError(null);
    const supabase = createSupabaseBrowserClient();
    const { error: rErr } = await supabase.auth.signInWithOtp({ phone });
    if (rErr) {
      setError(t(otpErrorKey(otpErrorCode(rErr))));
      throw rErr; // keeps ResendTimer's link tappable for a retry
    }
  }

  // --- render ------------------------------------------------------------
  if (stage === "otp") {
    return (
      <Shell
        phone={phone}
        heading={t("auth.enterOtp")}
        // The otpSentTo string already carries "+91" in all three locales, and
        // `phone` here is full E.164 — passing it raw rendered "Sent to +91
        // +919000000002". Mobile strips the prefix before interpolating
        // (apps/mobile/app/(auth)/verify.jsx:36); web now matches, so the two
        // clients honour the same contract for the shared key.
        sub={t("auth.otpSentTo", { phone: String(phone ?? "").replace(/^\+91/, "") })}
      >
        <form onSubmit={onOtp} className="flex flex-col gap-4">
          <div className="flex flex-col gap-3">
            <OtpInput value={otp} onChange={setOtp} hasError={hasError} onComplete={setOtp} />
            <ResendTimer onResend={onResend} />
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

  if (stage === "resolve") {
    // Signed in, but the next step couldn't be worked out (offline / server).
    return (
      <Shell heading={t("auth.enterOtp")} sub={null}>
        <div className="flex flex-col gap-4">
          <FormError message={error} />
          <PrimaryButton
            type="button"
            label={loading ? t("auth.verifying") : t("auth.retry", { defaultValue: "Try again" })}
            loading={loading}
            onClick={routeAfterOtp}
          />
        </div>
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
          <button
            type="button"
            onClick={() => {
              // This login's OTP is fresh, so the server accepts a new PIN
              // (setMyPin checks the session's OTP time — no ids are sent).
              setError(null);
              setPin("");
              setPin2("");
              setReset(true);
              setStage("setpin");
            }}
            className="self-center text-[13px] font-semibold text-[var(--color-brand-600)] hover:underline"
          >
            {t("auth.pinForgot")}
          </button>
        </form>
      </Shell>
    );
  }

  // setpin
  return (
    <Shell
      heading={t("auth.setPinTitle")}
      sub={
        reset
          ? t("auth.pinForgotHelp")
          : mode === "family"
            ? t("auth.familyWelcome")
            : t("auth.setPinSub")
      }
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
