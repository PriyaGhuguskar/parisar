// DEV-ONLY auto-login. Lets you open /dashboard (or any protected screen)
// without going through the OTP screen while reviewing the UI.
//
// WHY a real sign-in instead of a fake user: every protected screen reads data
// through RLS, which keys off the JWT's society_id. A stubbed/fake user would
// render the shell with EVERY list empty — useless for reviewing UI. So this
// signs in as one of the seeded [auth.sms.test_otp] numbers, which short-circuit
// real SMS and accept the fixed code. You get a genuine session and real data.
//
// SAFETY:
//   - Returns 404 unless NODE_ENV === "development". It cannot run in a
//     production build, and there is no env flag to turn it on there.
//   - It only ever signs in as the seeded local test numbers, which exist purely
//     because supabase/config.toml maps them to a fixed OTP. That whole block is
//     removed before any deploy, so these accounts do not exist in production.
//   - Delete this file (and the dev branch in (protected)/layout.jsx) as part of
//     the Phase 8 production OTP swap.
//
// Personas currently seeded in the local DB (verified against auth.users +
// society_memberships — 9000000001 exists but has NO membership, so it would
// land on onboarding rather than the dashboard):
//   9000000005 → secretary     · Test Society Alpha  ← default, richest view
//   9000000007 → co_secretary  · Test Society Alpha
//   9000000006 → member        · Test Society Alpha  (member-side UI)
//
// Usage:
//   /dev-login                 → signs in as the secretary, lands on /dashboard
//   /dev-login?as=9000000006   → review the member-side UI instead
//   /dev-login?next=/community → land somewhere other than the dashboard

import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const DEV_OTP = "123456";
// Secretary of "Test Society Alpha" — the only seeded persona with an active
// membership AND the widest dashboard (all complaints, review queue, rotation).
const DEFAULT_TEST_PHONE = "9000000005";

export async function GET(request) {
  if (process.env.NODE_ENV !== "development") {
    return new NextResponse("Not found", { status: 404 });
  }

  const url = new URL(request.url);
  const digits = (url.searchParams.get("as") ?? DEFAULT_TEST_PHONE).replace(/\D/g, "").slice(-10);
  // Only the seeded local pool — never an arbitrary number.
  if (!/^90000000(0[1-9]|[12][0-9]|30)$/.test(digits)) {
    return NextResponse.json(
      { error: "dev-login only accepts the seeded test numbers 9000000001–9000000030" },
      { status: 400 },
    );
  }
  const phone = `+91${digits}`;
  // Keep the redirect internal — never bounce to an external origin.
  const nextParam = url.searchParams.get("next") ?? "/dashboard";
  const next = nextParam.startsWith("/") ? nextParam : "/dashboard";

  const supabase = await createSupabaseServerClient();

  // For [auth.sms.test_otp] numbers the code is FIXED, so verifyOtp is accepted
  // without a preceding send. Going straight to verify matters: signInWithOtp is
  // rate-limited to one request per 10s per phone, which made repeated dev logins
  // fail with "you can only request this after 10 seconds".
  let { error: verifyError } = await supabase.auth.verifyOtp({
    phone,
    token: DEV_OTP,
    type: "sms",
  });

  // Fallback for the first-ever login of a number that has no OTP on record yet:
  // request one, then verify. Tolerates the 10s throttle by reporting it clearly.
  if (verifyError) {
    const { error: sendError } = await supabase.auth.signInWithOtp({ phone });
    if (sendError) {
      return NextResponse.json(
        {
          step: "signInWithOtp",
          phone,
          error: sendError.message,
          hint: "Supabase throttles OTP requests per phone (10s). Wait a moment and reload.",
        },
        { status: 400 },
      );
    }
    ({ error: verifyError } = await supabase.auth.verifyOtp({
      phone,
      token: DEV_OTP,
      type: "sms",
    }));
  }

  if (verifyError) {
    return NextResponse.json(
      {
        step: "verifyOtp",
        phone,
        error: verifyError.message,
        hint: "Run `supabase stop && supabase start` — config.toml test_otp numbers are only read at startup.",
      },
      { status: 400 },
    );
  }

  return NextResponse.redirect(new URL(next, url.origin));
}
