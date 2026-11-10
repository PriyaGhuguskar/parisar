"use client";

// Verify OTP, then ask the database what this person needs next
// (my_login_state() as the just-verified user → lib/auth/loginMode.js):
//
//   staff     -> in
//   authority -> pick the society (if several) -> claim -> PIN -> setup wizard,
//                own-flat choice or Society Dashboard, by setup_state
//   pin       -> enter existing PIN (second factor) -> in
//   setpin    -> set a new PIN -> in           (onboarded, no PIN yet)
//   family    -> claim the flat a resident pre-entered -> set a PIN -> in
//   code      -> brand-new resident -> /onboarding (society code + join)
//
// There is one sign-in for everyone. After the OTP, a number that is on a
// society's authority list it has not claimed yet goes through the authority
// claim. Their PIN is still asked for when one is set: the authority path
// never skips the second factor.
//
// Nothing about the number is looked up before the OTP succeeds. verifyOtp
// runs on the browser client so the session cookie lands here (RESEARCH.md
// Pitfall 2). The PIN is checked and written ONLY on the server (pinLogin /
// setMyPin): the credential is peppered, so the browser cannot compute it, and
// failures are counted and locked server-side.

import { claimAuthorityForSociety, myAuthoritySocieties } from "@parisar/api-client";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { NotAuthorityStage, PickSocietyStage } from "../../../components/auth/AuthorityStages";
import {
  authorityDestination,
  claimErrorKey,
  managerDestination,
} from "../../../components/auth/authorityFlow";
import FormError from "../../../components/auth/FormError";
import OtpInput from "../../../components/auth/OtpInput";
import { EnterPinStage, SetPinStage } from "../../../components/auth/PinStages";
import PrimaryButton from "../../../components/auth/PrimaryButton";
import { pinLoginErrorKey, setPinErrorKey, weakPin } from "../../../components/auth/pinErrors";
import ResendTimer from "../../../components/auth/ResendTimer";
import Shell from "../../../components/auth/VerifyShell";
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

function VerifyForm() {
  const { t } = useTranslation(["auth", "setup-wizard"]);
  const router = useRouter();
  const params = useSearchParams();
  const phone = params.get("phone") ?? "";
  const resetFromUrl = params.get("reset") === "1"; // came via "Forgot PIN?"
  const nextFromUrl = safeNextPath(params.get("next"), "/dashboard");
  const hasNext = Boolean(params.get("next"));

  // otp | resolve | pickSociety | notAuthority | pin | setpin
  const [stage, setStage] = useState("otp");
  const [mode, setMode] = useState(null); // decided after OTP, from the database
  const [reset, setReset] = useState(resetFromUrl); // reached setpin via "Forgot PIN?"
  const [otp, setOtp] = useState("");
  const [pin, setPin] = useState("");
  const [pin2, setPin2] = useState("");
  const [hasError, setHasError] = useState(false);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const [societies, setSocieties] = useState([]); // authority: societies to pick from
  const [authorityDest, setAuthorityDest] = useState(null); // authority: where PIN success lands
  const loginStateRef = useRef(null);

  const isGuard = mode === "guardpin" || mode === "guardclaim"; // gate-guard login
  const dest = authorityDest ?? (isGuard ? "/guard" : nextFromUrl); // where PIN success lands

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
      loginStateRef.current = state ?? null;
      const m = loginModeFromState(state);
      setMode(m);
      // One sign-in for everyone: after the OTP, check whether this verified
      // number is on a society's authority list that it has not claimed yet. If
      // so, run the authority claim; otherwise continue as a normal sign-in
      // (an authority who already claimed signs in like any member).
      if (m !== "staff") {
        const unclaimed = await unclaimedAuthoritySocieties(supabase);
        if (m === "authority" || unclaimed.length > 0) {
          await startAuthority(m, supabase, unclaimed);
          return;
        }
      }
      if ((m === "pin" || m === "setpin") && !hasNext) await preferManagerHome(state, supabase);
      await branch(m, supabase);
    } catch {
      setStage("resolve");
      fail("auth.networkError");
    }
  }

  // --- authority (docs/onboarding/API.md section 5) ----------------------
  async function unclaimedAuthoritySocieties(supabase) {
    const res = await myAuthoritySocieties(supabase);
    if (res?.error) throw new Error(res.error);
    return (res?.societies ?? []).filter((s) => !s.claimed);
  }

  async function startAuthority(m, supabase, list) {
    if (list.length === 0) {
      // my_login_state saw an authority row the new RPC does not list: keep the
      // older single-society claim working.
      if (m === "authority") return branch(m, supabase);
      setStage("notAuthority");
      setLoading(false);
      return;
    }
    if (list.length === 1) return claimSociety(list[0], supabase);
    setSocieties(list);
    setStage("pickSociety");
    setLoading(false);
  }

  async function claimSociety(society, client) {
    setLoading(true);
    setError(null);
    try {
      const supabase = client ?? createSupabaseBrowserClient();
      const res = await claimAuthorityForSociety(supabase, society.society_id);
      if (res?.error) {
        setSocieties((current) => (current.length ? current : [society]));
        setStage("pickSociety");
        return fail(claimErrorKey(res.error));
      }
      // The membership was created after this JWT was minted: re-mint so the
      // Auth Hook puts society_id and role in it before the next screen reads.
      await supabase.auth.refreshSession();
      setAuthorityDest(authorityDestination(res?.setup_state));
      // A PIN already set is still the second factor; otherwise set one now.
      setStage(loginStateRef.current?.pin_set && !reset ? "pin" : "setpin");
      setLoading(false);
    } catch {
      setSocieties((current) => (current.length ? current : [society]));
      setStage("pickSociety");
      fail("auth.networkError");
    }
  }

  // A returning manager whose society still needs setup (or who has no flat)
  // lands there after the PIN rather than on the resident home. Best effort:
  // the normal destination stands if this lookup fails.
  async function preferManagerHome(state, supabase) {
    // Only managers can have unfinished setup; skip the call for everyone else.
    if (!["secretary", "co_secretary"].includes(state?.membership?.role)) return;
    try {
      const res = await myAuthoritySocieties(supabase);
      const next = res?.error ? null : managerDestination(state, res?.societies);
      if (next) setAuthorityDest(next);
    } catch {
      // keep the normal destination
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
      if (res.needsSetup) return router.push("/setup");
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

  if (stage === "pickSociety") {
    return (
      <PickSocietyStage
        societies={societies}
        loading={loading}
        error={error}
        onPick={(society) => claimSociety(society)}
      />
    );
  }

  if (stage === "notAuthority") {
    return (
      <NotAuthorityStage
        loading={loading}
        error={error}
        onContinue={async () => {
          setLoading(true);
          setError(null);
          try {
            await branch(mode, createSupabaseBrowserClient());
          } catch {
            fail("auth.networkError");
          }
        }}
      />
    );
  }

  if (stage === "pin") {
    return (
      <EnterPinStage
        pin={pin}
        onPinChange={setPin}
        error={error}
        loading={loading}
        onSubmit={onPin}
        onForgot={() => {
          // This login's OTP is fresh, so the server accepts a new PIN
          // (setMyPin checks the session's OTP time — no ids are sent).
          setError(null);
          setPin("");
          setPin2("");
          setReset(true);
          setStage("setpin");
        }}
      />
    );
  }

  // setpin
  return (
    <SetPinStage
      sub={
        reset
          ? t("auth.pinForgotHelp")
          : mode === "family"
            ? t("auth.familyWelcome")
            : authorityDest
              ? t("setup-wizard:authLogin.setPinSub")
              : t("auth.setPinSub")
      }
      pin={pin}
      pin2={pin2}
      onPinChange={setPin}
      onPin2Change={setPin2}
      error={error}
      loading={loading}
      onSubmit={onSetPin}
    />
  );
}

export default function VerifyPage() {
  return (
    <Suspense fallback={null}>
      <VerifyForm />
    </Suspense>
  );
}
